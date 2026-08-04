"use client";

// A household's profile — read-only, reached by tapping its row on the list.
// Everything the list row omits (address, notes, travel, the full event list)
// lives here instead, along with tap-to-call/WhatsApp/email. Edit is an
// explicit action, not the default tap.

import type { ReactNode } from "react";
import { ActionLink, OptionMark, PrimaryButton, SecondaryButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatINR } from "@/lib/money";
import { formatPhone, mailtoHref, telHref, whatsappHref } from "@/lib/phone";
import { householdCostPaise, householdHeads, type PlateByEventId } from "@/lib/guests";
import { HOUSEHOLD_STATUS_LABELS, TIER_LABELS, type HouseholdWithId } from "@/types";

export function HouseholdView({
  household,
  plates,
  sideLabel,
  eventNames,
  onEdit,
  onNames,
  onBack,
}: {
  household: HouseholdWithId;
  plates: PlateByEventId;
  sideLabel: string;
  eventNames: { id: string; name: string; colour: string; icon?: string }[];
  onEdit: () => void;
  onNames: () => void;
  onBack: () => void;
}) {
  const heads = householdHeads(household);
  const cost = householdCostPaise(household, plates);
  const tel = telHref(household.primaryPhone);
  const wa = whatsappHref(household.primaryPhone);
  const mail = mailtoHref(household.email ?? "");

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <PageHeader
        onBack={onBack}
        title={household.name}
        subtitle={
          <>
            {HOUSEHOLD_STATUS_LABELS[household.status]} · {TIER_LABELS[household.tier]} ·{" "}
            {sideLabel}
          </>
        }
      />

      <div className="flex gap-3">
        <PrimaryButton onClick={onEdit}>Edit</PrimaryButton>
        <SecondaryButton onClick={onNames}>Names</SecondaryButton>
      </div>

      <dl className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <Row label="Planned">
          {heads} {heads === 1 ? "person" : "people"}
          {cost > 0 ? ` · ${formatINR(cost)} projected` : ""}
        </Row>

        {household.relationship ? <Row label="Relationship">{household.relationship}</Row> : null}

        <Row label="Invited to">
          {eventNames.length > 0 ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {eventNames.map((e) => (
                <span key={e.id} className="flex items-center gap-1">
                  <OptionMark colour={e.colour} icon={e.icon} className="h-2 w-2" />
                  {e.name}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-stone-400">No events yet — not in any count.</span>
          )}
        </Row>

        {household.travelNeeded ? <Row label="Travel">Needed</Row> : null}

        {household.accommodationNeeded ? (
          <Row label="Accommodation">
            Needed{household.roomsNeeded ? ` · ${household.roomsNeeded} rooms` : ""}
            {household.nightsNeeded ? ` · ${household.nightsNeeded} nights` : ""}
          </Row>
        ) : null}

        {household.address ? <Row label="Address">{household.address}</Row> : null}

        {household.notes ? <Row label="Notes">{household.notes}</Row> : null}
      </dl>

      {household.primaryPhone ? (
        <p className="text-sm text-stone-500">{formatPhone(household.primaryPhone)}</p>
      ) : null}
      {household.email ? <p className="text-sm text-stone-500">{household.email}</p> : null}

      {/* Only rendered when the value actually parses — a dead tap that opens
          a dialler on nothing is worse than no link at all. */}
      {tel || wa || mail ? (
        <div className="flex flex-wrap gap-2">
          {tel ? <ActionLink href={tel} label="Call" /> : null}
          {wa ? <ActionLink href={wa} label="WhatsApp" external /> : null}
          {mail ? <ActionLink href={mail} label="Email" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-stone-500">{label}</dt>
      <dd className="text-sm text-stone-700">{children}</dd>
    </div>
  );
}
