// Allocation maths (FEATURES.md §2.6, PHASE2 Step 2).
//
// Pure functions, no Firebase, so the arithmetic is unit-tested rather than
// eyeballed in a chart. Everything is integer paise in and integer paise out —
// no division until the render edge.
//
// SCOPE: this is PLANNING only. Nothing here knows about expenses, shares or
// consumption; those arrive in Phase 4 and are computed from `aggregates/*`,
// not from these numbers.

import { toPaise, type Paise } from "@/lib/money";
import type { Side } from "@/types";

export interface AllocationHealth {
  /** The side's overall ceiling. Zero when they haven't set one yet. */
  totalPaise: Paise;
  /** Sum of that side's per-category allocations. */
  allocatedPaise: Paise;
  /**
   * total − allocated. NEGATIVE when the side has allocated more than its
   * budget. This is the number FEATURES.md §2.6 insists on showing explicitly:
   * "the unallocated remainder is the number that quietly gets eaten".
   */
  unallocatedPaise: Paise;
  /** Allocated as a percentage of the total. 0 when no total is set — an
   *  undefined percentage, not an infinite one. */
  allocatedPct: number;
  overAllocated: boolean;
  /** No ceiling set yet, so "health" is not a meaningful question. */
  noBudgetSet: boolean;
}

/** Sum a list of paise amounts. Integer addition throughout — never reduce
 *  through a float. */
export function sumPaise(amounts: readonly number[]): Paise {
  return toPaise(amounts.reduce((total, n) => total + Math.trunc(n || 0), 0));
}

export function allocationHealth(
  totalPaise: number,
  allocations: readonly { allocatedPaise: number }[],
): AllocationHealth {
  const total = toPaise(Math.trunc(totalPaise || 0));
  const allocated = sumPaise(allocations.map((a) => a.allocatedPaise));
  const unallocated = toPaise(total - allocated);

  return {
    totalPaise: total,
    allocatedPaise: allocated,
    unallocatedPaise: unallocated,
    // Guard the division: a side that hasn't set a budget yet has allocated
    // some fraction of zero, which is Infinity or NaN — either of which would
    // render as a bar of unbounded width.
    allocatedPct: total > 0 ? (allocated / total) * 100 : 0,
    overAllocated: allocated > total && total > 0,
    noBudgetSet: total <= 0,
  };
}

/** One row of the side-by-side comparison: a category with both sides' numbers
 *  against it, in the shared category colour. */
export interface CategoryComparisonRow {
  categoryId: string;
  name: string;
  colour: string;
  a: number;
  b: number;
  /** Both sides together — what the category costs the wedding overall. */
  totalPaise: number;
}

/**
 * Build the side-by-side rows in the categories' own display order, keeping
 * categories neither side has allocated to. An unallocated category showing ₹0
 * is information ("nobody has budgeted for transport"); dropping the row makes
 * that omission invisible, which is precisely the conversation this chart is
 * meant to start.
 */
export function comparisonRows(
  categories: readonly { id: string; name: string; colour: string }[],
  allocations: readonly { side: Side; categoryId: string; allocatedPaise: number }[],
): CategoryComparisonRow[] {
  return categories.map((category) => {
    const forCategory = allocations.filter((a) => a.categoryId === category.id);
    const a = sumPaise(forCategory.filter((x) => x.side === "a").map((x) => x.allocatedPaise));
    const b = sumPaise(forCategory.filter((x) => x.side === "b").map((x) => x.allocatedPaise));
    return {
      categoryId: category.id,
      name: category.name,
      colour: category.colour,
      a,
      b,
      totalPaise: a + b,
    };
  });
}
