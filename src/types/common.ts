// Shared dimensions used across collections (FEATURES.md §1.2).

/**
 * Every person belongs to exactly one side (FEATURES.md §0). The ids are
 * deliberately generic: weddingHQ hosts many weddings, so "shivam"/"swara" can't
 * be baked into the schema. Human-readable labels live on the tenant doc
 * (`tenant.sideA.label` / `tenant.sideB.label`) — render those, never the id.
 */
export type Side = "a" | "b";

export const SIDES: readonly Side[] = ["a", "b"] as const;

/** Both roles write this wedding's data — config, budgets, contacts, questions.
 *  "couple" adds exactly one power: inviting and removing people. Family are
 *  parents and in-laws, not untrusted users; the only thing worth gating is who
 *  gets in, which is also where privilege escalation would happen. A global
 *  admin (see `User.isAdmin`) outranks both and reaches every tenant. Enforced
 *  in firestore.rules, not just the UI. */
export type Role = "couple" | "family";
