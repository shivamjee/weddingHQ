"use client";

// One editor per criterion type, and the shared rendering of a stored value.
//
// STORAGE CONTRACT — everything else in the comparison screens assumes it:
//   text    → string
//   number  → number
//   money   → INTEGER PAISE (src/lib/money.ts), never rupees, never a float
//   rating  → number 1-5
//   boolean → boolean
//   blank   → the key is ABSENT from `values`, never "" and never 0. A criterion
//             added after an option existed is blank on it, and a blank must
//             stay distinguishable from a real zero — otherwise the option
//             nobody has filled in wins every "cheapest" comparison.

import { formatINR, paiseToRupeeInput, parseRupeeInput, toPaise } from "@/lib/money";
import { TextInput } from "@/components/ui/form";
import type { CriterionType } from "@/types";
import type { CriterionValue } from "@/lib/comparison";

/** Small marker on any value that came from the AI assist and hasn't been
 *  edited by a person (PHASE2 Step 5b). An unverified guess must never look
 *  identical to something confirmed on a call. */
export function AiChip({ confidence }: { confidence?: number }) {
  return (
    <span
      className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-violet-700 uppercase"
      title={
        confidence !== undefined
          ? `Suggested by AI (${Math.round(confidence * 100)}% confident) — not confirmed by anyone yet`
          : "Suggested by AI — not confirmed by anyone yet"
      }
    >
      AI
    </span>
  );
}

export function ValueInput({
  type,
  value,
  onChange,
  label,
}: {
  type: CriterionType;
  value: CriterionValue | undefined;
  /** `undefined` clears the value — the key is then removed from `values`. */
  onChange: (value: CriterionValue | undefined) => void;
  label: string;
}) {
  switch (type) {
    case "boolean":
      return (
        <div className="flex gap-2">
          {[
            { v: true, l: "Yes" },
            { v: false, l: "No" },
          ].map(({ v, l }) => (
            <button
              key={l}
              type="button"
              aria-pressed={value === v}
              // Tapping the selected answer clears it back to "not known",
              // which is different from "no".
              onClick={() => onChange(value === v ? undefined : v)}
              className={`min-h-[44px] flex-1 rounded-xl border text-sm font-medium transition-colors ${
                value === v
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-stone-300 text-stone-600"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      );

    case "rating":
      return (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} out of 5`}
              aria-pressed={value === n}
              onClick={() => onChange(value === n ? undefined : n)}
              className={`min-h-[44px] flex-1 rounded-xl border text-sm font-medium transition-colors ${
                value === n
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-stone-300 text-stone-600"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      );

    case "money":
      return (
        <MoneyInput
          paise={typeof value === "number" ? value : undefined}
          onChange={onChange}
          label={label}
        />
      );

    case "number":
      return (
        <TextInput
          inputMode="numeric"
          value={value === undefined ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === "") return onChange(undefined);
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : raw);
          }}
          placeholder="500"
        />
      );

    default:
      return (
        <TextInput
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        />
      );
  }
}

function MoneyInput({
  paise,
  onChange,
  label,
}: {
  paise: number | undefined;
  onChange: (value: CriterionValue | undefined) => void;
  label: string;
}) {
  // Held as text while typing so "1800." and "18" are both valid intermediate
  // states; only a cleanly parsing value is written upward as paise.
  const text = paise === undefined ? "" : paiseToRupeeInput(toPaise(paise));
  const parsed = parseRupeeInput(text);

  return (
    <div className="flex flex-col gap-1">
      <TextInput
        inputMode="decimal"
        defaultValue={text}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw.trim() === "") return onChange(undefined);
          const value = parseRupeeInput(raw);
          // Unparseable text is simply not committed — the field keeps showing
          // what was typed, and the stored value stays the last good one.
          if (value !== null) onChange(value);
        }}
        placeholder="1800"
        aria-label={`${label}, in rupees`}
      />
      <span className="text-xs text-stone-400">
        {parsed !== null ? formatINR(parsed) : "In rupees, e.g. 1800"}
      </span>
    </div>
  );
}
