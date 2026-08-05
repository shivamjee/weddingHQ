"use client";

// The four split modes on the expense form (FEATURES.md §2.2, Step 3).
// Always shows each person's computed share live — "refuse to save when they
// don't sum, using validateShares, so the rule and the UI can't disagree"
// (PHASE4.md Step 3) is enforced by the caller disabling Save, not here; this
// component's job is just to make the live numbers visible.

import { ChipMultiRow, ChipRow, TextInput } from "@/components/ui/form";
import { splitShares, validateShares } from "@/lib/expenses";
import { formatINR, paiseToRupeeInput, parseRupeeInput, toPaise, type Paise } from "@/lib/money";
import type { SplitMode } from "@/types";

export function SplitEditor({
  amountPaise,
  mode,
  members,
  participantUids,
  onParticipantsChange,
  overrides,
  onOverridesChange,
}: {
  amountPaise: Paise;
  mode: SplitMode;
  members: readonly { uid: string; label: string }[];
  participantUids: string[];
  onParticipantsChange: (uids: string[]) => void;
  /** uid → exact paise (mode "exact") or uid → percentage 0-100 (mode
   *  "percentage"). Ignored for "equal"/"single". */
  overrides: Record<string, number>;
  onOverridesChange: (overrides: Record<string, number>) => void;
}) {
  if (mode === "single") {
    return (
      <ChipRow
        label="Bears the whole amount"
        options={members.map((m) => ({ value: m.uid, label: m.label }))}
        value={participantUids[0] ?? null}
        onChange={(uid) => onParticipantsChange(uid ? [uid] : [])}
        emptyLabel="No one else is in this wedding yet."
      />
    );
  }

  const shares = splitShares(amountPaise, mode, participantUids, overrides);
  const shareByUid = Object.fromEntries(shares.map((s) => [s.uid, s.amountPaise]));
  const overrideSum = participantUids.reduce((sum, uid) => sum + (overrides[uid] || 0), 0);

  return (
    <div className="flex flex-col gap-2">
      <ChipMultiRow
        label="Who bears it"
        options={members.map((m) => ({ value: m.uid, label: m.label }))}
        values={participantUids}
        onChange={onParticipantsChange}
        emptyLabel="No one else is in this wedding yet."
      />

      {participantUids.length > 0 ? (
        <ul className="flex flex-col gap-1.5 rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2">
          {participantUids.map((uid) => {
            const label = members.find((m) => m.uid === uid)?.label ?? uid;
            return (
              <li key={uid} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-stone-600">{label}</span>
                {mode === "exact" ? (
                  <TextInput
                    inputMode="decimal"
                    value={overrides[uid] != null ? paiseToRupeeInput(toPaise(overrides[uid])) : ""}
                    onChange={(e) =>
                      onOverridesChange({
                        ...overrides,
                        [uid]: parseRupeeInput(e.target.value) ?? 0,
                      })
                    }
                    placeholder="0"
                    className="min-h-[36px] w-28 text-right"
                  />
                ) : mode === "percentage" ? (
                  <TextInput
                    inputMode="decimal"
                    value={overrides[uid] ?? ""}
                    onChange={(e) =>
                      onOverridesChange({ ...overrides, [uid]: Number(e.target.value) || 0 })
                    }
                    placeholder="0%"
                    className="min-h-[36px] w-20 text-right"
                  />
                ) : (
                  <span className="shrink-0 font-medium text-stone-700">
                    {formatINR(toPaise(shareByUid[uid] ?? 0))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {mode === "percentage" && participantUids.length > 0 && overrideSum !== 100 ? (
        <p className="text-xs text-amber-700">
          Percentages add up to {overrideSum}%, not 100 — shares are still adjusted to total the
          full amount exactly.
        </p>
      ) : null}

      {mode === "exact" && participantUids.length > 0 ? (
        <p
          className={`text-xs ${
            validateShares(amountPaise, shares) ? "text-stone-400" : "text-rose-600"
          }`}
        >
          {formatINR(toPaise(shares.reduce((sum, s) => sum + s.amountPaise, 0)))} of{" "}
          {formatINR(amountPaise)}
        </p>
      ) : null}
    </div>
  );
}
