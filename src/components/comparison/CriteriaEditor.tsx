"use client";

// Editing a comparison's criteria (FEATURES.md §3.2).
//
// A criterion's ID NEVER CHANGES once created, only its label. Every option's
// `values` map is keyed by that id, so regenerating it on rename would orphan
// every value already recorded — the table would silently blank out.
//
// Deleting a criterion removes the column but deliberately leaves the stored
// values on each option alone: they cost nothing, and re-adding a criterion
// someone deleted by accident brings the data back rather than losing it.

import { useState } from "react";
import { criterionId } from "@/lib/comparison";
import {
  ChipRow,
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@/components/ui/form";
import {
  CRITERION_TYPES,
  CRITERION_TYPE_LABELS,
  type Criterion,
  type CriterionType,
} from "@/types";

export function CriteriaEditor({
  criteria,
  onSave,
  onCancel,
  busy,
  error,
}: {
  criteria: Criterion[];
  onSave: (criteria: Criterion[]) => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [draft, setDraft] = useState<Criterion[]>(criteria);
  const [adding, setAdding] = useState(false);

  function update(id: string, patch: Partial<Criterion>) {
    setDraft((rows) => rows.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= draft.length) return;
    setDraft((rows) => {
      const next = [...rows];
      const [moved] = next.splice(index, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-stone-800">Criteria</h2>
        <p className="mt-1 text-sm text-stone-500">
          The rows of the table. Renaming one keeps everything already filled in.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {draft.map((criterion, index) => (
          <li
            key={criterion.id}
            className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4"
          >
            <div className="flex items-center gap-2">
              <TextInput
                value={criterion.label}
                onChange={(e) => update(criterion.id, { label: e.target.value })}
              />
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  className="h-6 w-8 text-stone-400 disabled:opacity-25"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={index === draft.length - 1}
                  onClick={() => move(index, index + 1)}
                  className="h-6 w-8 text-stone-400 disabled:opacity-25"
                >
                  ▼
                </button>
              </div>
            </div>

            <ChipRow<CriterionType>
              options={CRITERION_TYPES.map((t) => ({ value: t, label: CRITERION_TYPE_LABELS[t] }))}
              value={criterion.type}
              onChange={(v) => v && update(criterion.id, { type: v })}
            />

            {/* "Better is" only means something for the orderable types. Shown
                rather than inferred because a plain number can go either way —
                capacity higher, distance lower. */}
            {criterion.type === "number" ||
            criterion.type === "money" ||
            criterion.type === "rating" ? (
              <ChipRow<"higher" | "lower">
                label="Best value is"
                options={[
                  { value: "higher", label: "Higher" },
                  { value: "lower", label: "Lower" },
                ]}
                value={criterion.betterIs ?? (criterion.type === "money" ? "lower" : "higher")}
                onChange={(v) => v && update(criterion.id, { betterIs: v })}
              />
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <ChipRow<string>
                label="Importance"
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                value={String(criterion.weight || 3)}
                onChange={(v) => v && update(criterion.id, { weight: Number(v) })}
              />
              <button
                type="button"
                onClick={() => setDraft((rows) => rows.filter((c) => c.id !== criterion.id))}
                className="min-h-[44px] shrink-0 self-end px-2 text-sm font-medium text-stone-400 hover:text-rose-600"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {adding ? (
        <NewCriterionForm
          existingIds={draft.map((c) => c.id)}
          onAdd={(criterion) => {
            setDraft((rows) => [...rows, criterion]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <SecondaryButton onClick={() => setAdding(true)} className="self-start">
          + Add criterion
        </SecondaryButton>
      )}

      <FormMessage error={error} />

      <div className="flex gap-2 pb-4">
        <PrimaryButton
          onClick={() => onSave(draft.filter((c) => c.label.trim() !== ""))}
          disabled={busy}
        >
          {busy ? "Saving…" : "Save criteria"}
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}

function NewCriterionForm({
  existingIds,
  onAdd,
  onCancel,
}: {
  existingIds: string[];
  onAdd: (criterion: Criterion) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CriterionType>("text");
  const clean = label.trim();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
      <Field label="What are you comparing on?">
        <TextInput
          value={label}
          autoFocus
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Generator backup"
        />
      </Field>
      <ChipRow<CriterionType>
        label="Type"
        options={CRITERION_TYPES.map((t) => ({ value: t, label: CRITERION_TYPE_LABELS[t] }))}
        value={type}
        onChange={(v) => v && setType(v)}
      />
      <div className="flex gap-2">
        <PrimaryButton
          disabled={!clean}
          onClick={() =>
            onAdd({
              id: criterionId(clean, existingIds),
              label: clean,
              type,
              weight: 3,
              source: "human",
            })
          }
        >
          Add
        </PrimaryButton>
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
      </div>
    </div>
  );
}
