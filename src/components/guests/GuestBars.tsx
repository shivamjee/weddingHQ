"use client";

// Guest breakdowns (FEATURES.md §4.4): households and people by side, by whose
// guest they are, by tier, by event — and adults versus children within each.
//
// Same recipe as src/components/budget/AllocationChart.tsx: horizontal bars so
// the labels stay readable on a phone, height that grows with the row count
// rather than squashing, animation off, one colour per row taken from the
// event's own document. Stacked adults + children because child plates price
// differently and the split is what a caterer asks for.
//
// It charts PEOPLE, not money, so it is a separate component rather than a
// prop on AllocationChart — the axis formatter, the tooltip and the stacking
// are all different, and bending one component to do both would make both
// harder to read.

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FALLBACK_COLOUR } from "@/lib/colours";
import { formatCompact } from "@/lib/money";
import type { Paise } from "@/lib/money";

export interface GuestBarRow {
  key: string;
  name: string;
  colour: string;
  icon?: string;
  adults: number;
  children: number;
  people: number;
  projectedPaise: Paise;
  households: number;
}

export function GuestBars({
  rows,
  emptyMessage = "Nothing to break down yet.",
}: {
  rows: GuestBarRow[];
  emptyMessage?: string;
}) {
  if (rows.length === 0 || rows.every((r) => r.people === 0)) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
        {emptyMessage}
      </p>
    );
  }

  const height = rows.length * 44 + 32;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
          barCategoryGap="20%"
        >
          <XAxis
            type="number"
            allowDecimals={false}
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
          {/* Render function, not an element — Recharts 3 types `content`
              elements as already carrying the injected props. Same reason as
              AllocationChart. */}
          <Tooltip cursor={{ fill: "#f5f5f4" }} content={(props) => <GuestTooltip {...props} />} />
          {/* Stacked: adults solid in the row's own colour, children a lighter
              band of the same colour, so the full bar reads as total people. */}
          <Bar dataKey="adults" stackId="people" isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.key} fill={row.colour || FALLBACK_COLOUR} />
            ))}
          </Bar>
          <Bar dataKey="children" stackId="people" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.key} fill={row.colour || FALLBACK_COLOUR} fillOpacity={0.42} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Typed against only what it reads, not Recharts' `TooltipContentProps`:
 *  pinning the value/name generics here makes the render function above and this
 *  component mutually unassignable. Same reasoning as AllocationTooltip. */
function GuestTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as GuestBarRow;

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-stone-700">{row.name}</p>
      <p className="text-stone-500">
        {row.people} {row.people === 1 ? "person" : "people"} · {row.adults} adults,{" "}
        {row.children} children
      </p>
      <p className="text-stone-500">
        {row.households} {row.households === 1 ? "household" : "households"} ·{" "}
        {formatCompact(row.projectedPaise)}
      </p>
    </div>
  );
}
