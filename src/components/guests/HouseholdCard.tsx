"use client";

// One row of the guest list — READ-ONLY overview, same pattern as Contacts
// (src/app/t/[tenantId]/plan/contacts/page.tsx): the card shows the facts,
// "Edit" is an explicit button, and a phone number is a tap-to-call/WhatsApp
// link rather than part of the edit-trigger. See ActionLink in
// src/components/ui/form.tsx.
//
// It shows the PLANNED head count and not "n named": a count of names would
// need the whole `guests` collection read alongside the households on every
// visit, roughly doubling the screen's read cost to decorate a list. The
// planned-versus-named comparison lives on the names screen, which is where
// somebody is actually reconciling the two (FEATURES.md §4.1).

import { ActionLink, OptionMark } from "@/components/ui/form";
import { formatCompact } from "@/lib/money";
import { formatPhone, mailtoHref, telHref, whatsappHref } from "@/lib/phone";
import { householdCostPaise, householdHeads, type PlateByEventId } from "@/lib/guests";
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
  const tel = telHref(household.primaryPhone);
  const wa = whatsappHref(household.primaryPhone);
  const mail = mailtoHref(household.email ?? "");

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
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
          {household.primaryPhone ? (
            <p className="mt-1 text-sm text-stone-500">{formatPhone(household.primaryPhone)}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-stone-400 hover:text-stone-800"
        >
          Edit
        </button>
      </div>

      {/* Only rendered when the value actually parses — a dead tap that opens
          a dialler on an empty number is worse than no link at all. */}
      {tel || wa || mail ? (
        <div className="flex flex-wrap gap-2">
          {tel ? <ActionLink href={tel} label="Call" /> : null}
          {wa ? <ActionLink href={wa} label="WhatsApp" external /> : null}
          {mail ? <ActionLink href={mail} label="Email" /> : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onNames}
        className="self-start min-h-[44px] rounded-full border border-stone-300 px-3 text-sm font-medium text-stone-600"
      >
        Names
      </button>
    </li>
  );
}
