// The contract with the model for the comparison assist (PHASE2 Step 5b), and
// the server-side coercion of its answers into values this app will store.
//
// THREE LAYERS, deliberately:
//   1. `RESPONSE_SCHEMA` — asks Gemini for structured JSON rather than prose.
//   2. `aiResponseSchema` (zod) — validates what actually came back. A schema in
//      the request is a strong hint, not a guarantee.
//   3. `coerceValue` — turns each answer into the type the criterion declares,
//      REJECTING anything that doesn't parse cleanly rather than guessing.
//
// Layer 3 is where money is handled, and it is the one that matters most: the
// model returns a bare rupee number and a unit hint ("1800", "per plate"), and
// this converts it to integer paise through src/lib/money.ts. Nothing here ever
// calls Number() on a string like "₹1.8k" and hopes.

import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";
import { CRITERION_TYPES, type CriterionType } from "@/types";
import type { CriterionValue } from "@/lib/comparison";

/** Gemini's response schema (an OpenAPI subset — no unions, so every extracted
 *  value comes back as TEXT and is coerced per criterion below). */
export const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    optionName: { type: "string" },
    summary: { type: "string" },
    values: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterionId: { type: "string" },
          valueText: { type: "string" },
          unitHint: { type: "string" },
          confidence: { type: "number" },
          sourceText: { type: "string" },
        },
        required: ["criterionId", "valueText", "confidence"],
      },
    },
    newCriteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          type: { type: "string", enum: [...CRITERION_TYPES] },
          weight: { type: "integer" },
          why: { type: "string" },
          valueText: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["label", "type", "why"],
      },
    },
    unknowns: { type: "array", items: { type: "string" } },
  },
  required: ["optionName", "summary", "values", "newCriteria", "unknowns"],
};

export const aiResponseSchema = z.object({
  optionName: z.string().max(120),
  summary: z.string().max(1200),
  values: z
    .array(
      z.object({
        criterionId: z.string().max(64),
        valueText: z.string().max(400),
        unitHint: z.string().max(80).optional(),
        confidence: z.number().min(0).max(1),
        sourceText: z.string().max(400).optional(),
      }),
    )
    .max(40),
  newCriteria: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        // A type outside the five is dropped, not coerced — an unknown type
        // would render as nothing and score as nothing.
        type: z.enum(CRITERION_TYPES as unknown as [CriterionType, ...CriterionType[]]),
        weight: z.number().int().min(1).max(5).optional(),
        why: z.string().max(300),
        valueText: z.string().max(400).optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .max(12),
  unknowns: z.array(z.string().max(300)).max(12),
});

export type AiResponse = z.infer<typeof aiResponseSchema>;

/**
 * Turn one extracted string into a stored value of the declared type, or null
 * when it doesn't parse cleanly.
 *
 * Null means "the AI said something we can't safely store" and the field is
 * simply dropped from the suggestion. That is always better than storing a
 * plausible-looking wrong number: a person reviewing the sheet can spot a
 * missing row, but not a silently mangled one.
 */
export function coerceValue(
  valueText: string,
  type: CriterionType,
  unitHint?: string,
): { value: CriterionValue; note?: string } | null {
  const raw = valueText.trim();
  if (raw === "") return null;

  switch (type) {
    case "money": {
      // A BARE number of rupees is the contract. Anything with a symbol, a
      // "k"/"lakh" suffix or a range ("1800-2000") is rejected outright — the
      // whole point of asking for a bare number is not having to guess here.
      if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
      const rupees = Number(raw);
      if (!Number.isFinite(rupees) || rupees < 0) return null;
      return { value: rupeesToPaise(rupees), note: unitHint?.trim() || undefined };
    }

    case "number": {
      if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? { value: n, note: unitHint?.trim() || undefined } : null;
    }

    case "rating": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) return null;
      return { value: n };
    }

    case "boolean": {
      const lowered = raw.toLowerCase();
      if (["yes", "true", "y", "available", "included"].includes(lowered)) return { value: true };
      if (["no", "false", "n", "unavailable", "not included"].includes(lowered))
        return { value: false };
      // "maybe", "unclear", "they were cagey about it" — genuinely unknown, and
      // that belongs in `unknowns`, not as a coin-flip boolean.
      return null;
    }

    default:
      return { value: raw };
  }
}

/** Hard cap on the free-text input, per PHASE2. Truncation is surfaced to the
 *  user rather than done silently, so nobody wonders why the second half of
 *  their notes was ignored. */
export const MAX_INPUT_CHARS = 8000;

/**
 * The prompt. Kept here rather than in the route handler so the contract and
 * the instructions describing it live side by side and change together.
 *
 * PRIVACY: `criteria` carries labels and types only, and the caller sends no
 * contact details — free-tier prompts may be used to improve Google's models.
 */
export function buildPrompt(
  notes: string,
  criteria: { id: string; label: string; type: CriterionType }[],
): string {
  const criteriaList =
    criteria.length > 0
      ? criteria.map((c) => `- id "${c.id}": ${c.label} (${c.type})`).join("\n")
      : "(none yet)";

  return `You are helping a family plan a wedding in India. They keep a comparison table of options (venues, caterers, photographers) and have just written some rough notes about ONE option.

Extract structured information from the notes. Be conservative: it is far better to leave something out than to guess it.

THE TABLE'S EXISTING COLUMNS:
${criteriaList}

RULES:
- "values": only for the criterion ids listed above, and only where the notes actually say something. Use the exact id. Set "confidence" between 0 and 1, and put the phrase you took it from in "sourceText".
- MONEY must be a BARE NUMBER OF RUPEES with no symbol, no commas and no shorthand: write 1800, never "₹1,800", "1.8k" or "1800 per plate". Put "per plate", "total", "per day" etc. in "unitHint" instead. If the notes give a range or you are unsure of the unit, leave the value out and add it to "unknowns".
- NUMBER must be a bare number. RATING must be 1-5. BOOLEAN must be exactly "yes" or "no" — if the notes are vague or evasive about it, leave it out and add it to "unknowns".
- "newCriteria": things the notes discuss that have NO column yet and would be worth comparing across every option. This is the most valuable part of your answer — people forget to ask about generator backup, DJ curfew, or whether an outside caterer is allowed until it is too late. Give each a short "label", one of the five types, a "weight" from 1 (minor) to 5 (decisive), and a one-sentence "why". Include its "valueText" for this option using the same rules above. Do not propose a column that duplicates an existing one.
- "summary": 2-3 plain sentences describing this option. No marketing language.
- "unknowns": specific things you could not determine that someone should go and ask. Phrase each as a question.
- "optionName": the name of the place or business, if the notes give one; otherwise an empty string.

THE NOTES:
"""
${notes}
"""`;
}
