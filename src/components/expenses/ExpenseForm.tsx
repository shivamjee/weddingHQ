"use client";

// The expense entry form — PHASE4.md §2.7, "the most repeated action in the
// app once spending starts". Amount first with a numeric keypad and
// autofocus, status a segmented control (never a dropdown), category/event as
// chip rows, `paidBy` defaulting to the caller, last-used category/event/
// split mode pre-selected, and the live budget impact as the amount is typed.
//
// Same "hand a draft back to the list screen, which owns the write and the
// aggregate recompute" shape as HouseholdForm — one writer path.

import { useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  ChipRow,
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import { SplitEditor } from "./SplitEditor";
import { sumPaise } from "@/lib/budget";
import { dateInputValue, toTimestamp } from "@/lib/dates";
import { expenseTotalsFrom, projectedTotalPaise, splitShares, validateShares } from "@/lib/expenses";
import { formatINR, paiseToRupeeInput, parseRupeeInput, toPaise } from "@/lib/money";
import {
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  SPLIT_MODES,
  SPLIT_MODE_LABELS,
  type BudgetAllocationWithId,
  type CategoryWithId,
  type Expense,
  type ExpenseStatus,
  type ExpenseWithId,
  type EventWithId,
  type Side,
  type SplitMode,
} from "@/types";

export type ExpenseDraft = Omit<Expense, "createdBy" | "createdAt" | "updatedAt">;

export function ExpenseForm({
  existing,
  expenses,
  categories,
  events,
  members,
  currentUid,
  budgetAllocations,
  sideByUid,
  lastUsed,
  onSave,
  onCancel,
  onDelete,
}: {
  existing?: ExpenseWithId;
  /** The full list minus `existing` (if editing) — for the live "after this"
   *  budget-impact line. Already in memory on the Expenses screen. */
  expenses: readonly ExpenseWithId[];
  categories: readonly CategoryWithId[];
  events: readonly EventWithId[];
  members: readonly { uid: string; label: string }[];
  currentUid: string;
  budgetAllocations: readonly BudgetAllocationWithId[];
  sideByUid: Record<string, Side>;
  lastUsed: { categoryId: string | null; eventId: string | null; splitMode: SplitMode };
  onSave: (draft: ExpenseDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [description, setDescription] = useState(existing?.description ?? "");
  const [amountText, setAmountText] = useState(
    existing ? paiseToRupeeInput(toPaise(existing.amountPaise)) : "",
  );
  const [status, setStatus] = useState<ExpenseStatus>(existing?.status ?? "estimated");
  const [categoryId, setCategoryId] = useState<string | null>(
    existing?.categoryId ?? lastUsed.categoryId ?? categories[0]?.id ?? null,
  );
  const [eventId, setEventId] = useState<string | null>(existing?.eventId ?? lastUsed.eventId ?? null);
  const [dateText, setDateText] = useState(dateInputValue(existing?.date ?? Timestamp.now()));
  const [paidBy, setPaidBy] = useState<string | null>(existing?.paidBy ?? currentUid);
  const [splitMode, setSplitMode] = useState<SplitMode>(existing?.splitMode ?? lastUsed.splitMode);
  const [participantUids, setParticipantUids] = useState<string[]>(
    existing
      ? existing.shares.map((s) => s.uid)
      : lastUsed.splitMode === "single"
        ? [currentUid]
        : members.map((m) => m.uid),
  );
  const [overrides, setOverrides] = useState<Record<string, number>>(
    existing && (existing.splitMode === "exact" || existing.splitMode === "percentage")
      ? Object.fromEntries(existing.shares.map((s) => [s.uid, s.amountPaise]))
      : {},
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseRupeeInput(amountText);
  const amountPaise = parsedAmount ?? toPaise(0);
  const date = toTimestamp(dateText);

  const shares = useMemo(
    () => (participantUids.length > 0 ? splitShares(amountPaise, splitMode, participantUids, overrides) : []),
    [amountPaise, splitMode, participantUids, overrides],
  );
  const sharesOk = amountPaise > 0 && validateShares(amountPaise, shares);

  // Live "after this" budget impact — the whole point of §2.7. Recomputed from
  // the full in-memory list plus this draft, so it reflects exactly what
  // Budget will show the instant this save lands.
  const otherExpenses = existing ? expenses.filter((e) => e.id !== existing.id) : expenses;
  const category = categories.find((c) => c.id === categoryId);
  const ceilingPaise = sumPaise(
    budgetAllocations
      .filter((a) => a.categoryId === categoryId && !a.eventId)
      .map((a) => a.allocatedPaise),
  );
  const combinedForCategory = useMemo(() => {
    if (!categoryId) return 0;
    const projected = expenseTotalsFrom(
      [...otherExpenses, { categoryId, eventId, status, shares, amountPaise }],
      sideByUid,
    );
    return (["a", "b"] as const).reduce((sum, side) => {
      const slice = projected.bySideCategory[`${side}_${categoryId}`];
      return sum + (slice ? projectedTotalPaise(slice) : 0);
    }, 0);
  }, [otherExpenses, categoryId, eventId, status, shares, amountPaise, sideByUid]);

  async function submit() {
    if (!description.trim() || !categoryId || !date || !sharesOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        description: description.trim(),
        amountPaise,
        status,
        categoryId,
        eventId: eventId ?? null,
        date,
        // "estimated — no paidBy" (PHASE4.md § The three states).
        paidBy: status === "estimated" ? null : paidBy,
        splitMode,
        shares,
        notes: notes.trim(),
        receiptURL: null,
      });
    } catch (err) {
      console.error("[expenses] save failed:", err);
      setError("Could not save that expense.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete || !existing) return;
    if (!window.confirm(`Remove "${existing.description}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      console.error("[expenses] delete failed:", err);
      setError("Could not remove that expense.");
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h1 className="text-xl font-semibold text-stone-800">
        {existing ? "Edit expense" : "Add an expense"}
      </h1>

      <Field label="Amount, in rupees">
        <TextInput
          inputMode="decimal"
          autoFocus={!existing}
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0"
          className="text-lg font-semibold"
        />
      </Field>

      <ChipRow<ExpenseStatus>
        label="Status"
        options={EXPENSE_STATUSES.map((s) => ({ value: s, label: EXPENSE_STATUS_LABELS[s] }))}
        value={status}
        onChange={(v) => v && setStatus(v)}
      />

      <Field label="What for">
        <TextInput
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Decor deposit"
        />
      </Field>

      <ChipRow
        label="Category"
        options={categories.map((c) => ({ value: c.id, label: c.name, colour: c.colour, icon: c.icon }))}
        value={categoryId}
        onChange={setCategoryId}
        emptyLabel="No categories yet — add them under More → Setup."
      />

      {category && amountPaise > 0 ? (
        <p className="text-sm text-stone-500">
          {category.name}:{" "}
          <span className="font-semibold text-stone-700">{formatINR(toPaise(combinedForCategory))}</span>{" "}
          of {ceilingPaise > 0 ? formatINR(toPaise(ceilingPaise)) : "no budget set"} after this
        </p>
      ) : null}

      <ChipRow
        label="Event"
        options={events.map((e) => ({ value: e.id, label: e.name, colour: e.colour, icon: e.icon }))}
        value={eventId}
        onChange={setEventId}
        allowClear
        emptyLabel="No events yet — this is a non-event cost."
      />

      <Field label="Date">
        <TextInput type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
      </Field>

      {status !== "estimated" ? (
        <ChipRow
          label="Paid by"
          options={members.map((m) => ({ value: m.uid, label: m.label }))}
          value={paidBy}
          onChange={setPaidBy}
          allowClear
          emptyLabel="No one else is in this wedding yet."
        />
      ) : null}

      <ChipRow<SplitMode>
        label="Split"
        options={SPLIT_MODES.map((m) => ({ value: m, label: SPLIT_MODE_LABELS[m] }))}
        value={splitMode}
        onChange={(v) => {
          if (!v) return;
          setSplitMode(v);
          setOverrides({});
        }}
      />

      <SplitEditor
        amountPaise={amountPaise}
        mode={splitMode}
        members={members}
        participantUids={participantUids}
        onParticipantsChange={setParticipantUids}
        overrides={overrides}
        onOverridesChange={setOverrides}
      />

      <Field label="Notes">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <FormMessage error={error} />

      <div className="flex items-center gap-3">
        <PrimaryButton type="submit" disabled={!description.trim() || !categoryId || !date || !sharesOk || busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
        {existing && onDelete ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="ml-auto min-h-[44px] px-2 text-sm font-medium text-stone-400 hover:text-rose-600"
          >
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );
}
