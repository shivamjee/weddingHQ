"use client";

// The tier ladder (PHASE3 Step 2, FEATURES.md §4.2) — the highest-value screen
// in the phase and nearly free once households exist.
//
// CUMULATIVE, not per-tier. "Must 260, +Should 430, +If space 550" against a
// target of 400 turns the conversation into "which of these are really Should?"
// instead of "why did you delete my cousin?". The running total is the point;
// a per-tier table would show the same data and start none of that.
//
// The target lives in settings/guestTarget and is member-writable like every
// other setting. Without one, the ladder still shows running totals — it just
// doesn't invent a line for them to cross.

import { useState } from "react";
import { setDoc, serverTimestamp } from "firebase/firestore";
import { PrimaryButton, SecondaryButton, TextInput } from "@/components/ui/form";
import { guestTargetDoc } from "@/lib/paths";
import { formatCompact } from "@/lib/money";
import { TIER_LABELS, type Tier } from "@/types";
import type { LadderRow } from "@/lib/guests";

const RUNG_LABEL: Record<Tier, string> = {
  must: TIER_LABELS.must,
  should: `+ ${TIER_LABELS.should}`,
  if_space: `+ ${TIER_LABELS.if_space}`,
};

export function TierLadder({
  rows,
  targetHeads,
  tenantId,
  uid,
  onTargetSaved,
}: {
  rows: LadderRow[];
  targetHeads: number | null;
  tenantId: string;
  uid: string;
  onTargetSaved: (target: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const total = rows[rows.length - 1];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-stone-800">Where the line falls</h2>
        {editing ? null : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto min-h-[44px] px-2 text-sm font-medium text-rose-600"
          >
            {targetHeads ? `Target ${targetHeads}` : "Set a target"}
          </button>
        )}
      </div>

      {editing ? (
        <TargetEditor
          tenantId={tenantId}
          uid={uid}
          targetHeads={targetHeads}
          onDone={(value) => {
            onTargetSaved(value);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs font-medium text-stone-500">
              <th className="px-4 py-2 font-medium">Tier</th>
              <th className="px-2 py-2 text-right font-medium">People</th>
              <th className="px-2 py-2 text-right font-medium">Running</th>
              <th className="px-4 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.tier}
                className={`border-b border-stone-50 last:border-0 ${
                  row.overBy > 0 ? "bg-rose-50/60" : ""
                }`}
              >
                <td className="px-4 py-3 text-stone-700">
                  {RUNG_LABEL[row.tier]}
                  <span className="block text-xs text-stone-400">
                    {row.households} {row.households === 1 ? "household" : "households"}
                  </span>
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-stone-500">{row.people}</td>
                <td className="px-2 py-3 text-right font-semibold tabular-nums text-stone-800">
                  {row.runningPeople}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-stone-600">
                  {formatCompact(row.runningPaise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The one sentence the whole table exists to produce. */}
      {targetHeads && total ? (
        <p className="text-sm">
          {rows.some((r) => r.breaksTarget) ? (
            <span className="text-rose-700">
              {(() => {
                const breaker = rows.find((r) => r.breaksTarget);
                if (!breaker) return null;
                return (
                  <>
                    <strong>{RUNG_LABEL[breaker.tier].replace("+ ", "")}</strong> breaks the target
                    of {targetHeads} by <strong>{breaker.overBy}</strong>{" "}
                    {breaker.overBy === 1 ? "person" : "people"}.
                  </>
                );
              })()}
            </span>
          ) : (
            <span className="text-emerald-700">
              Everyone fits: {total.runningPeople} of {targetHeads}, with{" "}
              {targetHeads - total.runningPeople} to spare.
            </span>
          )}
        </p>
      ) : (
        <p className="text-sm text-stone-400">
          Set a target headcount to see which tier breaks it.
        </p>
      )}
    </section>
  );
}

function TargetEditor({
  tenantId,
  uid,
  targetHeads,
  onDone,
  onCancel,
}: {
  tenantId: string;
  uid: string;
  targetHeads: number | null;
  onDone: (target: number | null) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(targetHeads === null ? "" : String(targetHeads));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = Number.parseInt(text.replace(/[^\d]/g, ""), 10);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    setBusy(true);
    try {
      await setDoc(guestTargetDoc(tenantId), {
        targetHeads: value,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      onDone(value > 0 ? value : null);
    } catch (err) {
      console.error("[guests] target save failed:", err);
      setError("Could not save that target.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4">
      <label className="text-xs font-medium text-stone-500" htmlFor="guest-target">
        How many people can the venue hold?
      </label>
      <TextInput
        id="guest-target"
        value={text}
        onChange={(e) => setText(e.target.value)}
        inputMode="numeric"
        placeholder="400"
        autoFocus
      />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="flex gap-3">
        <PrimaryButton type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}
