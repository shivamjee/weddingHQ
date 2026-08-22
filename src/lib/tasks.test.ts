import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  NO_TASK_FILTERS,
  activeTaskFilterCount,
  filterTasks,
  groupTasks,
  milestoneTimeline,
  overdueOf,
  sortTasks,
  type TaskFilters,
} from "./tasks";
import type { TaskWithId } from "@/types";

const ts = (isoDate: string) => Timestamp.fromDate(new Date(`${isoDate}T00:00:00`));

let seq = 0;
function task(overrides: Partial<TaskWithId> = {}): TaskWithId {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    description: "",
    assigneeUid: null,
    dueDate: null,
    status: "todo",
    priority: "normal",
    categoryId: null,
    eventId: null,
    isMilestone: false,
    completedAt: null,
    completedBy: null,
    createdBy: "uid_a",
    createdAt: ts("2026-01-01"),
    updatedAt: ts("2026-01-01"),
    ...overrides,
  };
}

describe("filterTasks", () => {
  it("combines axes — assignee AND event AND category, not OR", () => {
    const tasks = [
      task({ assigneeUid: "u1", eventId: "e1", categoryId: "c1" }),
      task({ assigneeUid: "u1", eventId: "e2", categoryId: "c1" }),
      task({ assigneeUid: "u2", eventId: "e1", categoryId: "c1" }),
    ];
    const filters: TaskFilters = { ...NO_TASK_FILTERS, assigneeUid: "u1", eventId: "e1" };
    expect(filterTasks(tasks, filters)).toEqual([tasks[0]]);
  });

  it("an empty filter set matches everything except done", () => {
    const tasks = [task({ status: "todo" }), task({ status: "done" }), task({ status: "blocked" })];
    const visible = filterTasks(tasks, NO_TASK_FILTERS);
    expect(visible.map((t) => t.status).sort()).toEqual(["blocked", "todo"]);
  });

  it("an explicit status filter can show done tasks", () => {
    const tasks = [task({ status: "todo" }), task({ status: "done" })];
    const filters: TaskFilters = { ...NO_TASK_FILTERS, status: ["done"] };
    expect(filterTasks(tasks, filters).map((t) => t.status)).toEqual(["done"]);
  });

  it("milestonesOnly keeps only isMilestone tasks", () => {
    const tasks = [task({ isMilestone: true }), task({ isMilestone: false })];
    const filters: TaskFilters = { ...NO_TASK_FILTERS, milestonesOnly: true };
    expect(filterTasks(tasks, filters)).toHaveLength(1);
  });

  it("search matches the title case-insensitively", () => {
    const tasks = [task({ title: "Book the Venue" }), task({ title: "Call caterer" })];
    const filters: TaskFilters = { ...NO_TASK_FILTERS, search: "venue" };
    expect(filterTasks(tasks, filters)).toEqual([tasks[0]]);
  });
});

describe("activeTaskFilterCount", () => {
  it("excludes search, counts everything else that's set", () => {
    expect(activeTaskFilterCount(NO_TASK_FILTERS)).toBe(0);
    expect(
      activeTaskFilterCount({ ...NO_TASK_FILTERS, assigneeUid: "u1", search: "abc" }),
    ).toBe(1);
    expect(
      activeTaskFilterCount({ ...NO_TASK_FILTERS, status: ["done"], milestonesOnly: true }),
    ).toBe(2);
  });
});

describe("sortTasks", () => {
  it("sorts by due date ascending, undated tasks last", () => {
    const late = task({ dueDate: ts("2027-06-01") });
    const soon = task({ dueDate: ts("2026-09-01") });
    const undated = task({ dueDate: null });
    expect(sortTasks([late, undated, soon])).toEqual([soon, late, undated]);
  });
});

