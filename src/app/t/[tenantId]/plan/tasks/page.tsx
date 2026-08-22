"use client";

// Plan → Tasks (PHASE5.md Steps 2-3, FEATURES.md §6-7.1).
//
// Five views over ONE collection, ONE bounded read: My tasks (default),
// Everyone's, By event, Overdue and Timeline. `groupTasks()` /
// `milestoneTimeline()` (src/lib/tasks.ts) do all the grouping in memory —
// there is no per-view query.
//
// SECURITY: member-read and member-write. A task somebody else has to do is
// still a task anybody may write down (firestore.rules `tasks` block).
//
// READ COST: one bounded read of the whole `tasks` collection (limit 300) and
// one bounded read of `memberships`, no pagination. That's what lets every
// on-screen count respect the active filters — Phase 3 §4.4's argument,
// unchanged: a filtered count computed from page 1 of several is simply
// wrong. A wedding's whole backlog is realistically under 200 documents; move
// the "hide done" filter server-side only if that cap is ever approached.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  deleteDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { SplitPane } from "@/components/ui/SplitPane";
import { PageHeader } from "@/components/ui/PageHeader";
import { TaskForm } from "@/components/tasks/TaskForm";
import { TaskView } from "@/components/tasks/TaskView";
import { Timeline } from "@/components/tasks/Timeline";
import {
  Checkbox,
  ChipMultiRow,
  ChipRow,
  FilterPanel,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/form";
import { taskDoc, tasksCol, membershipsCol } from "@/lib/paths";
import { formatDate } from "@/lib/dates";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTenant } from "@/lib/tenants/TenantProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import {
  NO_TASK_FILTERS,
  activeTaskFilterCount,
  filterTasks,
  groupTasks,
  overdueOf,
  sortTasks,
  type TaskFilters,
} from "@/lib/tasks";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type MembershipWithId,
  type TaskStatus,
  type TaskWithId,
} from "@/types";

const MAX_TASKS = 300;
const MAX_MEMBERS = 50;
/** Home's overdue strip uses the same window (PHASE5.md decision). */
const DUE_SOON_DAYS = 14;

type ViewKey = "mine" | "everyone" | "event" | "overdue" | "timeline";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "mine", label: "My tasks" },
  { key: "everyone", label: "Everyone's" },
  { key: "event", label: "By event" },
  { key: "overdue", label: "Overdue" },
  { key: "timeline", label: "Timeline" },
];

type Mode = { kind: "list" } | { kind: "view"; task: TaskWithId } | { kind: "form"; task?: TaskWithId };

