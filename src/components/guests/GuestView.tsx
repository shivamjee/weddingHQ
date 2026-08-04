"use client";

// A named guest's profile — read-only, reached by tapping their row on the
// Names screen. Falls back to the household's phone/email when the guest has
// none of their own (most won't — the household is the invitation unit).

import { ActionLink, PrimaryButton, SecondaryButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatPhone, mailtoHref, telHref, whatsappHref } from "@/lib/phone";
import { AGE_GROUP_LABELS, type GuestWithId, type HouseholdWithId } from "@/types";

export function GuestView({
  guest,
  household,
  onEdit,
  onRemove,
  onBack,
}: {
  guest: GuestWithId;
  household: HouseholdWithId;
  onEdit: () => void;
  onRemove: () => void;
  onBack: () => void;
}) {
  const phone = guest.phone || household.primaryPhone;
  const email = guest.email || household.email || "";
  const tel = telHref(phone);
  const wa = whatsappHref(phone);
  const mail = mailtoHref(email);

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <PageHeader onBack={onBack} title={guest.name} subtitle={AGE_GROUP_LABELS[guest.ageGroup]} />

      <div className="flex gap-3">
        <PrimaryButton onClick={onEdit}>Edit</PrimaryButton>
        <SecondaryButton onClick={onRemove}>Remove</SecondaryButton>
      </div>

      {guest.dietary || guest.notes ? (
        <dl className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
          {guest.dietary ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-stone-500">Dietary</dt>
              <dd className="text-sm text-stone-700">{guest.dietary}</dd>
            </div>
          ) : null}
          {guest.notes ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-stone-500">Notes</dt>
              <dd className="text-sm text-stone-700">{guest.notes}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {phone ? <p className="text-sm text-stone-500">{formatPhone(phone)}</p> : null}
      {email ? <p className="text-sm text-stone-500">{email}</p> : null}
      {!guest.phone && household.primaryPhone ? (
        <p className="text-xs text-stone-400">Via {household.name}&rsquo;s number.</p>
      ) : null}

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
