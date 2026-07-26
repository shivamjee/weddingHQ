"use client";

// Adding or editing one option in a comparison — one venue, one caterer.
//
// PROVENANCE (PHASE2 Step 5b): an AI-suggested value carries
// `valueMeta[criterionId] = { source: "ai", confidence }` and renders with an
// "AI" chip. The moment a person changes that value here, the chip must clear —
// they have just confirmed or corrected it, so it is no longer an unverified
// guess. That is handled on save by diffing against the original values, which
// means it works no matter how the value was edited.

import { useState } from "react";
import { addDoc, deleteDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { optionDoc, optionsCol } from "@/lib/paths";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTenant } from "@/lib/tenants/TenantProvider";
import { AiChip, ValueInput } from "@/components/comparison/ValueInput";
import {
  ChipRow,
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import {
  OPTION_STATUSES,
  OPTION_STATUS_LABELS,
  type ComparisonOptionWithId,
  type Criterion,
  type OptionStatus,
  type ValueMeta,
} from "@/types";
import type { CriterionValue } from "@/lib/comparison";

export function OptionForm({
  comparisonId,
  criteria,
  existing,
  contacts,
  onDone,
  onCancel,
}: {
  comparisonId: string;
  criteria: Criterion[];
  existing?: ComparisonOptionWithId;
  contacts: { id: string; name: string; organisation: string }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { tenantId } = useTenant();

  const [name, setName] = useState(existing?.name ?? "");
  const [contactId, setContactId] = useState<string | null>(existing?.contactId ?? null);
  const [status, setStatus] = useState<OptionStatus>(existing?.status ?? "considering");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [values, setValues] = useState<Record<string, CriterionValue>>(existing?.values ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originalValues = existing?.values ?? {};
  const originalMeta = existing?.valueMeta ?? {};
  const clean = name.trim();

  function setValue(criterionId: string, value: CriterionValue | undefined) {
    setValues((prev) => {
      const next = { ...prev };
      // Clearing REMOVES the key rather than storing "" or 0 — a blank must
      // stay distinguishable from a real zero (see ValueInput's contract).
      if (value === undefined) delete next[criterionId];
      else next[criterionId] = value;
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean || busy || !user) return;
    setBusy(true);
    setError(null);

    // Any value a person touched is now theirs, so its AI marker goes. Values
    // they left alone keep whatever provenance they had.
    const valueMeta: Record<string, ValueMeta> = {};
    for (const [criterionId, meta] of Object.entries(originalMeta)) {
      const unchanged = originalValues[criterionId] === values[criterionId];
      if (unchanged) valueMeta[criterionId] = meta;
    }

    const fields = {
      name: clean,
      contactId,
      status,
      summary: summary.trim(),
      notes: notes.trim(),
      values,
      valueMeta,
      updatedAt: serverTimestamp(),
    };

    try {
      if (existing) {
        await updateDoc(optionDoc(tenantId, comparisonId, existing.id), fields);
      } else {
        await addDoc(optionsCol(tenantId, comparisonId), {
          ...fields,
          // Firebase Storage is not enabled until Phase 6 — no upload anywhere
          // in this phase, so this stays empty.
          photoURLs: [],
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      onDone();
    } catch (err) {
      console.error("[comparison] option save failed:", err);
      setError("Could not save that option.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!window.confirm(`Remove ${existing.name} from this comparison?`)) return;
    setBusy(true);
    try {
      await deleteDoc(optionDoc(tenantId, comparisonId, existing.id));
      onDone();
    } catch (err) {
      console.error("[comparison] option delete failed:", err);
      setError("Could not remove that option.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-stone-800">
        {existing ? `Edit ${existing.name}` : "Add an option"}
      </h2>

      <Field label="Name">
        <TextInput
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Taj Palace"
        />
      </Field>

      <ChipRow<OptionStatus>
        label="Status"
        options={OPTION_STATUSES.map((s) => ({ value: s, label: OPTION_STATUS_LABELS[s] }))}
        value={status}
        onChange={(v) => v && setStatus(v)}
      />

      {contacts.length > 0 ? (
        <ChipRow
          label="Contact (optional)"
          options={contacts.map((c) => ({
            value: c.id,
            label: c.organisation ? `${c.name} · ${c.organisation}` : c.name,
          }))}
          value={contactId}
          onChange={setContactId}
          allowClear
        />
      ) : null}

      <Field label="Summary (optional)" hint="A couple of sentences — what this place is like.">
        <TextArea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
      </Field>

      {criteria.length > 0 ? (
        <fieldset className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-stone-700">Criteria</legend>
          {criteria.map((criterion) => {
            const meta = originalMeta[criterion.id];
            const stillAi =
              meta?.source === "ai" && originalValues[criterion.id] === values[criterion.id];
            return (
              <div key={criterion.id} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-stone-500">
                  {criterion.label}
                  {stillAi ? <AiChip confidence={meta.confidence} /> : null}
                </span>
                <ValueInput
                  type={criterion.type}
                  value={values[criterion.id]}
                  onChange={(v) => setValue(criterion.id, v)}
                  label={criterion.label}
                />
              </div>
            );
          })}
        </fieldset>
      ) : (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-4 text-sm text-stone-400">
          No criteria on this comparison yet — add some and they&rsquo;ll appear here to fill in.
        </p>
      )}

      <Field label="Notes (optional)">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

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
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );
}
