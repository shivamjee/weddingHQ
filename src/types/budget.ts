import type { Timestamp } from "firebase/firestore";
import type { Paise } from "@/lib/money";
import type { Side } from "./common";

/**
 * tenants/{tenantId}/budgets/{side}_{categoryId} — one side's planned spend for
 * one category (FEATURES.md §2.1). Ids look like `a_venue`, built by
 * `budgetAllocationId()` in src/lib/tenantIds.ts.
 *
 * Phase 2 is PLANNING only: this is what a side intends to spend, not what has
 * been spent. Nothing here is derived from expenses (Phase 4).
 *
 * The two sides allocate very differently and that is expected — one side may
 * carry most of the accommodation and catering because of guest numbers.
 *
 * SECURITY: readable by any member of the wedding (everyone sees everything,
 * FEATURES.md §0); writable only by role=="couple" or a global admin.
 */
export interface BudgetAllocation {
  side: Side;
  categoryId: string;
  allocatedPaise: Paise;
  notes: string;
  updatedAt: Timestamp;
}

/**
 * tenants/{tenantId}/budgets/_totals_{side} — one side's overall budget ceiling,
 * e.g. ₹20L for one side and ₹30L for the other.
 *
 * Deliberately a flat document in the SAME `budgets` collection rather than
 * `budgets/_totals/{side}`: the latter is a subcollection of a document and
 * would need its own rules block for no benefit. The `_totals_` id prefix is
 * what distinguishes it from an allocation, and firestore.rules validates the
 * two shapes separately.
 */
export interface BudgetTotals {
  side: Side;
  totalBudgetPaise: Paise;
  updatedAt: Timestamp;
}

/** An allocation paired with its document id. */
export interface BudgetAllocationWithId extends BudgetAllocation {
  id: string;
}
