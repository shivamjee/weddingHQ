import type { Timestamp } from "firebase/firestore";
import type { Side } from "./common";

/** How badly they need to be there. The cumulative ladder over these three is
 *  the whole point of the guest list (FEATURES.md §4.2). Order matters — it is
 *  the order the ladder accumulates in. */
export type Tier = "must" | "should" | "if_space";

export const TIERS: readonly Tier[] = ["must", "should", "if_space"];

export const TIER_LABELS: Record<Tier, string> = {
  must: "Must invite",
  should: "Should invite",
  if_space: "If space",
};

/** Anyone may add a household as `proposed`; it counts towards every projection
 *  but is visibly not agreed. Confirming is a deliberate act (FEATURES.md §4.3) —
 *  that is what lets a parent contribute a full list without it feeling like a
 *  unilateral commitment. */
export type HouseholdStatus = "proposed" | "confirmed";

export const HOUSEHOLD_STATUSES: readonly HouseholdStatus[] = ["proposed", "confirmed"];

export const HOUSEHOLD_STATUS_LABELS: Record<HouseholdStatus, string> = {
  proposed: "Proposed",
  confirmed: "Confirmed",
};

/**
 * tenants/{tenantId}/households/{householdId} — the invitation unit
 * (FEATURES.md §4.1).
 *
 * One invitation to "Mr & Mrs Agarwal + 2 children" is one card, one delivery
 * and one follow-up call — but four plates. Both numbers are needed and they are
 * different, so tiers, per-event invitation, travel and accommodation all hang
 * here and never on a person.
 *
 * COUNTS ARE THE PLANNING NUMBER. `adultCount` / `childCount` are hand-entered
 * and authoritative; the `guests` collection is an optional subset of names that
 * may not exist at all. "Dad's colleagues, 12 people" is a complete household
 * with twelve heads and zero guest documents, and every projection in the app
 * reads these two fields — never a count of guest documents. See
 * src/lib/guests.ts, which is where that rule is actually enforced.
 *
 * SECURITY: readable AND writable by any member of the wedding. Four people —
 * the couple and both sets of parents — contribute names independently; that is
 * the design, not a concession.
 */
export interface Household {
  name: string; // "The Agarwals"
  side: Side;
  invitedBy: string; // uid — whose guest they actually are
  tier: Tier;
  status: HouseholdStatus;
  relationship: string; // "Paternal cousins", "Dad's colleagues"
  eventIds: string[]; // a colleague invited only to the reception must not land in the mehendi count
  adultCount: number; // PLANNED heads — hand-entered, authoritative
  childCount: number; // PLANNED heads — hand-entered, authoritative
  travelNeeded: boolean;
  accommodationNeeded: boolean;
  roomsNeeded: number | null;
  nightsNeeded: number | null;
  address: string; // optional until invitations are printed
  primaryPhone: string;
  /** Optional in TypeScript because documents written before this field
   *  existed have no such field; read it as `?? ""`. Powers the "Email" action
   *  link on the household card — there is no email anywhere else in the guest
   *  data model, since named guests inherit the household's contact info. */
  email?: string;
  notes: string;
  createdBy: string; // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A household document paired with its id, which the doc itself doesn't carry. */
export interface HouseholdWithId extends Household {
  id: string;
}
