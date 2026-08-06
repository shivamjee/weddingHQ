// Expense maths (FEATURES.md §2.2-§2.6, PHASE4.md).
//
// Pure functions, no Firebase — same pattern as src/lib/budget.ts and
// src/lib/guests.ts. Integer paise in and out, no float anywhere.
//
// THE RULE THAT MATTERS MOST: `paidBy` and `shares` are independent. Budget
// consumption and balances are computed from `shares`, NEVER from
// `amountPaise` or `paidBy` directly. Charging the payer's side the full
// amount is the single most likely bug in this app (PHASE4.md).

import { sumPaise } from "@/lib/budget";
import { toPaise, type Paise } from "@/lib/money";
import type { Expense, ExpenseStatus, ExpenseTotalsSlice, Settlement, Share, Side, SplitMode } from "@/types";

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

/**
 * Build `shares` for one of the four modes (FEATURES.md §2.2). Integer-exact
 * per PHASE4.md's rounding rule: the returned shares always sum to
 * `amountPaise`, even when an even split doesn't divide cleanly. The
 * remainder — never more than one paisa per participant — goes to the first
 * participants in ASCENDING UID ORDER, so the same expense always produces
 * the same split, not "whoever happens to be first in the array".
 *
 * `overrides` is required for "exact" (uid → the exact amount they bear) and
 * "percentage" (uid → their percentage, 0-100); ignored for "equal"/"single".
 */
export function splitShares(
  amountPaise: Paise,
  mode: SplitMode,
  participantUids: readonly string[],
  overrides: Record<string, number> = {},
): Share[] {
  if (participantUids.length === 0) return [];

  if (mode === "single") {
    return [{ uid: participantUids[0], amountPaise }];
  }

  if (mode === "exact") {
    // Typed directly by the person entering the expense — not redistributed.
    // validateShares() is what refuses a save that doesn't sum correctly.
    return participantUids.map((uid) => ({
      uid,
      amountPaise: toPaise(Math.trunc(overrides[uid] || 0)),
    }));
  }

  const raw =
    mode === "equal"
      ? participantUids.map(() => Math.floor(amountPaise / participantUids.length))
      : participantUids.map((uid) => Math.round((amountPaise * (overrides[uid] || 0)) / 100));

  return distributeRemainder(participantUids, raw, amountPaise);
}

/** The rounding rule itself: fix `raw` (which may be a few paise short or
 *  over, from flooring an equal split or rounding a percentage) so it sums
 *  EXACTLY to `amountPaise`, by moving one paisa at a time into or out of
 *  the participants in ascending uid order. */
function distributeRemainder(
  uids: readonly string[],
  raw: readonly number[],
  amountPaise: number,
): Share[] {
  const order = uids.map((uid, i) => ({ uid, i })).sort((a, b) => a.uid.localeCompare(b.uid));
  const adjusted = [...raw];
  const remainder = amountPaise - raw.reduce((sum, n) => sum + n, 0);
  const step = remainder >= 0 ? 1 : -1;
  for (let k = 0; k < Math.abs(remainder); k++) {
    adjusted[order[k % order.length].i] += step;
  }
  return uids.map((uid, i) => ({ uid, amountPaise: toPaise(adjusted[i]) }));
}

/**
 * The one guard every expense write goes through (Step 1). Shares must sum
 * EXACTLY to `amountPaise`, be non-negative integers, and name each
 * participant at most once. The rules block enforces the same thing
 * server-side where it can (see firestore.rules `expenses`).
 */
export function validateShares(amountPaise: number, shares: readonly Share[]): boolean {
  if (shares.length === 0) return false;
  if (shares.some((s) => !Number.isInteger(s.amountPaise) || s.amountPaise < 0)) return false;
  if (new Set(shares.map((s) => s.uid)).size !== shares.length) return false;
  return sumPaise(shares.map((s) => s.amountPaise)) === Math.trunc(amountPaise || 0);
}

// ---------------------------------------------------------------------------
// Consumption — the aggregates/expenseTotals builder
// ---------------------------------------------------------------------------

type MutableSlice = { estimatedPaise: number; committedPaise: number; paidPaise: number };

function newSlice(): MutableSlice {
  return { estimatedPaise: 0, committedPaise: 0, paidPaise: 0 };
}

