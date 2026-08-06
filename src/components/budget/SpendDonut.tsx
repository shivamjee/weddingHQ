"use client";

// Small "spent vs remaining" ring — Home's Budget & Expenses card, and a
// smaller copy of the same chart on the Budget screen's Expenses card
// (Phase 4.1 QA round 2: the expenses figure "looks weak" next to the
// allocation health bars, and needs a pictorial read, not just a number).
//
// Two segments only (spent vs remaining) — paid/committed/estimated already
// get their own colours in "Spending by category"; a 4-slice donut this
// small just turns to noise. Centre label repeats the percentage so the ring
// isn't decoration-only for a screen reader or a quick glance.

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

const SPENT_COLOUR = "#10b981"; // emerald-500 — same green "paid" already uses elsewhere
const OVER_COLOUR = "#e11d48"; // rose-600 — reserved for the over-budget state
const REMAINING_COLOUR = "#e7e5e4"; // stone-200

export function SpendDonut({
  spentPaise,
  budgetPaise,
  size = 72,
}: {
  spentPaise: number;
  budgetPaise: number;
  size?: number;
}) {
  const noBudget = budgetPaise <= 0;
  const over = !noBudget && spentPaise >= budgetPaise;
  const pct = noBudget ? null : Math.round((spentPaise / budgetPaise) * 100);

  const data = noBudget
    ? [{ value: 1, fill: REMAINING_COLOUR }]
    : over
      ? [{ value: 1, fill: OVER_COLOUR }]
      : [
          { value: spentPaise, fill: SPENT_COLOUR },
          { value: budgetPaise - spentPaise, fill: REMAINING_COLOUR },
        ];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius="72%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className={`font-semibold ${over ? "text-rose-600" : "text-stone-700"}`}
          style={{ fontSize: Math.max(10, Math.round(size * 0.22)) }}
        >
          {noBudget ? "—" : `${pct}%`}
        </span>
      </div>
    </div>
  );
}
