import type { Timestamp } from "firebase/firestore";

/** Which plate they eat. Kept off the household's counts on purpose — the
 *  household's `adultCount`/`childCount` are the planning numbers and are not
 *  derived from these (FEATURES.md §4.1). */
export type AgeGroup = "adult" | "child" | "infant";

export const AGE_GROUPS: readonly AgeGroup[] = ["adult", "child", "infant"];

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  adult: "Adult",
  child: "Child",
  infant: "Infant",
};

/**
 * tenants/{tenantId}/guests/{guestId} — a named person inside a household
 * (FEATURES.md §4.1).
 *
 * TOP-LEVEL, deliberately NOT a subcollection of the household. Nesting would
 * make every cross-cutting Phase 6 question ("all vegetarians attending the
 * sangeet", "everyone who hasn't replied") a collectionGroup query, which in
 * Firestore matches that collection name at every path depth in the DATABASE —
 * including other weddings. Securing that needs `match /{path=**}/guests/…` plus
 * a `tenantId ==` filter on every query, which is exactly the forgettable-filter
 * model CLAUDE.md § Multi-tenancy exists to avoid. Top-level keeps isolation a
 * path prefix and gets an ordinary rules block. Moving someone between
 * households also becomes a field update rather than delete-and-recreate.
 *
 * Names are OPTIONAL DETAIL: a household may have twelve planned heads and no
 * guest documents at all. Naming someone changes no count.
 *
 * Phase 6 adds `rsvp { [eventId]: … }` and `seat` here as plain fields — no
 * restructuring, which is the entire reason for the shape above. They are not
 * declared now; a field nothing writes is just a dead screen waiting to happen.
 *
 * SECURITY: readable AND writable by any member of the wedding, same as the
 * household it belongs to.
 */
export interface Guest {
  householdId: string; // → households/{householdId}
  name: string;
  ageGroup: AgeGroup;
  dietary: string; // optional until the caterer asks
  notes: string;
  createdBy: string; // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A guest document paired with its id, which the doc itself doesn't carry. */
export interface GuestWithId extends Guest {
  id: string;
}