export default function TasksPage() {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { categoryById, eventById } = useConfig();

  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [filters, setFilters] = useState<TaskFilters>(NO_TASK_FILTERS);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Lets Home's overdue strip deep-link straight into this view
  // (`/plan/tasks?view=overdue`) without a Suspense boundary for
  // useSearchParams — read once, the same lazy-initialiser shape
  // home/page.tsx already uses for "now".
  const [view, setView] = useState<ViewKey>(() => {
    if (typeof window === "undefined") return "mine";
    const v = new URLSearchParams(window.location.search).get("view");
    return VIEWS.some((x) => x.key === v) ? (v as ViewKey) : "mine";
  });

  // Captured once per mount, not read during render — same reasoning as
  // home/page.tsx's `now`.
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [taskSnap, memberSnap] = await Promise.all([
      getDocs(query(tasksCol(tenantId), limit(MAX_TASKS))),
      getDocs(query(membershipsCol(), where("tenantId", "==", tenantId), limit(MAX_MEMBERS))),
    ]);
    return {
      tasks: taskSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as TaskWithId),
      members: memberSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as MembershipWithId),
    };
  }, [tenantId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load tasks.");

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const memberList = useMemo(() => data?.members ?? [], [data]);
  // Only members with a stamped uid can be assigned — an invitee who has
  // never signed in has no uid yet to assign against.
  const members = useMemo(
    () =>
      memberList
        .filter((m): m is MembershipWithId & { uid: string } => Boolean(m.uid))
        .map((m) => ({ uid: m.uid, label: m.displayName || m.email })),
    [memberList],
  );
  const memberLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.uid] = m.label;
    return map;
  }, [members]);
  const assigneeLabel = useCallback(
    (uid: string | null) => (uid ? (memberLabel[uid] ?? "Former member") : "Unassigned"),
    [memberLabel],
  );

  const visible = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);

  async function toggleDone(task: TaskWithId) {
    if (!user) return;
    const done = task.status !== "done";
    try {
      await updateDoc(taskDoc(tenantId, task.id), {
        status: done ? "done" : "todo",
        completedAt: done ? serverTimestamp() : null,
        completedBy: done ? user.uid : null,
        updatedAt: serverTimestamp(),
      });
      reload();
    } catch (err) {
      console.error("[tasks] toggle done failed:", err);
    }
  }

  async function removeTask(task: TaskWithId) {
    if (!window.confirm("Delete this task?")) return;
    try {
      await deleteDoc(taskDoc(tenantId, task.id));
      setMode({ kind: "list" });
      reload();
    } catch (err) {
      console.error("[tasks] delete failed:", err);
    }
  }

  let detail: ReactNode = null;
  if (mode.kind === "view") {
    const task = mode.task;
    detail = (
      <TaskView
        task={task}
        assigneeLabel={assigneeLabel(task.assigneeUid)}
        categoryName={categoryById(task.categoryId)?.name ?? null}
        eventName={eventById(task.eventId)?.name ?? null}
        onEdit={() => setMode({ kind: "form", task })}
        onRemove={() => removeTask(task)}
        onToggleDone={() => {
          void toggleDone(task);
          setMode({ kind: "list" });
        }}
        onBack={() => setMode({ kind: "list" })}
      />
    );
  } else if (mode.kind === "form") {
    detail = (
      <div className="flex flex-1 flex-col px-5 py-6">
        <TaskForm
          existing={mode.task}
          members={members}
          onDone={() => {
            setMode({ kind: "list" });
            reload();
          }}
          onCancel={() => setMode({ kind: "list" })}
        />
      </div>
    );
  }

  function openView(task: TaskWithId) {
    if (isDesktop && mode.kind === "view" && mode.task.id === task.id) {
      setMode({ kind: "list" });
    } else {
      setMode({ kind: "view", task });
    }
  }

  const list = (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <PageHeader
        title="Tasks"
        subtitle="What needs doing, and by when."
        action={<SecondaryButton onClick={() => setMode({ kind: "form" })}>+ Add</SecondaryButton>}
      />

      <FormMessage error={error} />

      <ChipRow<ViewKey>
        options={VIEWS.map((v) => ({ value: v.key, label: v.label }))}
        value={view}
        onChange={(v) => v && setView(v)}
      />

      {tasks.length > 0 ? (
        <FilterPanel activeCount={activeTaskFilterCount(filters)} onClear={() => setFilters(NO_TASK_FILTERS)}>
          <ChipMultiRow<TaskStatus>
            label="Status"
            options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
            values={filters.status}
            onChange={(status) => setFilters((f) => ({ ...f, status }))}
          />
          <FilterRows filters={filters} setFilters={setFilters} />
          <Checkbox
            label="Milestones only"
            checked={filters.milestonesOnly}
            onChange={(milestonesOnly) => setFilters((f) => ({ ...f, milestonesOnly }))}
          />
        </FilterPanel>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-stone-300 px-4 py-6">
          <p className="text-sm text-stone-500">
            Nothing written down yet. A venue call, a fitting, a deposit due —
            whatever&rsquo;s next.
          </p>
          <PrimaryButton onClick={() => setMode({ kind: "form" })}>Add the first task</PrimaryButton>
        </div>
      ) : (
        <TaskViewBody
          view={view}
          tasks={visible}
          uid={user?.uid ?? ""}
          now={now}
          assigneeLabel={assigneeLabel}
          eventLabel={(id) => eventById(id)?.name ?? "No event"}
          onSelect={openView}
          onToggleDone={toggleDone}
        />
      )}
    </div>
  );

  if (!isDesktop) return mode.kind === "list" ? list : detail;
  if (mode.kind === "list") return list;
  return <SplitPane list={list} detail={detail} />;
}

