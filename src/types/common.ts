// Shared dimensions used across collections (FEATURES.md §1.2).

/** Every person belongs to exactly one side (FEATURES.md §0). */
export type Side = "shivam" | "swara";

/** "couple" can write shared config (allowlist, categories, events, settings);
 *  "family" is read-mostly. Enforced in firestore.rules, not just the UI. */
export type Role = "couple" | "family";
