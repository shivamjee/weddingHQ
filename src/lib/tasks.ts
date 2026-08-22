// Pure task logic — filtering, grouping, overdue maths, the planning timeline.
// No Firebase import, same pattern as src/lib/budget.ts / guests.ts / expenses.ts.
// `now` is always a PARAMETER, never Date.now() inside a function — that is
// what makes overdueOf/milestoneTimeline testable without mocking the clock.

import type { Timestamp } from "firebase/firestore";
import type { TaskStatus, TaskWithId } from "@/types";

// ---- filters ----------------------------------------------------------------

/** Every combinable axis. `null` means "not filtering on this" — same contract
 *  as src/lib/guests.ts's GuestFilters. An empty `status` list is the default
 *  view: everything EXCEPT "done" (PHASE5.md decision #7 — done tasks are
 *  hidden by default, not archived, not deleted). */
export interface TaskFilters {
  assigneeUid: string | null;
  status: TaskStatus[];
  eventId: string | null;
  categoryId: string | null;
  milestonesOnly: boolean;
  /** Free-text match on the title. Not a filter chip — it has its own input,
   *  like Guests' and Contacts' search. */
  search: string;
}

export const NO_TASK_FILTERS: TaskFilters = {
  assigneeUid: null,
  status: [],
  eventId: null,
  categoryId: null,
  milestonesOnly: false,
  search: "",
};

/** How many chips are lit, for FilterPanel's badge. `search` is excluded — it
 *  has its own visible input, so counting it would look like a phantom filter. */
export function activeTaskFilterCount(filters: TaskFilters): number {
  return [
    filters.assigneeUid,
    filters.status.length > 0 ? filters.status : null,
    filters.eventId,
    filters.categoryId,
    filters.milestonesOnly ? true : null,
  ].filter((value) => value !== null).length;
}

export function filterTasks(tasks: readonly TaskWithId[], filters: TaskFilters): TaskWithId[] {
  const search = filters.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (filters.assigneeUid && t.assigneeUid !== filters.assigneeUid) return false;
    if (filters.status.length > 0) {
      if (!filters.status.includes(t.status)) return false;
    } else if (t.status === "done") {
      // Default view: done tasks hidden unless the "Done" chip is explicitly on.
      return false;
    }
    if (filters.eventId && t.eventId !== filters.eventId) return false;
    if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
    if (filters.milestonesOnly && !t.isMilestone) return false;
    if (search && !t.title.toLowerCase().includes(search)) return false;
    return true;
  });
}

// ---- sorting ------------------------------------------------------------

/** Due date ascending; undated tasks sink to the end of their group rather
 *  than sorting as epoch-zero at the top. */
export function sortTasks(tasks: readonly TaskWithId[]): TaskWithId[] {
  return [...tasks].sort((a, b) => {
    const am = a.dueDate?.toMillis() ?? Infinity;
    const bm = b.dueDate?.toMillis() ?? Infinity;
    return am - bm;
  });
}

// ---- grouping -----------------------------------------------------------

export type GroupKey = "assignee" | "event" | "dueMonth" | "status";

export interface TaskGroup {
  /** Raw id/value — "unassigned" / "none" / "none" / a TaskStatus / "YYYY-MM".
   *  The caller resolves this to a display label (it has useConfig() and the
   *  member list; this module stays Firebase-free). */
  key: string;
  tasks: TaskWithId[];
}

const UNASSIGNED_KEY = "unassigned";
const NONE_KEY = "none";
const UNDATED_MONTH_KEY = "undated";

function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthKey(due: Timestamp | null): string {
  if (!due) return UNDATED_MONTH_KEY;
  return monthKeyFromDate(due.toDate());
}

/** §6's four views (My tasks / Everyone's / By event / Overdue) collapse to
 *  one function with a key rather than four separate ones — "Everyone's" is
 *  `groupTasks(tasks, "assignee")`, "By event" is `groupTasks(tasks, "event")`.
 *  Every group's tasks are sorted by due date; undated-month group sorts last. */
