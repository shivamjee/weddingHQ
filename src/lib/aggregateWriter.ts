"use client";

// The one writer path for both Phase 4 aggregates — recompute-and-overwrite,
// same trade as aggregates/guestTotals (src/types/guestTotals.ts), decided in
// the build plan: no runTransaction exists anywhere in this codebase, and
// this app's scale (5-15 users) doesn't need one.
//
// Called from three places after any expense OR settlement write: the
// Expenses screen, the Balances screen, and the couple-only recalculate
// button — each already holds the full (bounded) expenses + settlements
// lists in memory, so each just recomputes both documents from what it has
// and overwrites. `balancesDoc` depends on BOTH collections (a settlement
// changes who owes whom; a `paid` expense does too), which is why one
// document write happening on one screen isn't enough — every write path
// recomputes both.

import { serverTimestamp, setDoc } from "firebase/firestore";
import { balancesDoc, expenseTotalsDoc } from "@/lib/paths";
import { balances, expenseTotalsFrom } from "@/lib/expenses";
import type { ExpenseWithId, SettlementWithId, Side } from "@/types";

export async function writeExpenseAggregates(
  tenantId: string,
  expenses: readonly ExpenseWithId[],
  settlements: readonly SettlementWithId[],
  sideByUid: Record<string, Side>,
): Promise<void> {
  try {
    await Promise.all([
      setDoc(expenseTotalsDoc(tenantId), {
        ...expenseTotalsFrom(expenses, sideByUid),
        updatedAt: serverTimestamp(),
      }),
      setDoc(balancesDoc(tenantId), {
        byUid: balances(expenses, settlements),
        updatedAt: serverTimestamp(),
      }),
    ]);
  } catch (err) {
    // Best-effort: the expense/settlement write already succeeded, and the
    // next write from any screen recomputes both documents from scratch
    // anyway. Failing somebody's edit over a stale summary would be the
    // wrong trade — same reasoning as guests/page.tsx's writeAggregate.
    console.warn("[expenses] aggregate rewrite failed (self-heals on the next write):", err);
  }
}
