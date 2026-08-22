"use client";

// A task's read-only profile — reached by tapping its row (Phase 3.1 shape:
// minimal row → read-only profile → explicit Edit). Edit and Remove live here.

import { PrimaryButton, SecondaryButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/dates";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskWithId } from "@/types";

export function TaskView({
  task,
  assigneeLabel,
  categoryName,
  eventName,
  onEdit,
  onRemove,
  onToggleDone,
  onBack,
}: {
  task: TaskWithId;
  assigneeLabel: string;
  categoryName: string | null;
  eventName: string | null;
  onEdit: () => void;
  onRemove: () => void;
  onToggleDone: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <PageHeader
        onBack={onBack}
        title={task.title}
        subtitle={task.isMilestone ? "Milestone" : undefined}
      />

      <div className="flex flex-wrap gap-3">
        <PrimaryButton onClick={onEdit}>Edit</PrimaryButton>
        <SecondaryButton onClick={onToggleDone}>
          {task.status === "done" ? "Reopen" : "Mark done"}
        </SecondaryButton>
        <SecondaryButton onClick={onRemove}>Remove</SecondaryButton>
      </div>

      <dl className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <Row label="Status" value={TASK_STATUS_LABELS[task.status]} />
        <Row label="Priority" value={TASK_PRIORITY_LABELS[task.priority]} />
        <Row label="Assignee" value={assigneeLabel} />
        <Row label="Due" value={formatDate(task.dueDate, "Someday")} />
        {categoryName ? <Row label="Category" value={categoryName} /> : null}
        {eventName ? <Row label="Event" value={eventName} /> : null}
        {task.description ? <Row label="Notes" value={task.description} /> : null}
        {task.status === "done" ? (
          <Row label="Completed" value={formatDate(task.completedAt, "—")} />
        ) : null}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-stone-500">{label}</dt>
      <dd className="text-sm text-stone-700 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
