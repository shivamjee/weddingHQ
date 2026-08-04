"use client";

// One row of the guest list.
//
// It shows the PLANNED head count and not "n named": a count of names would
// need the whole `guests` collection read alongside the households on every
// visit, roughly doubling the screen's read cost to decorate a list. The
// planned-versus-named comparison lives on the names screen, which is where
// somebody is actually reconciling the two (FEATURES.md §4.1).

import { OptionMark } from "@/components/ui/form";
import { formatCompact } from "@/lib/money";
import { householdHeads, type PlateByEventId } from "@/lib/guests";
import { householdCostPaise } from "@/lib/guests";
import { TIER_LABELS, type HouseholdWithId } from "@/types";

export function HouseholdCard({
  household,
  plates,
  sideLabel,
  eventNames,
  onEdit,
  onNames,
}: {
  household: HouseholdWithId;
  plates: PlateByEventId;
  sideLabel: string;
  eventNames: { id: string; name: string; colour: string; icon?: string }[];
  onEdit: () => void;
  onNames: () => void;
}) {
  const heads = householdHeads(household);
  const cost = householdCostPaise(household, plates);

  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
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
          {household.relationship ? (
            <p className="mt-0.5 text-xs text-stone-400">{household.relationship}</p>
          ) : null}
          {eventNames.length > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400">
              {eventNames.map((e) => (
                <span key={e.id} className="flex items-center gap-1">
                  <OptionMark colour={e.colour} icon={e.icon} className="h-2 w-2" />
                  {e.name}
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-1 text-xs text-stone-400">No events yet — not in any count.</p>
          )}
          {household.accommodationNeeded ? (
            <p className="mt-1 text-xs text-stone-400">
              Needs a room{household.roomsNeeded ? ` × ${household.roomsNeeded}` : ""}
              {household.nightsNeeded ? ` for ${household.nightsNeeded} nights` : ""}
            </p>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onNames}
          className="min-h-[44px] shrink-0 rounded-full border border-stone-300 px-3 text-sm font-medium text-stone-600"
        >
          Names
        </button>
      </div>
    </li>
  );
}
