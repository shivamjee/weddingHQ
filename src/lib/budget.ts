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

/**
 * The allocations that count towards a total: category-level ones only.
 *
 * A `budgets` document with an `eventId` is a breakdown *inside* its category's
 * amount ("of Decor's ₹2L, ₹50k is Mehendi"), not an additional amount. Every
 * total in this module goes through here, so itemising a category can never
 * change what that category — or the side — is shown as having allocated.
 */
function categoryLevel<T extends { eventId?: string | null }>(allocations: readonly T[]): T[] {
  return allocations.filter((a) => !a.eventId);
}

export function allocationHealth(
  totalPaise: number,
  allocations: readonly { allocatedPaise: number; eventId?: string | null }[],
): AllocationHealth {
  const total = toPaise(Math.trunc(totalPaise || 0));
  // Category-level rows only. An event row is a breakdown of the category row
  // above it, so counting both would inflate the side's allocated total — the
  // health bar would show a side over budget purely for having itemised. The
  // filter lives here, not in the callers, because there are five of them.
  const allocated = sumPaise(categoryLevel(allocations).map((a) => a.allocatedPaise));
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
  icon?: string;
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
  categories: readonly { id: string; name: string; colour: string; icon?: string }[],
  allocations: readonly {
    side: Side;
    categoryId: string;
    eventId?: string | null;
    allocatedPaise: number;
  }[],
): CategoryComparisonRow[] {
  // Category-level only — an event breakdown is inside its category's amount,
  // not on top of it. See categoryLevel().
  const rows = categoryLevel(allocations);
  return categories.map((category) => {
    const forCategory = rows.filter((a) => a.categoryId === category.id);
    const a = sumPaise(forCategory.filter((x) => x.side === "a").map((x) => x.allocatedPaise));
    const b = sumPaise(forCategory.filter((x) => x.side === "b").map((x) => x.allocatedPaise));
    return {
      categoryId: category.id,
      name: category.name,
      colour: category.colour,
      icon: category.icon,
      a,
      b,
      totalPaise: a + b,
    };
  });
}

/** One event's slice of a category's ceiling, in the events' display order. */
export interface EventSlice {
  eventId: string;
  name: string;
  colour: string;
  icon?: string;
  allocatedPaise: number;
}

export interface EventBreakdown {
  perEvent: EventSlice[];
  /** Sum of the event slices. */
  assignedPaise: Paise;
  /** ceiling − assigned. Negative when the events overshoot the category. */
  unassignedPaise: Paise;
  /** True when the event slices add up to more than the category's own amount. */
  over: boolean;
  /** Any event slice actually recorded? Drives whether the row expands at all. */
  any: boolean;
}

/**
 * Split one side's amount for one category across the events, for the expandable
 * row on the Budget screen (QA #4: "I should be able to add and view Mehendi
 * decor separately, but at the same time view the overall decor budget").
 *
 * The category amount is the CEILING and stays authoritative: this reports how
 * much of it has been itemised and how much is still unassigned. Nothing here
 * changes the category's total, so a wedding that never itemises sees exactly
 * the numbers it saw before.
 *
 * `over` is reported, not prevented. firestore.rules cannot check a sum across
 * documents without a read per write, so the ceiling is enforced by showing the
 * overshoot rather than by refusing the write.
 * ponytail: client-enforced ceiling; a get()-per-write rule if it ever matters.
 */
export function eventBreakdown(
  side: Side,
  categoryId: string,
  ceilingPaise: number,
  events: readonly { id: string; name: string; colour: string; icon?: string }[],
  allocations: readonly {
    side: Side;
    categoryId: string;
    eventId?: string | null;
    allocatedPaise: number;
  }[],
): EventBreakdown {
  const mine = allocations.filter(
    (a) => a.side === side && a.categoryId === categoryId && a.eventId,
  );
  const perEvent = events.map((event) => ({
    eventId: event.id,
    name: event.name,
    colour: event.colour,
    icon: event.icon,
    allocatedPaise: sumPaise(
      mine.filter((a) => a.eventId === event.id).map((a) => a.allocatedPaise),
    ),
  }));
  const assigned = sumPaise(perEvent.map((e) => e.allocatedPaise));

  return {
    perEvent,
    assignedPaise: assigned,
    unassignedPaise: toPaise(Math.trunc(ceilingPaise || 0) - assigned),
    over: assigned > Math.trunc(ceilingPaise || 0),
    any: perEvent.some((e) => e.allocatedPaise > 0),
  };
}
