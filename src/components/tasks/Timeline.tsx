"use client";

// The §7.1 planning timeline — a view of the same `tasks` collection, not a
// second read: only tasks with `isMilestone: true`, grouped by month, with a
// "you are here" marker. Undated milestones get their own "Unscheduled" group
// at the end rather than silently disappearing (PHASE5.md Step 3).

import { milestoneTimeline } from "@/lib/tasks";
import { formatDate } from "@/lib/dates";
import type { TaskWithId } from "@/types";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return MONTH_FORMAT.format(new Date(y, m - 1, 1));
}

export function Timeline({
  tasks,
  now,
  onSelect,
}: {
  tasks: TaskWithId[];
  now: number;
  onSelect: (task: TaskWithId) => void;
}) {
  const { months, hereIndex, unscheduled } = milestoneTimeline(tasks, now);

  if (months.length === 0 && unscheduled.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
        No milestones yet. Tick &ldquo;Milestone&rdquo; on a task to put it here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {months.map((month, i) => (
        <section key={month.key} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-stone-800">{monthLabel(month.key)}</h2>
            {i === hereIndex ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                You are here
              </span>
            ) : null}
          </div>
          <ul className="flex flex-col gap-2 border-l-2 border-stone-200 pl-4">
            {month.tasks.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onSelect(t)}
                  className="flex min-h-[44px] w-full flex-col items-start rounded-xl px-2 py-1 text-left hover:bg-stone-50"
                >
                  <span className="text-sm font-medium text-stone-800">{t.title}</span>
                  <span className="text-xs text-stone-400">{formatDate(t.dueDate)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {unscheduled.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-stone-800">Unscheduled</h2>
          <ul className="flex flex-col gap-2 border-l-2 border-dashed border-stone-200 pl-4">
            {unscheduled.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onSelect(t)}
                  className="flex min-h-[44px] w-full items-center rounded-xl px-2 text-left text-sm font-medium text-stone-800 hover:bg-stone-50"
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
