import type { Timestamp } from "firebase/firestore";
import type { Paise } from "@/lib/money";
import type { Side } from "./common";
import type { Tier } from "./household";

/** One bucket of the aggregate. Adults and children are kept apart because
 *  child plates price differently and FEATURES.md §4.4 asks for the split in the
 *  breakdowns. */
export interface GuestTotalsSlice {
  households: number;
  adults: number;
  children: number;
  /** adults + children — the number the ladder and the venue argue about. */
  people: number;
  projectedPaise: Paise;
}

/**
 * tenants/{tenantId}/aggregates/guestTotals — the pre-rolled headline numbers
 * (FEATURES.md §4.5).
 *
 * WHY IT EXISTS: so Home can show headcount-against-target for one document read
 * instead of reading every household. The Guests screen itself does NOT read it —
 * it already holds the full list in memory and computes from that, because every
 * count on that screen has to respect the active filters and no fixed set of
 * aggregate keys can answer "side B + tier should + sangeet".
 *
 * HOW IT IS MAINTAINED: recompute-and-overwrite, not an incremental delta. After
 * any household create/update/delete the Guests screen recomputes this whole
 * document from the list it already has (`guestTotalsFrom()` in src/lib/guests.ts)
 * and setDoc()s it. One writer path, no transaction, and any drift heals itself
 * on the next household write — an incremental counter that missed one write
 * would stay wrong forever. FEATURES.md §4.5 originally specified a transactional
 * delta; this is the same guarantee with less that can go wrong.
 *
 * NOT written on `guests` writes. Naming someone changes no count (§4.1), so the
 * aggregate cannot drift from the planning numbers.
 *
 * COST: one extra document write per household write. Negligible, and it saves
 * ~300 reads every time somebody opens Home.
 *
 * SECURITY: member read + member write, same as the households it is derived
 * from. Not shape-validated in rules: it is computed from documents the same
 * member can already write directly, so validating it would buy nothing.
 */
export interface GuestTotals {
  byTier: Record<Tier, GuestTotalsSlice>;
  bySide: Record<Side, GuestTotalsSlice>;
  /** Keyed by event id. An event nobody is invited to yet is simply absent. */
  byEvent: Record<string, GuestTotalsSlice>;
  /** Everyone, every tier, every side — what Home shows against the target. */
  overall: GuestTotalsSlice;
  /** Room block: hotels ask for this early and it is a large budget line. */
  roomsNeeded: number;
  nightsNeeded: number;
  updatedAt: Timestamp;
}

/** What happened to a household. Deletes are the reason this collection exists. */
export type GuestLogAction = "added" | "updated" | "removed" | "imported";

/**
 * tenants/{tenantId}/guestLog/{entryId} — a lightweight change log
 * (FEATURES.md §4.3).
 *
 * With four people adding and removing names independently, "who deleted my
 * aunt?" is a real conversation. `createdBy` on the household answers who added
 * it; only an append-only log answers who removed it, because the document that
 * would have carried the answer is gone.
 *
 * SECURITY: member read, member CREATE — no update, no delete, for anyone
 * including the couple and the global admin. An editable audit log is not one.
 */
export interface GuestLogEntry {
  action: GuestLogAction;
  householdName: string; // denormalised: the household may no longer exist
  householdId: string | null; // null once removed
  /** How many people the change was worth, for "removed the Agarwals (4)". */
  people: number;
  by: string; // uid
  byName: string; // denormalised so the log renders without a users/ read per row
  at: Timestamp;
}

export interface GuestLogEntryWithId extends GuestLogEntry {
  id: string;
}
