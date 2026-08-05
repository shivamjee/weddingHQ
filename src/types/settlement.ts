import type { Timestamp } from "firebase/firestore";
import type { Paise } from "@/lib/money";

/**
 * tenants/{tenantId}/settlements/{settlementId} (FEATURES.md §2.4).
 *
 * A transfer of money BETWEEN PEOPLE, settling a balance that expenses
 * created. It is not an expense and must never appear in any budget total —
 * src/lib/expenses.ts has a named regression test for this.
 *
 * SECURITY: readable AND writable by any member, like `expenses`.
 * firestore.rules validates shape (non-negative integer paise, fromUid !=
 * toUid).
 */
export interface Settlement {
  fromUid: string;
  toUid: string;
  amountPaise: Paise;
  date: Timestamp;
  method: string; // "UPI", "cash", "bank transfer" — free text, not an enum
  note: string;
  createdBy: string; // uid
  createdAt: Timestamp;
}

export interface SettlementWithId extends Settlement {
  id: string;
}