function bucketField(status: ExpenseStatus): keyof MutableSlice {
  if (status === "estimated") return "estimatedPaise";
  if (status === "committed") return "committedPaise";
  return "paidPaise";
}

function brandSlice(s: MutableSlice): ExpenseTotalsSlice {
  return {
    estimatedPaise: toPaise(s.estimatedPaise),
    committedPaise: toPaise(s.committedPaise),
    paidPaise: toPaise(s.paidPaise),
  };
}

type ExpenseForTotals = Pick<Expense, "categoryId" | "eventId" | "status" | "shares" | "amountPaise">;

/**
 * Consumption per (side, category), keyed `"{side}_{categoryId}"`
 * (FEATURES.md §2.5) — built from `shares`, never `amountPaise`/`paidBy`.
 * `shares` only carries a uid, so `sideByUid` (from `memberships`) is what
 * turns "who bears it" into "which side's budget it charges". A share whose
 * uid has no known side (e.g. a removed member) is skipped rather than
 * guessed at — it can't silently land on the wrong side's numbers.
 */
export function consumptionBySideCategory(
  expenses: readonly ExpenseForTotals[],
  sideByUid: Record<string, Side>,
): Record<string, ExpenseTotalsSlice> {
  const buckets = new Map<string, MutableSlice>();
  for (const e of expenses) {
    const field = bucketField(e.status);
    for (const share of e.shares) {
      const side = sideByUid[share.uid];
      if (!side) continue;
      const key = `${side}_${e.categoryId}`;
      const slice = buckets.get(key) ?? newSlice();
      slice[field] += share.amountPaise;
      buckets.set(key, slice);
    }
  }
  const result: Record<string, ExpenseTotalsSlice> = {};
  for (const [key, slice] of buckets) result[key] = brandSlice(slice);
  return result;
}

/**
 * Consumption per (side, event), keyed `"{side}_{eventId}"` — same shares-
 * based derivation as `consumptionBySideCategory`, just bucketed by event
 * instead of category. An expense with no `eventId` (a non-event cost)
 * contributes to no bucket here, same as it's absent from `byEvent` below.
 */
export function consumptionBySideEvent(
  expenses: readonly ExpenseForTotals[],
  sideByUid: Record<string, Side>,
): Record<string, ExpenseTotalsSlice> {
  const buckets = new Map<string, MutableSlice>();
  for (const e of expenses) {
    if (!e.eventId) continue;
    const field = bucketField(e.status);
    for (const share of e.shares) {
      const side = sideByUid[share.uid];
      if (!side) continue;
      const key = `${side}_${e.eventId}`;
      const slice = buckets.get(key) ?? newSlice();
      slice[field] += share.amountPaise;
      buckets.set(key, slice);
    }
  }
  const result: Record<string, ExpenseTotalsSlice> = {};
  for (const [key, slice] of buckets) result[key] = brandSlice(slice);
  return result;
}

/**
 * The full `aggregates/expenseTotals` document (minus `updatedAt`, stamped
 * by the caller with `serverTimestamp()` — same shape as
 * `guestTotalsFrom()` in src/lib/guests.ts). `byEvent` and `bySide` use
 * `amountPaise` directly rather than re-deriving from `shares`: since
 * `validateShares` guarantees `sum(shares) === amountPaise`, the two are
 * always equal, and neither dimension needs the side-per-uid lookup.
 * `bySide` is rolled up FROM `bySideCategory` (never recomputed separately)
 * so the two can never drift apart. `bySideEvent`, unlike `byEvent`, DOES go
 * through the side-per-uid lookup — it exists specifically so a single
 * side's view can show a per-event breakdown, which `byEvent` (combined
 * across both sides) can't answer.
 */
