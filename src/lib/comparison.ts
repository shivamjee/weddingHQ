// Comparison-table logic (FEATURES.md §3.2, PHASE2 Step 5).
//
// Pure functions, no Firebase and no React, so "which venue wins on price" is
// unit-tested rather than eyeballed in a table. The rendering is elsewhere.

import { formatINR, toPaise } from "@/lib/money";
import type { Criterion, CriterionType } from "@/types";

export type CriterionValue = string | number | boolean;

/**
 * Which direction wins for a criterion.
 *
 * The type-based default is what FEATURES.md §3.2 describes — lowest money,
 * highest rating — and an explicit `betterIs` overrides it. That override
 * exists because "Distance (km)" is a plain number where LOWER is better, and
 * marking the farthest venue as best is the kind of visibly wrong answer that
 * makes people stop trusting the highlight altogether.
 */
export function betterDirection(criterion: Criterion): "higher" | "lower" | null {
  if (criterion.betterIs) return criterion.betterIs;
  switch (criterion.type) {
    case "money":
      return "lower";
    case "number":
    case "rating":
      return "higher";
    // Text has no ordering, and "has parking: yes" is not universally better
    // than "no" — the label would have to say so, and it might not.
    default:
      return null;
  }
}

/** A criterion's value as a number, or null when it isn't comparable. Missing
 *  and blank both give null: a criterion added after an option was created is
 *  BLANK on it, and blank must never be treated as zero (which would win every
 *  "lowest price" comparison). */
export function numericValue(value: CriterionValue | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The ids of the options holding the winning value for one criterion. A set,
 * not a single id, because a tie should mark every option that ties rather than
 * silently picking the first.
 *
 * Returns an empty set when the criterion has no ordering, or when fewer than
 * two options actually have a value — "best of one" is not information.
 */
export function bestOptionIds(
  criterion: Criterion,
  options: readonly { id: string; values: Record<string, CriterionValue> }[],
): Set<string> {
  const direction = betterDirection(criterion);
  if (!direction) return new Set();

  const scored = options
    .map((o) => ({ id: o.id, n: numericValue(o.values?.[criterion.id]) }))
    .filter((o): o is { id: string; n: number } => o.n !== null);

  if (scored.length < 2) return new Set();

  const best = scored.reduce(
    (acc, o) => (direction === "lower" ? Math.min(acc, o.n) : Math.max(acc, o.n)),
    scored[0].n,
  );
  return new Set(scored.filter((o) => o.n === best).map((o) => o.id));
}

export interface OptionScore {
  optionId: string;
  /** 0-100. Null when there was nothing comparable to score on. */
  score: number | null;
}

/**
 * Optional weighted score (FEATURES.md §3.2 — "kept visually secondary to the
 * raw numbers").
 *
 * Each orderable criterion is normalised to 0-1 across the options that have a
 * value for it (best = 1, worst = 0), weighted, and averaged. An option missing
 * a value simply doesn't score on that criterion rather than scoring zero —
 * otherwise the option nobody has finished filling in always looks worst, which
 * says something about the data entry, not the venue.
 */
export function weightedScores(
  criteria: readonly Criterion[],
  options: readonly { id: string; values: Record<string, CriterionValue> }[],
): OptionScore[] {
  const orderable = criteria.filter((c) => betterDirection(c) !== null);

  const ranges = new Map<string, { min: number; max: number }>();
  for (const c of orderable) {
    const numbers = options
      .map((o) => numericValue(o.values?.[c.id]))
      .filter((n): n is number => n !== null);
    if (numbers.length > 0) {
      ranges.set(c.id, { min: Math.min(...numbers), max: Math.max(...numbers) });
    }
  }

  return options.map((option) => {
    let weighted = 0;
    let totalWeight = 0;

    for (const c of orderable) {
      const range = ranges.get(c.id);
      const value = numericValue(option.values?.[c.id]);
      if (!range || value === null) continue;

      const span = range.max - range.min;
      // Every option scoring identically means the criterion doesn't
      // discriminate between them: full marks all round, and — importantly —
      // BEFORE the direction flip. Normalising to 1 and then inverting for a
      // "lower is better" criterion would turn full marks into zero.
      const oriented =
        span === 0
          ? 1
          : betterDirection(c) === "lower"
            ? (range.max - value) / span
            : (value - range.min) / span;
      const weight = Math.max(1, Math.min(5, c.weight || 3));

      weighted += oriented * weight;
      totalWeight += weight;
    }

    return {
      optionId: option.id,
      score: totalWeight === 0 ? null : Math.round((weighted / totalWeight) * 100),
    };
  });
}

/** Render one value for display. Money arrives as integer paise and is
 *  formatted through src/lib/money.ts, never ad-hoc. */
export function formatValue(value: CriterionValue | undefined, type: CriterionType): string {
  if (value === undefined || value === null || value === "") return "—";
  switch (type) {
    case "money": {
      const n = numericValue(value);
      return n === null ? "—" : formatINR(toPaise(Math.round(n)));
    }
    case "boolean":
      return value ? "Yes" : "No";
    case "rating": {
      const n = numericValue(value);
      return n === null ? "—" : `${n} / 5`;
    }
    default:
      return String(value);
  }
}

/** A stable, readable criterion id from its label, unique within the table.
 *  Criterion ids key into every option's `values`, so they must never change
 *  once created — renaming a criterion keeps its id. */
export function criterionId(label: string, existing: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || `c-${Math.random().toString(36).slice(2, 8)}`;
  if (!existing.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    if (!existing.includes(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Editable starting criteria for a venue comparison (PHASE2 Step 5). These are
 * the questions people wish they'd asked, not an exhaustive list — every one of
 * them can be renamed, reweighted or deleted, and Step 5b's AI assist exists
 * precisely because the criteria that matter usually aren't on this list.
 */
export const VENUE_SEED_CRITERIA: Criterion[] = [
  { id: "capacity", label: "Capacity", type: "number", weight: 5, source: "seed" },
  { id: "per-plate", label: "Per-plate cost", type: "money", weight: 5, source: "seed" },
  { id: "rental", label: "Rental cost", type: "money", weight: 4, source: "seed" },
  {
    id: "in-house-catering",
    label: "In-house catering required",
    type: "boolean",
    weight: 3,
    source: "seed",
  },
  { id: "parking", label: "Parking (cars)", type: "number", weight: 3, source: "seed" },
  { id: "ac", label: "Air conditioned", type: "boolean", weight: 3, source: "seed" },
  {
    id: "distance",
    label: "Distance (km)",
    type: "number",
    weight: 2,
    source: "seed",
    // The reason betterIs exists — nearer is better.
    betterIs: "lower",
  },
  { id: "dates", label: "Available dates", type: "text", weight: 4, source: "seed" },
];
