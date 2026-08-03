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
 * SECURITY: readable AND writable by any member of the wedding (everyone sees
 * everything, FEATURES.md §0). The rules' integrity checks — id agrees with
 * fields, amounts are non-negative integer paise — are the guard here, not a role.
 */
export interface BudgetAllocation {
  side: Side;
  categoryId: string;
  /**
   * null — the CATEGORY-level amount, i.e. that category's ceiling for this
   * side. Set — an optional per-event breakdown *inside* that ceiling, e.g.
   * "of Decor's ₹2L, ₹50k is Mehendi".
   *
   * The two are a parent and its children, never peers: a category's total is
   * its own `eventId: null` amount, NOT the sum of its event rows. Summing both
   * double-counts, which is the one way this feature can silently produce wrong
   * numbers — so both `comparisonRows` and `allocationHealth` filter to
   * `eventId == null` themselves rather than trusting callers to.
   *
   * Optional in TypeScript because documents written before per-event
   * breakdowns existed have no such field; read it as `?? null`.
   */
  eventId?: string | null;
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
