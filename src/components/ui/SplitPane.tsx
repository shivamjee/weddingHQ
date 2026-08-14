import type { ReactNode } from "react";

/**
 * The list+detail split every `lg:+` list/detail screen uses (Guests,
 * Contacts, Questions, Expenses) — see CLAUDE.md § Responsive layout.
 *
 * Below `lg:` the caller does its own full-screen swap (`detail ?? list`);
 * this component only renders once both are shown side by side.
 *
 * `detail` sits in `lg:sticky lg:top-6` so it stays near the top as `list`
 * scrolls past — but capped at its own height with `overflow-y-auto` so a
 * detail taller than the viewport (e.g. editing a household with "More
 * details" open) scrolls *itself*, rather than pinning its top and hiding
 * its own Save/Cancel footer below the fold until the whole list has been
 * scrolled past first. `dvh` not `vh`: iPad Safari's toolbar makes `vh`
 * overshoot the real viewport.
 *
 * Declaring `overflow` here makes this div the scrollport for any `sticky`
 * descendant inside `detail` (CLAUDE.md's own documented gotcha) — so
 * nothing inside `detail` may itself be `sticky`. Nothing is today.
 */
export function SplitPane({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      {list}
      <div className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
        {detail}
      </div>
    </div>
  );
}
