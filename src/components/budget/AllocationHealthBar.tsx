"use client";

// Allocation health for one side (FEATURES.md §2.6): total budget against the
// sum of that side's category allocations, as ONE bar with the unallocated
// remainder shown explicitly rather than left to be inferred.
//
// WHY NOT RECHARTS: the rest of this screen uses Recharts, as PHASE2 specifies,
// but this particular figure is a single stacked strip with no axes, no
// tooltip and no category labels. A plain flex row renders it exactly, at any
// width, with real text in the DOM for a screen reader — where Recharts would
// add a chart runtime and a measurement pass to draw one rectangle. The
// category-by-category chart next to it IS Recharts, per the spec.
//
// The over-allocated case is the one that matters. Instead of clipping the bar
// at 100%, the strip is scaled to whichever is larger — budget or allocations —
// and a marker shows where the budget line falls. Someone ₹2L over sees the
// overshoot, not a full bar that looks identical to being exactly on budget.

import { FALLBACK_COLOUR } from "@/lib/colours";
import { formatCompact, formatINR, toPaise } from "@/lib/money";
import type { AllocationHealth } from "@/lib/budget";

export interface HealthSegment {
  categoryId: string;
  name: string;
  colour: string;
  allocatedPaise: number;
}

export function AllocationHealthBar({
  health,
  segments,
  label,
}: {
  health: AllocationHealth;
  /** Per-category slices, in display order, so the strip also shows WHERE the
   *  budget is going. Categories with nothing allocated contribute no width. */
  segments: HealthSegment[];
  label: string;
}) {
  const { totalPaise, allocatedPaise, unallocatedPaise, overAllocated, noBudgetSet } = health;

  // The strip is scaled to the larger of the two, so an over-allocation extends
  // past the budget marker instead of being clipped invisibly at the end.
  const scale = Math.max(totalPaise, allocatedPaise, 1);
  const pct = (paise: number) => `${Math.max(0, (paise / scale) * 100)}%`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-stone-800">{label}</span>
        <span className="text-sm text-stone-500">
          {noBudgetSet ? "No budget set" : formatINR(toPaise(totalPaise))}
        </span>
      </div>

      <div className="relative">
        <div
          className="flex h-5 w-full overflow-hidden rounded-full bg-stone-100"
          role="img"
          aria-label={
            noBudgetSet
              ? `${label}: no total budget set; ${formatINR(toPaise(allocatedPaise))} allocated`
              : `${label}: ${formatINR(toPaise(allocatedPaise))} allocated of ${formatINR(toPaise(totalPaise))}; ` +
                (overAllocated
                  ? `over by ${formatINR(toPaise(-unallocatedPaise))}`
                  : `${formatINR(toPaise(unallocatedPaise))} unallocated`)
          }
        >
          {segments
            .filter((s) => s.allocatedPaise > 0)
            .map((s) => (
              <div
                key={s.categoryId}
                style={{
                  width: pct(s.allocatedPaise),
                  backgroundColor: s.colour || FALLBACK_COLOUR,
                }}
                title={`${s.name}: ${formatINR(toPaise(s.allocatedPaise))}`}
              />
            ))}
        </div>

        {/* Where the budget line falls, drawn only when it's inside the strip —
            i.e. only when allocations have run past it. */}
        {overAllocated ? (
          <div
            className="absolute inset-y-0 w-0.5 bg-stone-900"
            style={{ left: pct(totalPaise) }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <span className="text-stone-500">
          <strong className="font-semibold text-stone-700">
            {formatINR(toPaise(allocatedPaise))}
          </strong>{" "}
          allocated
        </span>
        {noBudgetSet ? (
          <span className="text-stone-400">Set a total to see what&rsquo;s left.</span>
        ) : overAllocated ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
            Over by {formatINR(toPaise(-unallocatedPaise))}
          </span>
        ) : (
          <span className="text-stone-500">
            <strong className="font-semibold text-stone-700">
              {formatINR(toPaise(unallocatedPaise))}
            </strong>{" "}
            still unallocated
          </span>
        )}
        {!noBudgetSet ? (
          <span className="ml-auto text-stone-400">
            {Math.round(health.allocatedPct)}% of budget
          </span>
        ) : null}
      </div>

      {/* Compact figures repeated for the chart-averse: the two numbers people
          actually quote at each other. */}
      <p className="sr-only">
        {formatCompact(toPaise(allocatedPaise))} of {formatCompact(toPaise(totalPaise))}
      </p>
    </div>
  );
}
