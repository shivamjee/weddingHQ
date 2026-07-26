// POST /api/ai/compare — notes in, a reviewable suggestion out (PHASE2 Step 5b).
//
// This is the app's FIRST server-side code. Everything before it was pure
// client + Firestore rules. Two things follow from that, and both are
// deliberate:
//
//   • It is a plain Next.js Route Handler on Vercel Hobby (free). NOT a Firebase
//     Cloud Function — those need the Blaze plan, and CLAUDE.md is explicit that
//     Firebase stays on Spark.
//   • IT NEVER WRITES TO FIRESTORE. It returns a suggestion; the CLIENT writes
//     the confirmed result under the member-write rule that already exists on
//     `comparisons`. So this endpoint adds no new rules surface and no new
//     collection — the security boundary stays exactly where it was.
//
// The auth gate here exists to protect the Gemini QUOTA, not the data: an open
// endpoint is a stranger spending it. See src/lib/ai/verifyCaller.ts.

import { NextResponse } from "next/server";
import {
  MAX_INPUT_CHARS,
  aiResponseSchema,
  buildPrompt,
  coerceValue,
  RESPONSE_SCHEMA,
} from "@/lib/ai/compareSchema";
import { AiError, aiConfigured, generateJSON } from "@/lib/ai/provider";
import { AuthError, assertTenantMember, bearerToken, verifyIdToken } from "@/lib/ai/verifyCaller";
import { CRITERION_TYPES, type CriterionType } from "@/types";
import type { CriterionValue } from "@/lib/comparison";

/** Node runtime, not Edge: `jose` works on both, but Node keeps the JWKS cache
 *  warm across requests on a single instance. */
export const runtime = "nodejs";

/** GET tells the client whether the button should exist at all. Deliberately
 *  unauthenticated and deliberately a single boolean — it leaks nothing beyond
 *  "this deployment has a key", which the presence of the button would anyway. */
export async function GET() {
  return NextResponse.json({ configured: aiConfigured() });
}

interface RequestBody {
  tenantId?: unknown;
  notes?: unknown;
  criteria?: unknown;
}

export async function POST(request: Request) {
  // ---- 1. Who is calling, and may they? --------------------------------
  const authorization = request.headers.get("authorization");
  let caller;
  try {
    caller = await verifyIdToken(authorization);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "Not signed in." }, { status: err.status });
    }
    throw err;
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
  if (!tenantId) {
    return NextResponse.json({ error: "Missing wedding." }, { status: 400 });
  }

  try {
    await assertTenantMember(caller, tenantId, bearerToken(authorization));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: "You don't have access to this wedding." },
        { status: err.status },
      );
    }
    throw err;
  }

  // ---- 2. Validate the input -------------------------------------------
  const rawNotes = typeof body.notes === "string" ? body.notes : "";
  const notes = rawNotes.slice(0, MAX_INPUT_CHARS);
  const truncated = rawNotes.length > MAX_INPUT_CHARS;

  if (notes.trim().length < 10) {
    return NextResponse.json({ error: "Write a little more and try again." }, { status: 400 });
  }

  // Labels and types only — no contact details, no other options' data. Free
  // tier prompts may be used to improve the provider's models.
  const criteria = Array.isArray(body.criteria)
    ? body.criteria
        .map((c) => c as { id?: unknown; label?: unknown; type?: unknown })
        .filter(
          (c): c is { id: string; label: string; type: CriterionType } =>
            typeof c.id === "string" &&
            typeof c.label === "string" &&
            typeof c.type === "string" &&
            (CRITERION_TYPES as readonly string[]).includes(c.type),
        )
        .slice(0, 40)
    : [];

  // ---- 3. Ask the model -------------------------------------------------
  let raw: unknown;
  try {
    raw = await generateJSON(buildPrompt(notes, criteria), RESPONSE_SCHEMA);
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.status });
    }
    console.error("[ai/compare] unexpected failure:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  const parsed = aiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    // Never a partial write: if the shape is wrong, the whole suggestion is
    // discarded rather than half of it reaching the review sheet.
    console.error("[ai/compare] response failed validation:", parsed.error.issues.slice(0, 5));
    return NextResponse.json(
      { error: "The AI's answer didn't make sense. Please try again." },
      { status: 502 },
    );
  }

  // ---- 4. Coerce to storable values -------------------------------------
  const byId = new Map(criteria.map((c) => [c.id, c]));

  const values = parsed.data.values
    .map((v) => {
      const criterion = byId.get(v.criterionId);
      if (!criterion) return null; // hallucinated id
      const coerced = coerceValue(v.valueText, criterion.type, v.unitHint);
      if (!coerced) return null; // didn't parse cleanly — dropped, never guessed
      return {
        criterionId: v.criterionId,
        label: criterion.label,
        type: criterion.type,
        value: coerced.value as CriterionValue,
        unitHint: coerced.note,
        confidence: v.confidence,
        sourceText: v.sourceText ?? "",
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const existingLabels = new Set(criteria.map((c) => c.label.trim().toLowerCase()));
  const newCriteria = parsed.data.newCriteria
    // A proposed column that duplicates one already there is noise in the
    // review sheet, and accepting it would produce two near-identical rows.
    .filter((c) => !existingLabels.has(c.label.trim().toLowerCase()))
    .map((c) => {
      const coerced = c.valueText ? coerceValue(c.valueText, c.type) : null;
      return {
        label: c.label.trim(),
        type: c.type,
        weight: c.weight ?? 3,
        why: c.why,
        value: coerced ? (coerced.value as CriterionValue) : undefined,
        confidence: c.confidence ?? 0.5,
      };
    });

  return NextResponse.json({
    optionName: parsed.data.optionName,
    summary: parsed.data.summary,
    values,
    newCriteria,
    unknowns: parsed.data.unknowns,
    truncated,
  });
}
