// Shared dimensions used across collections (FEATURES.md §1.2).

/**
 * Every person belongs to exactly one side (FEATURES.md §0). The ids are
 * deliberately generic: weddingHQ hosts many weddings, so "shivam"/"swara" can't
 * be baked into the schema. Human-readable labels live on the tenant doc
 * (`tenant.sideA.label` / `tenant.sideB.label`) — render those, never the id.
 */
export type Side = "a" | "b";

export const SIDES: readonly Side[] = ["a", "b"] as const;

/** "couple" can write shared config (memberships, categories, events, settings)
 *  *within their own tenant*; "family" is read-mostly. A global admin (see
 *  `User.isAdmin`) outranks both and reaches every tenant. Enforced in
 *  firestore.rules, not just the UI. */
export type Role = "couple" | "family";
