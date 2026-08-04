"use client";

// One row of the guest list — MINIMAL by design. Full details (address,
// notes, contact links, the whole event list) live on HouseholdView, reached
// by tapping the row. Keeping the row itself to a glance is what a list of
// a hundred households stays scannable on a phone.
//
// It shows the PLANNED head count and not "n named": a count of names would
// need the whole `guests` collection read alongside the households on every
// visit, roughly doubling the screen's read cost to decorate a list. The
// planned-versus-named comparison lives on the names screen, which is where
// somebody is actually reconciling the two (FEATURES.md §4.1).

import { formatCompact } from "@/lib/money";
import { householdCostPaise, householdHeads, type PlateByEventId } from "@/lib/guests";
import { TIER_LABELS, type HouseholdWithId } from "@/types";

export function HouseholdCard({
  household,
  plates,
  sideLabel,
  onView,
}: {
  household: HouseholdWithId;
  plates: PlateByEventId;
  sideLabel: string;
  onView: () => void;
}) {
  const heads = householdHeads(household);
  const cost = householdCostPaise(household, plates);

  return (
    <li>
      <button
        type="button"
        onClick={onView}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-stone-800">
            <span className="truncate">{household.name}</span>
            {household.status === "proposed" ? (
              // Visibly not agreed, but still counted everywhere (§4.3).
              <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                Proposed
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {TIER_LABELS[household.tier]} · {sideLabel} · {heads}{" "}
            {heads === 1 ? "person" : "people"}
            {cost > 0 ? ` · ${formatCompact(cost)}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-stone-300" aria-hidden>
          &rsaquo;
        </span>
      </button>
    </li>
  );
}