export function groupTasks(tasks: readonly TaskWithId[], key: GroupKey): TaskGroup[] {
  const buckets = new Map<string, TaskWithId[]>();
  for (const t of tasks) {
    const k =
      key === "assignee"
        ? (t.assigneeUid ?? UNASSIGNED_KEY)
        : key === "event"
          ? (t.eventId ?? NONE_KEY)
          : key === "status"
            ? t.status
            : monthKey(t.dueDate);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(t);
    else buckets.set(k, [t]);
  }
  const groups = [...buckets.entries()].map(([k, ts]) => ({ key: k, tasks: sortTasks(ts) }));
  // Undated bucket (dueMonth grouping) always sorts last; everything else
  // sorts by its first task's due date so the soonest group leads.
  groups.sort((a, b) => {
    if (key === "dueMonth") {
      if (a.key === UNDATED_MONTH_KEY) return 1;
      if (b.key === UNDATED_MONTH_KEY) return -1;
      return a.key.localeCompare(b.key);
    }
    const am = a.tasks[0]?.dueDate?.toMillis() ?? Infinity;
    const bm = b.tasks[0]?.dueDate?.toMillis() ?? Infinity;
    return am - bm;
  });
  return groups;
}

// ---- overdue / due-soon ---------------------------------------------------

/** Local midnight for `now`, so "due today" never reads as overdue just
 *  because the clock has ticked past 00:00 by a few hours. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface OverdueResult {
  overdue: TaskWithId[];
  dueSoon: TaskWithId[]; // due within soonDays, not yet overdue
}

/** The caller's overdue and due-soon sets. A task with `dueDate: null` is
 *  NEVER in either set — Definition of done #2, the single most copyable
 *  mistake this phase could ship. */
export function overdueOf(
  tasks: readonly TaskWithId[],
  uid: string,
  now: number,
  soonDays: number,
): OverdueResult {
  const today = startOfDay(now);
  const cutoff = today + soonDays * 86_400_000;
  const overdue: TaskWithId[] = [];
  const dueSoon: TaskWithId[] = [];
  for (const t of tasks) {
    if (t.assigneeUid !== uid) continue;
    if (t.status === "done") continue;
    if (!t.dueDate) continue;
    const due = t.dueDate.toMillis();
    if (due < today) overdue.push(t);
    else if (due <= cutoff) dueSoon.push(t);
  }
  return { overdue: sortTasks(overdue), dueSoon: sortTasks(dueSoon) };
}

// ---- planning timeline (§7.1) ---------------------------------------------

export interface TimelineMonth {
  key: string; // "YYYY-MM"
  tasks: TaskWithId[];
}

export interface Timeline {
  months: TimelineMonth[];
  /** Index into `months` of the first month not yet past. -1 if every month
   *  is in the past (or there are no dated milestones at all). */
  hereIndex: number;
  /** Milestones with no dueDate — cannot be placed on a timeline, so they get
   *  their own group instead of silently disappearing (PHASE5.md Step 3). */
  unscheduled: TaskWithId[];
}

/** Vertical timeline: only `isMilestone` tasks, grouped by month, with a
 *  "you are here" index. Same collection, no second read. */
export function milestoneTimeline(tasks: readonly TaskWithId[], now: number): Timeline {
  const milestones = tasks.filter((t) => t.isMilestone);
  const unscheduled = sortTasks(milestones.filter((t) => !t.dueDate));
  const dated = milestones.filter((t) => t.dueDate);

  const buckets = new Map<string, TaskWithId[]>();
  for (const t of dated) {
    const k = monthKey(t.dueDate);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(t);
    else buckets.set(k, [t]);
  }
  const months = [...buckets.entries()]
    .map(([key, ts]) => ({ key, tasks: sortTasks(ts) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const nowKey = monthKeyFromDate(new Date(now));
  const hereIndex = months.findIndex((m) => m.key >= nowKey);

  return { months, hereIndex, unscheduled };
}
