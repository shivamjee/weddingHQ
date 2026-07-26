"use client";

// "Add with AI" — paste your visit notes, review what it found, apply what you
// agree with (PHASE2 Step 5b).
//
// THE NON-NEGOTIABLE: nothing here auto-saves. Every proposed value, every
// proposed new criterion and the summary has its own checkbox and is editable
// inline. One Apply writes them in a single batch. An unverified guess must
// never look identical to something someone confirmed on a call, so anything
// that lands from here carries `valueMeta[id] = { source: "ai", confidence }`
// and renders with an "AI" chip until a person edits it.
//
// Pre-checking is by CONFIDENCE, and only above a threshold. Pre-checking
// everything would turn "review" into "notice, eventually" — which is the same
// as auto-saving with extra steps.
//
// PRIVACY: only the notes the person typed and the criteria LABELS are sent.
// Never a contact's phone number or email — free-tier prompts may be used to
// improve the provider's models.

import { useState } from "react";
import { addDoc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { comparisonDoc, optionsCol } from "@/lib/paths";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTenant } from "@/lib/tenants/TenantProvider";
import { criterionId, formatValue, type CriterionValue } from "@/lib/comparison";
import { ValueInput } from "@/components/comparison/ValueInput";
import {
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import type { Criterion, CriterionType, ValueMeta } from "@/types";

/** Above this, a suggestion arrives pre-ticked. Below it, the person has to
 *  make a deliberate choice — which is the point. */
const AUTO_TICK_CONFIDENCE = 0.7;

interface SuggestedValue {
  criterionId: string;
  label: string;
  type: CriterionType;
  value: CriterionValue;
  unitHint?: string;
  confidence: number;
  sourceText: string;
}

interface SuggestedCriterion {
  label: string;
  type: CriterionType;
  weight: number;
  why: string;
  value?: CriterionValue;
  confidence: number;
}

interface Suggestion {
  optionName: string;
  summary: string;
  values: SuggestedValue[];
  newCriteria: SuggestedCriterion[];
  unknowns: string[];
  truncated: boolean;
}

export function AiAssistSheet({
  comparisonId,
  criteria,
  onDone,
  onCancel,
  onAddQuestions,
}: {
  comparisonId: string;
  criteria: Criterion[];
  onDone: () => void;
  onCancel: () => void;
  /** Hands `unknowns` off as candidate open questions (PHASE2 Step 4), with
   *  `askWho` prefilled from whatever this option is called. */
  onAddQuestions: (questions: string[], askWho: string) => void;
}) {
  const { user } = useAuth();
  const { tenantId } = useTenant();

  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [addedQuestions, setAddedQuestions] = useState(false);

  // Review state — all of it starts from the suggestion but is fully editable.
  const [optionName, setOptionName] = useState("");
  const [summary, setSummary] = useState("");
  const [acceptSummary, setAcceptSummary] = useState(true);
  const [values, setValues] = useState<
    Record<string, { accepted: boolean; value: CriterionValue }>
  >({});
  const [newCriteria, setNewCriteria] = useState<
    { accepted: boolean; draft: SuggestedCriterion }[]
  >([]);

  async function analyse() {
    if (busy || !auth.currentUser) return;
    setBusy(true);
    setError(null);
    try {
      // The route verifies this token and confirms tenant membership before
      // spending any quota.
      const token = await getIdToken(auth.currentUser);
      const response = await fetch("/api/ai/compare", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenantId,
          notes,
          criteria: criteria.map((c) => ({ id: c.id, label: c.label, type: c.type })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }

      const result = data as Suggestion;
      setSuggestion(result);
      setOptionName(result.optionName || "");
      setSummary(result.summary || "");
      setAcceptSummary(Boolean(result.summary));
      setValues(
        Object.fromEntries(
          result.values.map((v) => [
            v.criterionId,
            { accepted: v.confidence >= AUTO_TICK_CONFIDENCE, value: v.value },
          ]),
        ),
      );
      setNewCriteria(
        result.newCriteria.map((c) => ({
          accepted: c.confidence >= AUTO_TICK_CONFIDENCE,
          draft: c,
        })),
      );
    } catch (err) {
      console.error("[ai] request failed:", err);
      setError("Couldn't reach the AI. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!suggestion || busy || !user) return;
    const name = optionName.trim();
    if (!name) {
      setError("Give this option a name first.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      // Accepted new criteria become real columns. Their ids are generated the
      // same way a hand-added criterion's would be — nothing about them is
      // special once accepted, other than source: "ai".
      const acceptedNew = newCriteria.filter((c) => c.accepted);
      const existingIds = criteria.map((c) => c.id);
      const added: { criterion: Criterion; value?: CriterionValue; confidence: number }[] = [];

      for (const { draft } of acceptedNew) {
        const id = criterionId(draft.label, [...existingIds, ...added.map((a) => a.criterion.id)]);
        added.push({
          criterion: {
            id,
            label: draft.label,
            type: draft.type,
            weight: draft.weight,
            source: "ai",
          },
          value: draft.value,
          confidence: draft.confidence,
        });
      }

      const optionValues: Record<string, CriterionValue> = {};
      const valueMeta: Record<string, ValueMeta> = {};
      const now = Timestamp.now();

      for (const [id, entry] of Object.entries(values)) {
        if (!entry.accepted) continue;
        optionValues[id] = entry.value;
        const confidence = suggestion.values.find((v) => v.criterionId === id)?.confidence;
        valueMeta[id] = { source: "ai", confidence, aiAt: now };
      }
      for (const a of added) {
        if (a.value === undefined) continue;
        optionValues[a.criterion.id] = a.value;
        valueMeta[a.criterion.id] = { source: "ai", confidence: a.confidence, aiAt: now };
      }

      // Two writes, not one transaction: they touch different documents and a
      // partial result here is recoverable by hand (a column with no value, or
      // a value with no column would be the bad case — so criteria go FIRST).
      if (added.length > 0) {
        await updateDoc(comparisonDoc(tenantId, comparisonId), {
          criteria: [...criteria, ...added.map((a) => a.criterion)],
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(optionsCol(tenantId, comparisonId), {
        name,
        contactId: null,
        status: "considering",
        summary: acceptSummary ? summary.trim() : "",
        notes: notes.trim(),
        values: optionValues,
        valueMeta,
        photoURLs: [],
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      onDone();
    } catch (err) {
      console.error("[ai] apply failed:", err);
      setError("Could not save. Nothing was changed.");
      setBusy(false);
    }
  }

  // ---- input step --------------------------------------------------------
  if (!suggestion) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold text-stone-800">Add with AI</h2>
          <p className="mt-1 text-sm text-stone-500">
            Paste your visit notes, or a message the venue sent. It suggests columns and fills in
            what it can — you decide what to keep.
          </p>
        </div>

        <Field
          label="Notes"
          hint="Don't paste anyone's phone number or email — this goes to an outside service."
        >
          <TextArea
            value={notes}
            autoFocus
            rows={8}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Taj Palace, holds about 500, ₹1,800 a plate, no in-house alcohol licence, parking for 80 cars, they were cagey about the DJ curfew."
          />
        </Field>

        <FormMessage error={error} />

        <div className="flex gap-2 pb-4">
          <PrimaryButton onClick={analyse} disabled={busy || notes.trim().length < 10}>
            {busy ? "Reading…" : "Read my notes"}
          </PrimaryButton>
          <SecondaryButton onClick={onCancel} disabled={busy}>
            Cancel
          </SecondaryButton>
        </div>
      </div>
    );
  }

  // ---- review step -------------------------------------------------------
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold text-stone-800">Review</h2>
        <p className="mt-1 text-sm text-stone-500">
          Nothing is saved until you tap Apply. Untick anything you don&rsquo;t want, and edit
          anything that&rsquo;s wrong.
        </p>
      </div>

      {suggestion.truncated ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your notes were long, so only the first part was read.
        </p>
      ) : null}

      <Field label="Name">
        <TextInput value={optionName} onChange={(e) => setOptionName(e.target.value)} />
      </Field>

      {suggestion.summary ? (
        <ReviewBlock
          checked={acceptSummary}
          onToggle={() => setAcceptSummary((v) => !v)}
          title="Summary"
        >
          <TextArea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
        </ReviewBlock>
      ) : null}

      {suggestion.newCriteria.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div>
            <h3 className="text-base font-semibold text-stone-800">Suggested new columns</h3>
            <p className="text-sm text-stone-500">
              Things your notes mention that the table has no column for. These apply to every
              option — the others will be blank until you fill them in.
            </p>
          </div>
          {newCriteria.map((entry, index) => (
            <ReviewBlock
              key={`${entry.draft.label}-${index}`}
              checked={entry.accepted}
              onToggle={() =>
                setNewCriteria((rows) =>
                  rows.map((r, i) => (i === index ? { ...r, accepted: !r.accepted } : r)),
                )
              }
              title={entry.draft.label}
              subtitle={entry.draft.why}
              confidence={entry.draft.confidence}
            >
              {entry.draft.value !== undefined ? (
                <p className="text-sm text-stone-600">
                  This option:{" "}
                  <strong className="font-semibold">
                    {formatValue(entry.draft.value, entry.draft.type)}
                  </strong>
                </p>
              ) : (
                <p className="text-sm text-stone-400">No value found for this option.</p>
              )}
            </ReviewBlock>
          ))}
        </section>
      ) : null}

      {suggestion.values.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-stone-800">Values for existing columns</h3>
          {suggestion.values.map((v) => {
            const entry = values[v.criterionId];
            if (!entry) return null;
            return (
              <ReviewBlock
                key={v.criterionId}
                checked={entry.accepted}
                onToggle={() =>
                  setValues((prev) => ({
                    ...prev,
                    [v.criterionId]: {
                      ...prev[v.criterionId],
                      accepted: !prev[v.criterionId].accepted,
                    },
                  }))
                }
                title={v.label}
                subtitle={v.sourceText ? `“${v.sourceText}”` : undefined}
                confidence={v.confidence}
              >
                <ValueInput
                  type={v.type}
                  value={entry.value}
                  label={v.label}
                  onChange={(value) =>
                    setValues((prev) => ({
                      ...prev,
                      [v.criterionId]: {
                        accepted: prev[v.criterionId].accepted,
                        value: value ?? "",
                      },
                    }))
                  }
                />
                {v.unitHint ? (
                  <p className="mt-1 text-xs text-stone-400">Reported as: {v.unitHint}</p>
                ) : null}
              </ReviewBlock>
            );
          })}
        </section>
      ) : null}

      {suggestion.unknowns.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <h3 className="text-base font-semibold text-stone-800">Couldn&rsquo;t tell</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-stone-600">
            {suggestion.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          <SecondaryButton
            onClick={() => {
              onAddQuestions(suggestion.unknowns, optionName.trim());
              setAddedQuestions(true);
            }}
            disabled={addedQuestions}
            className="mt-1 self-start"
          >
            {addedQuestions ? "Added to Questions" : "Add these to Questions"}
          </SecondaryButton>
        </section>
      ) : null}

      <FormMessage error={error} />

      <div className="flex gap-2 pb-4">
        <PrimaryButton onClick={apply} disabled={busy}>
          {busy ? "Saving…" : "Apply"}
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}

function ReviewBlock({
  checked,
  onToggle,
  title,
  subtitle,
  confidence,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  subtitle?: string;
  confidence?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border p-4 transition-colors ${
        checked ? "border-violet-200 bg-violet-50/40" : "border-stone-200 bg-white"
      }`}
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-5 w-5 shrink-0 accent-violet-500"
        />
        <span className="min-w-0">
          <span className="block text-base font-medium text-stone-800">{title}</span>
          {subtitle ? <span className="block text-xs text-stone-500">{subtitle}</span> : null}
          {confidence !== undefined ? (
            <span className="mt-0.5 block text-xs text-stone-400">
              {Math.round(confidence * 100)}% confident
              {confidence < AUTO_TICK_CONFIDENCE ? " — worth checking" : ""}
            </span>
          ) : null}
        </span>
      </label>
      <div className={checked ? "" : "opacity-50"}>{children}</div>
    </div>
  );
}
