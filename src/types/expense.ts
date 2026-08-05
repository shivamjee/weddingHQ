import type { Timestamp } from "firebase/firestore";
import type { Paise } from "@/lib/money";

/** estimated → committed → paid (PHASE4.md § The three states). Only `paid`
 *  counts toward balances; all three count toward budget consumption and the
 *  projected total, as distinct segments. */
export type ExpenseStatus = "estimated" | "committed" | "paid";

export const EXPENSE_STATUSES: readonly ExpenseStatus[] = ["estimated", "committed", "paid"];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  estimated: "Estimated",
  committed: "Committed",
  paid: "Paid",
};

export type SplitMode = "equal" | "exact" | "percentage" | "single";

export const SPLIT_MODES: readonly SplitMode[] = ["equal", "exact", "percentage", "single"];

export const SPLIT_MODE_LABELS: Record<SplitMode, string> = {
  equal: "Split equally",
  exact: "Exact amounts",
  percentage: "Percentage",
  single: "One person",
};

/** Who SHOULD bear the cost, not who paid it — see `Expense.paidBy`. Shares
 *  must sum to `amountPaise` exactly (src/lib/expenses.ts `validateShares`). */
export interface Share {
  uid: string;
  amountPaise: Paise;
}

/**
 * tenants/{tenantId}/expenses/{expenseId} (FEATURES.md §2.2, PHASE4.md).
 *
 * `paidBy` and `shares` are INDEPENDENT — this is the core of the feature.
 * `paidBy` is who fronted the money; `shares` is who should bear it. Budget
 * consumption and category charges are computed from `shares`, never from
 * `amountPaise` or `paidBy` — charging the payer's side the full amount is
 * the single most likely bug in this app (src/lib/expenses.ts).
 *
 * SECURITY: readable AND writable by any member of the wedding, including
 * delete — consistent with every other planning collection (contacts,
 * questions, budgets, guests). firestore.rules validates shape (status enum,
 * non-negative integer paise, splitMode enum); see the `expenses` block.
 */
export interface Expense {
  description: string;
  amountPaise: Paise; // total
  status: ExpenseStatus;
  categoryId: string;
  eventId: string | null; // null for non-event costs (invitations, jewellery)
  date: Timestamp; // when spent or due, not when recorded
  paidBy: string | null; // uid; null while still estimated
  splitMode: SplitMode;
  shares: Share[]; // who SHOULD bear it; must sum to amountPaise
  notes: string;
  /** Always null until Storage is enabled (PHASE4.md § Out of scope — a
   *  deliberate later decision, not an oversight). */
  receiptURL: string | null;
  createdBy: string; // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ExpenseWithId extends Expense {
  id: string;
}
