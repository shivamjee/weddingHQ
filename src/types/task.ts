import type { Timestamp } from "firebase/firestore";

/** todo → in_progress → done, with `blocked` as a sideways state for "waiting on
 *  someone else". Only `done` is hidden from the list by default (PHASE5.md
 *  decision #7) — `blocked` still needs looking at. */
export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "blocked", "done"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

/** The statuses that still need doing — what Home's overdue query filters to,
 *  and what the list shows when no status chip is lit. */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "blocked"];

export type TaskPriority = "low" | "normal" | "high";

export const TASK_PRIORITIES: readonly TaskPriority[] = ["high", "normal", "low"];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

/**
 * tenants/{tenantId}/tasks/{taskId} (FEATURES.md §6, PHASE5.md).
 *
 * TWO CLOCKS — read this before adding any time field here. `dueDate` is a real
 * point on the calendar: it sorts against "now", it is a `Timestamp`, and it
 * MUST go through src/lib/dates.ts (`dateInputValue` / `toTimestamp`) so an
 * <input type="date"> doesn't land a day early in Phoenix. Never render it with
 * string arithmetic. The other clock — a run sheet's `"HH:mm"` string, which is
 * deliberately NOT a Timestamp — belongs to `ScheduleItem` in Phase 5.5, and the
 * two must not be confused (PHASE5.md § The two clocks).
 *
 * `dueDate: null` means "someday", not "overdue". A null Timestamp is a
 * different type in Firestore's ordering and so never matches a `<=` range
 * filter — which is what stops a someday task reaching Home's overdue strip.
 * src/lib/tasks.ts enforces the same thing in memory, with a named test.
 *
 * `assigneeUid` is a SINGLE owner, not a list (PHASE5.md decision #5, and
 * FEATURES.md §6 is updated to match). A list invites "assigned to everyone",
 * which means assigned to nobody, and it would make Home's composite index and
 * the one-glance row both worse. `null` renders as "Unassigned".
 *
 * `completedAt` / `completedBy` ARE the provenance — there is deliberately no
 * append-only log for tasks (PHASE5.md decision #6). Phase 4 declined one even
 * for a deleted paid expense.
 *
 * SECURITY: readable AND writable by any member of the wedding, including
 * delete — consistent with every other planning collection (contacts,
 * questions, budgets, guests). A task somebody else has to do is still a task
 * anybody may write down. firestore.rules validates the two enums; see the
 * `tasks` block.
 */
export interface Task {
  title: string;
  description: string;
  assigneeUid: string | null; // uid; null = unassigned
  dueDate: Timestamp | null; // null = "someday", never overdue
  status: TaskStatus;
  priority: TaskPriority;
  categoryId: string | null;
  eventId: string | null;
  /** Surfaces on the §7.1 planning timeline. Same document as the task — not a
   *  second collection and not a `milestones` array anywhere. */
  isMilestone: boolean;
  completedAt: Timestamp | null;
  completedBy: string | null; // uid
  createdBy: string; // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TaskWithId extends Task {
  id: string;
}
