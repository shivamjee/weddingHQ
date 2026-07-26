import type { Timestamp } from "firebase/firestore";

/** The five value types a criterion can hold (FEATURES.md §3.2). Deliberately
 *  closed: the AI assist in Step 5b may only propose criteria using these, and
 *  anything else is dropped server-side. */
export type CriterionType = "text" | "number" | "money" | "rating" | "boolean";

export const CRITERION_TYPES: readonly CriterionType[] = [
  "text",
  "number",
  "money",
  "rating",
  "boolean",
];

export const CRITERION_TYPE_LABELS: Record<CriterionType, string> = {
  text: "Text",
  number: "Number",
  money: "Money",
  rating: "Rating (1-5)",
  boolean: "Yes / no",
};

/** Where a criterion came from. `"ai"` renders with a visible marker until a
 *  human edits it — an unverified guess must never look like something someone
 *  confirmed on a call (PHASE2 Step 5b). */
export type ValueSource = "seed" | "human" | "ai";

export interface Criterion {
  id: string;
  label: string;
  type: CriterionType;
  /** 1-5, default 3. Only used by the optional weighted score, which is kept
   *  visually secondary to the raw numbers. */
  weight: number;
  source: ValueSource;
  /**
   * Which direction wins when "highlight best" is on.
   *
   * BEYOND FEATURES.md §3.2's field list, and deliberately so. Deriving it from
   * `type` alone (money → lowest, number → highest) marks the FARTHEST venue as
   * best on a "Distance (km)" criterion — a visibly wrong answer that would
   * teach people to distrust the highlight entirely. Optional, so every existing
   * criterion keeps the type-based default; see betterDirection() in
   * src/lib/comparison.ts.
   */
  betterIs?: "higher" | "lower";
}

/**
 * tenants/{tenantId}/comparisons/{comparisonId} — one comparison table
 * (FEATURES.md §3.2). Generic by design: the same screen serves venues,
 * caterers and photographers. Building it venue-specific means building it
 * three more times.
 *
 * SECURITY: member-read and member-write — comparing vendors is collaborative.
 */
export interface Comparison {
  name: string; // "Wedding venues", "Caterers"
  criteria: Criterion[];
  categoryId: string | null;
  createdBy: string; // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ComparisonWithId extends Comparison {
  id: string;
}

export type OptionStatus = "considering" | "shortlisted" | "rejected" | "booked";

export const OPTION_STATUSES: readonly OptionStatus[] = [
  "considering",
  "shortlisted",
  "rejected",
  "booked",
];

export const OPTION_STATUS_LABELS: Record<OptionStatus, string> = {
  considering: "Considering",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  booked: "Booked",
};

/** Provenance for one value. Kept in a separate map from `values` so every
 *  existing reader — table, cards, highlight-best — stays untouched. An absent
 *  entry means a human typed it. */
export interface ValueMeta {
  source: "human" | "ai";
  /** 0-1, as reported by the model. Only meaningful when source == "ai". */
  confidence?: number;
  aiAt?: Timestamp;
}

/**
 * tenants/{tenantId}/comparisons/{comparisonId}/options/{optionId} — one thing
 * being compared: a venue, a caterer.
 *
 * `values` is keyed by criterion id. A criterion added later is simply ABSENT
 * from older options, which renders as blank — never as a zero or a guess.
 */
export interface ComparisonOption {
  name: string; // "Taj Palace"
  contactId: string | null;
  values: Record<string, string | number | boolean>;
  valueMeta: Record<string, ValueMeta>;
  /** Short prose description; human-written, or AI-suggested and confirmed. */
  summary: string;
  notes: string;
  /** Firebase Storage is NOT enabled until Phase 6 — this holds pasted external
   *  URLs only. There is no upload anywhere in this phase. */
  photoURLs: string[];
  status: OptionStatus;
  createdBy: string; // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ComparisonOptionWithId extends ComparisonOption {
  id: string;
}
