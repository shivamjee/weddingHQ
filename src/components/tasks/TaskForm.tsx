"use client";

// Task entry — as cheap as ExpenseForm (PHASE5.md Step 2): title first with
// autofocus, assignee and status as chips, due date via <input type="date">,
// everything else folded away. A task nobody can add in fifteen seconds is a
// task that gets sent as a WhatsApp message instead (Definition of done #1).

import { useState } from "react";
import { addDoc, deleteDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { taskDoc, tasksCol } from "@/lib/paths";
import { dateInputValue, toTimestamp } from "@/lib/dates";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTenant } from "@/lib/tenants/TenantProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import {
  Checkbox,
  ChipRow,
  Expander,
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
  type TaskWithId,
} from "@/types";

export function TaskForm({
  existing,
  members,
  onDone,
  onCancel,
}: {
  existing?: TaskWithId;
  /** Only members with a stamped uid can be assigned — an invitee who has
   *  never signed in has no uid yet to assign against. */
  members: { uid: string; label: string }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { categories, events } = useConfig();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  // New tasks default-assign to whoever is creating them — Definition of
  // done #1 needs a title-only save to land in "My tasks" without an extra
  // tap. An edit keeps whatever the document already has, including null.
  const [assigneeUid, setAssigneeUid] = useState<string | null>(
    existing ? (existing.assigneeUid ?? null) : (user?.uid ?? null),
  );
  const [status, setStatus] = useState<TaskStatus>(existing?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(existing?.priority ?? "normal");
  const [dueDate, setDueDate] = useState(dateInputValue(existing?.dueDate ?? null));
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [eventId, setEventId] = useState<string | null>(existing?.eventId ?? null);
  const [isMilestone, setIsMilestone] = useState(existing?.isMilestone ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = title.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean || busy || !user) return;
    setBusy(true);
    setError(null);

    const done = status === "done";
    const fields = {
      title: clean,
      description: description.trim(),
      assigneeUid,
      dueDate: toTimestamp(dueDate),
      status,
      priority,
      categoryId,
      eventId,
      isMilestone,
      // Stamp completion the moment it enters "done"; clear it if reopened.
      // This IS the provenance — no append-only log for tasks (PHASE5.md
      // decision #6, the same call Phase 4 made for a deleted paid expense).
      completedAt: done ? (existing?.completedAt ?? serverTimestamp()) : null,
      completedBy: done ? (existing?.completedBy ?? user.uid) : null,
      updatedAt: serverTimestamp(),
    };

    try {
      if (existing) {
        await updateDoc(taskDoc(tenantId, existing.id), fields);
      } else {
        await addDoc(tasksCol(tenantId), {
          ...fields,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      onDone();
    } catch (err) {
      console.error("[tasks] save failed:", err);
      setError("Could not save that task.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!window.confirm("Delete this task?")) return;
    setBusy(true);
    try {
      await deleteDoc(taskDoc(tenantId, existing.id));
      onDone();
    } catch (err) {
      console.error("[tasks] delete failed:", err);
      setError("Could not delete that task.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-stone-800">
        {existing ? "Edit task" : "New task"}
      </h1>

      <Field label="Title">
        <TextInput
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Book the venue"
        />
      </Field>

      <ChipRow
        label="Assignee"
        options={members.map((m) => ({ value: m.uid, label: m.label }))}
        value={assigneeUid}
        onChange={setAssigneeUid}
        allowClear
        emptyLabel="No members yet — invite people from More."
      />

      <ChipRow<TaskStatus>
        label="Status"
        options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
        value={status}
        onChange={(v) => v && setStatus(v)}
      />

      <Field label="Due date (optional)" hint="Leave blank for a someday task.">
        <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>

      <Expander summary="More details">
        <Field label="Notes">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <ChipRow<TaskPriority>
          label="Priority"
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABELS[p] }))}
          value={priority}
          onChange={(v) => v && setPriority(v)}
        />

        <ChipRow
          label="Category"
          options={categories.map((c) => ({ value: c.id, label: c.name, colour: c.colour }))}
          value={categoryId}
          onChange={setCategoryId}
          allowClear
          emptyLabel="No categories yet — add them in More → Setup."
        />
        <ChipRow
          label="Event"
          options={events.map((e) => ({ value: e.id, label: e.name, colour: e.colour }))}
          value={eventId}
          onChange={setEventId}
          allowClear
          emptyLabel="No events yet — add them in More → Setup."
        />

        <Checkbox
          label="Milestone — show on the planning timeline"
          checked={isMilestone}
          onChange={setIsMilestone}
        />
      </Expander>

      <FormMessage error={error} />

      <div className="flex flex-wrap items-center gap-2 pb-4">
        <PrimaryButton type="submit" disabled={!clean || busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
        {existing ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="ml-auto min-h-[44px] px-2 text-sm font-medium text-stone-400 hover:text-rose-600"
          >
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}