export function expenseTotalsFrom(
  expenses: readonly ExpenseForTotals[],
  sideByUid: Record<string, Side>,
): {
  bySideCategory: Record<string, ExpenseTotalsSlice>;
  byEvent: Record<string, ExpenseTotalsSlice>;
  bySideEvent: Record<string, ExpenseTotalsSlice>;
  bySide: Record<Side, ExpenseTotalsSlice>;
} {
  const bySideCategory = consumptionBySideCategory(expenses, sideByUid);
  const bySideEvent = consumptionBySideEvent(expenses, sideByUid);

  const eventBuckets = new Map<string, MutableSlice>();
  for (const e of expenses) {
    if (!e.eventId) continue;
    const field = bucketField(e.status);
    const slice = eventBuckets.get(e.eventId) ?? newSlice();
    slice[field] += e.amountPaise;
    eventBuckets.set(e.eventId, slice);
  }
  const byEvent: Record<string, ExpenseTotalsSlice> = {};
  for (const [key, slice] of eventBuckets) byEvent[key] = brandSlice(slice);

  const bySide: Record<Side, MutableSlice> = { a: newSlice(), b: newSlice() };
  for (const [key, slice] of Object.entries(bySideCategory)) {
    const side = key.slice(0, 1) as Side;
    if (side !== "a" && side !== "b") continue;
    bySide[side].estimatedPaise += slice.estimatedPaise;
    bySide[side].committedPaise += slice.committedPaise;
    bySide[side].paidPaise += slice.paidPaise;
  }

  return {
    bySideCategory,
    byEvent,
    bySideEvent,
    bySide: { a: brandSlice(bySide.a), b: brandSlice(bySide.b) },
  };
}

/** committed + estimated + paid — PHASE4.md's "the headline" projected
 *  total. Never includes the category's `budgets` allocation itself, which
 *  is the ceiling being projected against, not a fourth thing being spent. */
export function projectedTotalPaise(slice: ExpenseTotalsSlice): Paise {
  return toPaise(slice.estimatedPaise + slice.committedPaise + slice.paidPaise);
}

// ---------------------------------------------------------------------------
// Balances — who owes whom
// ---------------------------------------------------------------------------

type ExpenseForBalances = Pick<Expense, "status" | "paidBy" | "amountPaise" | "shares">;
type SettlementForBalances = Pick<Settlement, "fromUid" | "toUid" | "amountPaise">;

/**
 * Net paise per uid, from `paid`-status expenses and settlements only
 * (FEATURES.md §2.4) — an `estimated`/`committed` expense has no money
 * moved yet, so it cannot create or resolve a debt.
 *
 * Per uid: `+amountPaise` for each expense they paid, `-share.amountPaise`
 * for each share they bear, `+amountPaise` for each settlement they SENT,
 * `-amountPaise` for each settlement they RECEIVED. Positive = owed;
 * negative = owing. A settlement never touches an expense field and never
 * appears in `expenseTotalsFrom()` above — it only ever adjusts this ledger.
 */
export function balances(
  expenses: readonly ExpenseForBalances[],
  settlements: readonly SettlementForBalances[],
): Record<string, Paise> {
  const net: Record<string, number> = {};
  const add = (uid: string, delta: number) => {
    net[uid] = (net[uid] ?? 0) + delta;
  };

  for (const e of expenses) {
    if (e.status !== "paid" || !e.paidBy) continue;
    add(e.paidBy, e.amountPaise);
    for (const s of e.shares) add(s.uid, -s.amountPaise);
  }
  for (const s of settlements) {
    add(s.fromUid, s.amountPaise);
    add(s.toUid, -s.amountPaise);
  }

  const result: Record<string, Paise> = {};
  for (const [uid, paise] of Object.entries(net)) result[uid] = toPaise(paise);
  return result;
}

export interface Transfer {
  fromUid: string;
  toUid: string;
  amountPaise: Paise;
}

/**
 * Simplify a net-balance ledger to the minimum number of pairwise transfers,
 * for the "Shivam → Swara's dad: ₹1,50,000" sentences (FEATURES.md §2.4).
 *
 * ponytail: greedy, largest creditor against largest debtor, repeat. Not
 * provably the minimum transfer count in every possible ledger — that's a
 * harder combinatorial problem — but correct (nets to zero) and plenty good
 * at this app's scale (a handful of people). Revisit only if this wedding's
 * ledger ever has enough participants for the difference to matter.
 */
export function simplifyDebts(net: Readonly<Record<string, Paise>>): Transfer[] {
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([uid, amountPaise]) => ({ uid, remaining: amountPaise as number }))
    .sort((a, b) => b.remaining - a.remaining);
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([uid, amountPaise]) => ({ uid, remaining: -amountPaise as number }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.remaining, d.remaining);
    if (amount > 0) transfers.push({ fromUid: d.uid, toUid: c.uid, amountPaise: toPaise(amount) });
    c.remaining -= amount;
    d.remaining -= amount;
    if (c.remaining === 0) ci++;
    if (d.remaining === 0) di++;
  }
  return transfers;
}