describe("groupTasks", () => {
  it("'assignee' buckets unassigned tasks under a single key", () => {
    const tasks = [task({ assigneeUid: "u1" }), task({ assigneeUid: null })];
    const groups = groupTasks(tasks, "assignee");
    expect(groups.map((g) => g.key).sort()).toEqual(["u1", "unassigned"]);
  });

  it("'dueMonth' puts undated tasks in their own bucket, sorted last", () => {
    const dated = task({ dueDate: ts("2026-09-15") });
    const undated = task({ dueDate: null });
    const groups = groupTasks([undated, dated], "dueMonth");
    expect(groups.map((g) => g.key)).toEqual(["2026-09", "undated"]);
  });

  it("'event' groups by eventId with a 'none' bucket for tasks with no event", () => {
    const tasks = [task({ eventId: "sangeet" }), task({ eventId: null })];
    const groups = groupTasks(tasks, "event");
    expect(groups.map((g) => g.key).sort()).toEqual(["none", "sangeet"]);
  });
});

describe("overdueOf", () => {
  const NOW = new Date("2026-09-15T12:00:00").getTime();

  it("a task with no dueDate is never overdue", () => {
    const someday = task({ assigneeUid: "u1", dueDate: null, status: "todo" });
    const { overdue, dueSoon } = overdueOf([someday], "u1", NOW, 14);
    expect(overdue).toEqual([]);
    expect(dueSoon).toEqual([]);
  });

  it("a task due today is not yet overdue", () => {
    const today = task({ assigneeUid: "u1", dueDate: ts("2026-09-15"), status: "todo" });
    const { overdue, dueSoon } = overdueOf([today], "u1", NOW, 14);
    expect(overdue).toEqual([]);
    expect(dueSoon).toEqual([today]);
  });

  it("a task due yesterday is overdue", () => {
    const yesterday = task({ assigneeUid: "u1", dueDate: ts("2026-09-14"), status: "todo" });
    const { overdue } = overdueOf([yesterday], "u1", NOW, 14);
    expect(overdue).toEqual([yesterday]);
  });

  it("ignores other people's tasks and done tasks", () => {
    const someoneElse = task({ assigneeUid: "u2", dueDate: ts("2026-09-14"), status: "todo" });
    const finished = task({ assigneeUid: "u1", dueDate: ts("2026-09-14"), status: "done" });
    const { overdue, dueSoon } = overdueOf([someoneElse, finished], "u1", NOW, 14);
    expect(overdue).toEqual([]);
    expect(dueSoon).toEqual([]);
  });

  it("a task just past the due-soon window is neither overdue nor due-soon", () => {
    const farOut = task({ assigneeUid: "u1", dueDate: ts("2026-10-15"), status: "todo" });
    const { overdue, dueSoon } = overdueOf([farOut], "u1", NOW, 14);
    expect(overdue).toEqual([]);
    expect(dueSoon).toEqual([]);
  });
});

describe("milestoneTimeline", () => {
  const NOW = new Date("2026-09-15T00:00:00").getTime();

  it("puts undated milestones in `unscheduled`, never in a month", () => {
    const undated = task({ isMilestone: true, dueDate: null });
    const dated = task({ isMilestone: true, dueDate: ts("2026-10-01") });
    const { months, unscheduled } = milestoneTimeline([undated, dated], NOW);
    expect(unscheduled).toEqual([undated]);
    expect(months.every((m) => m.tasks.every((t) => t.dueDate !== null))).toBe(true);
  });

  it("ignores non-milestone tasks entirely", () => {
    const plain = task({ isMilestone: false, dueDate: ts("2026-10-01") });
    const { months, unscheduled } = milestoneTimeline([plain], NOW);
    expect(months).toEqual([]);
    expect(unscheduled).toEqual([]);
  });

  it("hereIndex points at the first month not yet past", () => {
    const past = task({ isMilestone: true, dueDate: ts("2026-08-01") });
    const current = task({ isMilestone: true, dueDate: ts("2026-09-20") });
    const future = task({ isMilestone: true, dueDate: ts("2026-11-01") });
    const { months, hereIndex } = milestoneTimeline([past, current, future], NOW);
    expect(months.map((m) => m.key)).toEqual(["2026-08", "2026-09", "2026-11"]);
    expect(hereIndex).toBe(1);
  });

  it("hereIndex is -1 when every milestone is in the past", () => {
    const past = task({ isMilestone: true, dueDate: ts("2026-01-01") });
    const { hereIndex } = milestoneTimeline([past], NOW);
    expect(hereIndex).toBe(-1);
  });
});