function FilterRows({
  filters,
  setFilters,
}: {
  filters: TaskFilters;
  setFilters: (updater: (f: TaskFilters) => TaskFilters) => void;
}) {
  const { categories, events } = useConfig();
  return (
    <>
      {categories.length > 0 ? (
        <ChipRow
          label="Category"
          options={categories.map((c) => ({ value: c.id, label: c.name, colour: c.colour, icon: c.icon }))}
          value={filters.categoryId}
          onChange={(categoryId) => setFilters((f) => ({ ...f, categoryId }))}
          allowClear
        />
      ) : null}
      {events.length > 0 ? (
        <ChipRow
          label="Event"
          options={events.map((e) => ({ value: e.id, label: e.name, colour: e.colour, icon: e.icon }))}
          value={filters.eventId}
          onChange={(eventId) => setFilters((f) => ({ ...f, eventId }))}
          allowClear
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function TaskViewBody({
  view,
  tasks,
  uid,
  now,
  assigneeLabel,
  eventLabel,
  onSelect,
  onToggleDone,
}: {
  view: ViewKey;
  tasks: TaskWithId[];
  uid: string;
  now: number;
  assigneeLabel: (uid: string | null) => string;
  eventLabel: (id: string | null) => string;
  onSelect: (task: TaskWithId) => void;
  onToggleDone: (task: TaskWithId) => void;
}) {
  if (view === "timeline") {
    return <Timeline tasks={tasks} now={now} onSelect={onSelect} />;
  }

  if (view === "overdue") {
    const { overdue, dueSoon } = overdueOf(tasks, uid, now, DUE_SOON_DAYS);
    if (overdue.length === 0 && dueSoon.length === 0) {
      return (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
          Nothing overdue or due soon. Nicely done.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {overdue.length > 0 ? (
          <TaskGroup title="Overdue" tasks={overdue} assigneeLabel={assigneeLabel} onSelect={onSelect} onToggleDone={onToggleDone} />
        ) : null}
        {dueSoon.length > 0 ? (
          <TaskGroup title="Due soon" tasks={dueSoon} assigneeLabel={assigneeLabel} onSelect={onSelect} onToggleDone={onToggleDone} />
        ) : null}
      </div>
    );
  }

  if (view === "mine") {
    const mine = sortTasks(tasks.filter((t) => t.assigneeUid === uid));
    if (mine.length === 0) {
      return (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
          Nothing assigned to you. Check &ldquo;Everyone&rsquo;s&rdquo; for the full list.
        </p>
      );
    }
    return <TaskList tasks={mine} assigneeLabel={assigneeLabel} onSelect={onSelect} onToggleDone={onToggleDone} />;
  }

  // "everyone" / "event"
  const groups = groupTasks(tasks, view === "everyone" ? "assignee" : "event");
  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
        Nothing matches those filters.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <TaskGroup
          key={g.key}
          title={view === "everyone" ? assigneeLabel(g.key === "unassigned" ? null : g.key) : eventLabel(g.key === "none" ? null : g.key)}
          tasks={g.tasks}
          assigneeLabel={assigneeLabel}
          onSelect={onSelect}
          onToggleDone={onToggleDone}
        />
      ))}
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  assigneeLabel,
  onSelect,
  onToggleDone,
}: {
  title: string;
  tasks: TaskWithId[];
  assigneeLabel: (uid: string | null) => string;
  onSelect: (task: TaskWithId) => void;
  onToggleDone: (task: TaskWithId) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-stone-800">{title}</h2>
        <span className="text-xs text-stone-400">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </span>
      </div>
      <TaskList tasks={tasks} assigneeLabel={assigneeLabel} onSelect={onSelect} onToggleDone={onToggleDone} />
    </section>
  );
}

function TaskList({
  tasks,
  assigneeLabel,
  onSelect,
  onToggleDone,
}: {
  tasks: TaskWithId[];
  assigneeLabel: (uid: string | null) => string;
  onSelect: (task: TaskWithId) => void;
  onToggleDone: (task: TaskWithId) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          assigneeLabel={assigneeLabel(t.assigneeUid)}
          onSelect={() => onSelect(t)}
          onToggleDone={() => onToggleDone(t)}
        />
      ))}
    </ul>
  );
}

function TaskRow({
  task,
  assigneeLabel,
  onSelect,
  onToggleDone,
}: {
  task: TaskWithId;
  assigneeLabel: string;
  onSelect: () => void;
  onToggleDone: () => void;
}) {
  const done = task.status === "done";
  return (
    <li className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <button
        type="button"
        aria-pressed={done}
        aria-label={done ? "Mark as not done" : "Mark done"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone();
        }}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
          done ? "border-emerald-500 bg-emerald-500 text-white" : "border-stone-300 text-transparent"
        }`}
      >
        ✓
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span
          className={`block truncate text-base font-medium ${done ? "text-stone-400 line-through" : "text-stone-800"}`}
        >
          {task.title}
        </span>
        <span className="block truncate text-xs text-stone-500">
          {assigneeLabel} · {formatDate(task.dueDate, "Someday")}
        </span>
      </button>
      {task.isMilestone ? (
        <span aria-hidden title="Milestone" className="shrink-0 text-stone-300">
          ◆
        </span>
      ) : null}
    </li>
  );
}
