import type { Timestamp } from "firebase/firestore";
import type { Paise } from "@/lib/money";
import type { Side } from "./common";

/** One status bucket's paise total. Never summed together on the read side —
 *  paid/committed/estimated stay visually distinct segments (PHASE4.md § The
 *  three states); only the projected total (Budget/Home) sums all three, and
 *  it does that from these fields explicitly, not by adding a fourth field
 *  here. */
export interface ExpenseTotalsSlice {
  estimatedPaise: Paise;
  committedPaise: Paise;
  paidPaise: Paise;
}

/**
 * tenants/{tenantId}/aggregates/expenseTotals (FEATURES.md §2.5).
 *
 * Named `ExpenseTotals`, not `BudgetTotals` — `src/types/budget.ts` already
 * uses `BudgetTotals` for a side's typed ceiling (Phase 2), a different
 * document. Do not conflate the two.
 *
 * WHY IT EXISTS: so Budget and Home can show consumption-against-allocation
 * and the projected total without reading every expense.
 *
 * HOW IT IS MAINTAINED: recompute-and-overwrite, the same trade
 * `aggregates/guestTotals` makes (src/types/guestTotals.ts) and for the same
 * reason — no `runTransaction` exists anywhere in this codebase, this app's
 * scale (5-15 users) doesn't need one, and a lost incremental delta stays
 * wrong forever while a recompute heals on the next write. The expenses
 * screen holds the full bounded list (`limit(500)`, no pagination —
 * PHASE4.md build plan) after every write, so it recomputes this whole
 * document from that list (`expenseTotalsFrom()` in src/lib/expenses.ts) and
 * `setDoc`s it. Values here are keyed from `shares`, never `amountPaise` or
 * `paidBy` — see the comment on `Expense`.
 *
 * COST: one extra document write per expense write. Saves the full expense
 * list read on every Budget/Home open.
 *
 * SECURITY: member read + member write, same as `expenses`. Not
 * shape-validated in rules — computed from documents the same member can
 * already write directly.
 */
export interface ExpenseTotals {
  /** Keyed `"{side}_{categoryId}"`, e.g. `"a_decor"`. */
  bySideCategory: Record<string, ExpenseTotalsSlice>;
  /** Keyed by event id. An event with no expenses yet is simply absent. */
  byEvent: Record<string, ExpenseTotalsSlice>;
  /** Keyed `"{side}_{eventId}"`, mirroring `bySideCategory` — added Phase 4.1
   *  round 3 so Budget's per-side "Spending by event" toggle has a real
   *  per-side number to show, rather than the combined `byEvent` figure. */
  bySideEvent: Record<string, ExpenseTotalsSlice>;
  bySide: Record<Side, ExpenseTotalsSlice>;
  updatedAt: Timestamp;
}

/**
 * tenants/{tenantId}/aggregates/balances (FEATURES.md §2.4-§2.5).
 *
 * Net paise per uid across `paid` expenses and settlements: positive means
 * owed, negative means owing. Same recompute-and-overwrite maintenance as
 * `ExpenseTotals` above — computed from `balances()` in src/lib/expenses.ts
 * over the full expense + settlement lists, `setDoc`'d after every expense
 * or settlement write.
 *
 * Never merged into `ExpenseTotals` or shown on the same card as budget
 * health — "are we within budget?" and "who owes whom?" are deliberately
 * separate questions throughout this phase (PHASE4.md).
 */
export interface Balances {
  byUid: Record<string, Paise>;
  updatedAt: Timestamp;
}
