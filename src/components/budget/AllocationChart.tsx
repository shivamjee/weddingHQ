"use client";

// The side-by-side allocation comparison (FEATURES.md §2.6) — "Shivam's
// categories against Swara's, same chart, same category colours". This is the
// actual planning conversation a year out, so it is the centrepiece of the
// Budget tab.
//
// HORIZONTAL BARS, always. CLAUDE.md and FEATURES.md §2.6 both call this out:
// with category names on a vertical axis they stay readable on a phone, where
// rotated x-axis labels under vertical bars do not.
//
// The chart grows in height with the number of categories rather than squashing
// them into a fixed box — a 375px-wide screen can scroll, but it cannot render
// eight legible rows in 200px.
//
// COLOUR: each category keeps its own colour on BOTH bars, per the spec. The
// two sides are told apart by fill strength (side A solid, side B lighter),
// with the axis order and the tooltip naming each side explicitly so the
// distinction never rests on colour alone.

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FALLBACK_COLOUR } from "@/lib/colours";
import { formatCompact, formatINR, toPaise } from "@/lib/money";
import type { ComparisonRow } from "@/lib/budget";

/** Opacity for side B's bars. Solid vs. clearly-lighter reads at a glance and
 *  survives a greyscale print; the labels carry the real meaning regardless. */
const SIDE_B_OPACITY = 0.42;

export function AllocationChart({
  rows,
  labelA,
  labelB,
  /** Single-side mode draws one bar per row instead of a pair. */
  only,
  /** Shown when there is nothing to chart yet — the category and event
   *  groupings are empty for different reasons, so callers say which. */
  emptyMessage = "Nothing allocated yet.",
}: {
  rows: ComparisonRow[];
  labelA: string;
  labelB: string;
  only?: "a" | "b";
  emptyMessage?: string;
}) {
  // EVERY row keeps its place, including ones with nothing against them. A
  // named axis entry with no bar is the signal "nobody has budgeted for
  // Transport" — the exact omission this chart exists to surface. Dropping
  // empty rows would make it invisible, which is the same reason
  // comparisonRows() / eventComparisonRows() don't drop them either.
  const visible = rows;
  const anythingAllocated = rows.some((r) => (only ? r[only] : r.totalPaise) > 0);

  if (visible.length === 0 || !anythingAllocated) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
        {emptyMessage}
      </p>
    );
  }

  // Row height chosen so a 44px-ish band per category stays tappable-legible;
  // the container scrolls with the page rather than compressing.
  const height = visible.length * (only ? 40 : 52) + 32;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={visible}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
          barCategoryGap="20%"
        >
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatCompact(toPaise(Math.round(v)))}
            tick={{ fontSize: 11, fill: "#a8a29e" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={84}
            tick={{ fontSize: 12, fill: "#57534e" }}
            axisLine={false}
            tickLine={false}
          />
          {/* Passed as a render function, not an element: Recharts 3 types
              `content` elements as already carrying the injected tooltip props,
              so cloning in our own extras only typechecks this way. */}
          <Tooltip
            cursor={{ fill: "#f5f5f4" }}
            content={(props) => (
              <AllocationTooltip {...props} labelA={labelA} labelB={labelB} only={only} />
            )}
          />
          {(!only || only === "a") && (
            <Bar dataKey="a" name={labelA} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {visible.map((row) => (
                <Cell key={row.name} fill={row.colour || FALLBACK_COLOUR} />
              ))}
            </Bar>
          )}
          {(!only || only === "b") && (
            <Bar dataKey="b" name={labelB} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {visible.map((row) => (
                <Cell
                  key={row.name}
                  fill={row.colour || FALLBACK_COLOUR}
                  fillOpacity={only ? 1 : SIDE_B_OPACITY}
                />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Deliberately typed against only what it reads, rather than Recharts'
 *  `TooltipContentProps<number, string>`: the render function above is handed
 *  the library's own loosely-generic props, and pinning the value/name generics
 *  here makes the two sides mutually unassignable. */
function AllocationTooltip({
  active,
  payload,
  labelA,
  labelB,
  only,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  labelA: string;
  labelB: string;
  only?: "a" | "b";
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ComparisonRow;

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-stone-800">{row.name}</p>
      {(!only || only === "a") && (
        <p className="mt-1 text-stone-600">
          {labelA}: <strong>{formatINR(toPaise(row.a))}</strong>
        </p>
      )}
      {(!only || only === "b") && (
        <p className="text-stone-600">
          {labelB}: <strong>{formatINR(toPaise(row.b))}</strong>
        </p>
      )}
      {!only ? (
        <p className="mt-1 border-t border-stone-100 pt-1 text-stone-500">
          Together: <strong>{formatINR(toPaise(row.totalPaise))}</strong>
        </p>
      ) : null}
    </div>
  );
}

/** Legend for the two-sided chart. Kept out of Recharts so the swatches match
 *  the bar treatment exactly (solid vs. lighter) at any font size. */
export function SidesLegend({ labelA, labelB }: { labelA: string; labelB: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-stone-700" aria-hidden />
        {labelA} (solid)
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-3 w-3 rounded-sm bg-stone-700"
          style={{ opacity: SIDE_B_OPACITY }}
          aria-hidden
        />
        {labelB} (lighter)
      </span>
      <span className="text-stone-400">Each category keeps its own colour.</span>
    </div>
  );
}
