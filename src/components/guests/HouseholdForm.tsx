"use client";

// The entry form (PHASE3 Step 1) — the screen this whole phase lives or dies on.
//
// FIVE FIELDS VISIBLE: name, side, tier, adults, children. Everything else is
// folded into "More details". FEATURES.md §4.1 is blunt about why: a form
// demanding twelve fields per household will not get filled in — parents will
// add three names and stop.
//
// Two things earn their place beside the counts:
//   • the live marginal cost ("+₹30,000"), which §4.4 says changes behaviour
//     more than any report does. It costs no extra read — the plate prices are
//     already loaded by useConfig().
//   • the duplicate warning, fired AT ENTRY rather than as a cleanup screen
//     later (§4.3). With four people adding names independently, mutual family
//     friends will be entered twice.
//
// The form does not write anything itself: it hands a draft back to the Guests
// screen, which owns the write AND the aggregate recompute, so there is exactly
// one writer path for both. See src/types/guestTotals.ts.

import { useMemo, useState } from "react";
import {
  ChipMultiRow,
  ChipRow,
  Expander,
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { useTenant } from "@/lib/tenants/TenantProvider";
import { duplicateMatches, householdCostPaise, type PlateByEventId } from "@/lib/guests";
import { formatINR, toPaise } from "@/lib/money";
import {
  HOUSEHOLD_STATUSES,
  HOUSEHOLD_STATUS_LABELS,
  SIDES,
  TIERS,
  TIER_LABELS,
  type Household,
  type HouseholdStatus,
  type HouseholdWithId,
  type Side,
  type Tier,
} from "@/types";

/** Everything the form collects. `createdBy`/`createdAt`/`updatedAt` are the
 *  caller's business. */
export type HouseholdDraft = Omit<Household, "createdBy" | "createdAt" | "updatedAt">;

/** A count as typed. Blank means zero rather than NaN, and a stray minus or
 *  decimal point is dropped instead of being written to Firestore. */
function parseCount(text: string): number {
  const value = Number.parseInt(text.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function HouseholdForm({
  existing,
  households,
  members,
  plates,
  onSave,
  onCancel,
  onDelete,
}: {
  existing?: HouseholdWithId;
  /** The full list, for the duplicate check. Already in memory on the Guests
   *  screen, so this costs nothing. */
  households: readonly HouseholdWithId[];
  members: readonly { uid: string; label: string }[];
  plates: PlateByEventId;
  onSave: (draft: HouseholdDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const { sideLabel, side: mySide } = useTenant();
  const { events } = useConfig();

  const [name, setName] = useState(existing?.name ?? "");
  const [side, setSide] = useState<Side>(existing?.side ?? mySide ?? "a");
  const [tier, setTier] = useState<Tier>(existing?.tier ?? "should");
  const [adults, setAdults] = useState(String(existing?.adultCount ?? ""));
  const [children, setChildren] = useState(String(existing?.childCount ?? ""));

  const [eventIds, setEventIds] = useState<string[]>(existing?.eventIds ?? []);
  const [invitedBy, setInvitedBy] = useState<string | null>(existing?.invitedBy ?? null);
  // New households start as `proposed`: anyone may add, and it counts towards
  // every projection while being visibly not agreed (§4.3).
  const [status, setStatus] = useState<HouseholdStatus>(existing?.status ?? "proposed");
  const [relationship, setRelationship] = useState(existing?.relationship ?? "");
  const [travelNeeded, setTravelNeeded] = useState(existing?.travelNeeded ?? false);
  const [accommodationNeeded, setAccommodationNeeded] = useState(
    existing?.accommodationNeeded ?? false,
  );
  const [rooms, setRooms] = useState(existing?.roomsNeeded == null ? "" : String(existing.roomsNeeded));
  const [nights, setNights] = useState(
    existing?.nightsNeeded == null ? "" : String(existing.nightsNeeded),
  );
  const [address, setAddress] = useState(existing?.address ?? "");
  const [phone, setPhone] = useState(existing?.primaryPhone ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanName = name.trim();
  const adultCount = parseCount(adults);
  const childCount = parseCount(children);

  // Live projection for what is on screen right now, and the delta against what
  // this household cost before the edit. Pure arithmetic over data already
  // loaded — no read, no write, no debounce needed.
  const cost = householdCostPaise({ adultCount, childCount, eventIds }, plates);
  const previousCost = existing ? householdCostPaise(existing, plates) : 0;
  const delta = cost - previousCost;

  const duplicates = useMemo(
    () =>
      cleanName || phone.trim()
        ? duplicateMatches({ id: existing?.id, name: cleanName, primaryPhone: phone }, households)
        : [],
    [cleanName, phone, existing?.id, households],
  );

  async function submit() {
    if (!cleanName) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: cleanName,
        side,
        tier,
        status,
        // Whoever's guest they are. Unset means "nobody said", which is honest —
        // guessing the current user would put a parent's list under whoever
        // happened to type it in.
        invitedBy: invitedBy ?? "",
        relationship: relationship.trim(),
        eventIds,
        adultCount,
        childCount,
        travelNeeded,
        accommodationNeeded,
        roomsNeeded: accommodationNeeded && rooms.trim() ? parseCount(rooms) : null,
        nightsNeeded: accommodationNeeded && nights.trim() ? parseCount(nights) : null,
        address: address.trim(),
        primaryPhone: phone.trim(),
        notes: notes.trim(),
      });
    } catch (err) {
      console.error("[guests] household save failed:", err);
      setError("Could not save that household.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete || !existing) return;
    if (!window.confirm(`Remove ${existing.name}? This is recorded in the change log.`)) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      console.error("[guests] household delete failed:", err);
      setError("Could not remove that household.");
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h1 className="text-xl font-semibold text-stone-800">
        {existing ? "Edit household" : "Add a household"}
      </h1>

      <Field label="Name" hint="One invitation, however many people. “The Agarwals”.">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Agarwals"
          autoFocus
        />
      </Field>

      {duplicates.length > 0 ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Possible duplicate:{" "}
          {duplicates
            .slice(0, 3)
            .map((d) => `${d.household.name}${d.reason === "phone" ? " (same phone)" : ""}`)
            .join(", ")}
          . Add anyway if they really are different.
        </p>
      ) : null}

      <ChipRow<Side>
        label="Side"
        options={SIDES.map((s) => ({ value: s, label: sideLabel(s) }))}
        value={side}
        onChange={(v) => v && setSide(v)}
      />

      <ChipRow<Tier>
        label="Tier"
        options={TIERS.map((t) => ({ value: t, label: TIER_LABELS[t] }))}
        value={tier}
        onChange={(v) => v && setTier(v)}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Adults">
          <TextInput
            value={adults}
            onChange={(e) => setAdults(e.target.value)}
            inputMode="numeric"
            placeholder="2"
          />
        </Field>
        <Field label="Children">
          <TextInput
            value={children}
            onChange={(e) => setChildren(e.target.value)}
            inputMode="numeric"
            placeholder="0"
          />
        </Field>
      </div>

      <p className="text-sm text-stone-500">
        {adultCount + childCount} planned {adultCount + childCount === 1 ? "person" : "people"}
        {eventIds.length === 0 ? (
          <span className="text-stone-400"> · pick events below to project a cost</span>
        ) : (
          <>
            {" · "}
            <span className="font-semibold text-stone-700">{formatINR(cost)}</span>
            {delta !== 0 ? (
              <span className={delta > 0 ? "text-rose-600" : "text-emerald-700"}>
                {" "}
                ({delta > 0 ? "+" : "−"}
                {formatINR(toPaise(Math.abs(delta)))})
              </span>
            ) : null}
          </>
        )}
      </p>

      <Expander summary="More details" defaultOpen={Boolean(existing)}>
        <ChipMultiRow
          label="Invited to"
          options={events.map((e) => ({
            value: e.id,
            label: e.name,
            colour: e.colour,
            icon: e.icon,
          }))}
          values={eventIds}
          onChange={setEventIds}
          emptyLabel="No events yet — add them under More → Setup."
        />

        <ChipRow
          label="Whose guests"
          options={members.map((m) => ({ value: m.uid, label: m.label }))}
          value={invitedBy}
          onChange={setInvitedBy}
          allowClear
          emptyLabel="Nobody else is in this wedding yet."
        />

        <ChipRow<HouseholdStatus>
          label="Status"
          options={HOUSEHOLD_STATUSES.map((s) => ({ value: s, label: HOUSEHOLD_STATUS_LABELS[s] }))}
          value={status}
          onChange={(v) => v && setStatus(v)}
        />

        <Field label="Relationship" hint="“Paternal cousins”, “Dad's colleagues”.">
          <TextInput value={relationship} onChange={(e) => setRelationship(e.target.value)} />
        </Field>

        <Checkbox label="Needs travel" checked={travelNeeded} onChange={setTravelNeeded} />
        <Checkbox
          label="Needs accommodation"
          checked={accommodationNeeded}
          onChange={setAccommodationNeeded}
        />

        {accommodationNeeded ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rooms">
              <TextInput value={rooms} onChange={(e) => setRooms(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Nights">
              <TextInput
                value={nights}
                onChange={(e) => setNights(e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
        ) : null}

        <Field label="Phone">
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            placeholder="98765 43210"
          />
        </Field>

        <Field label="Address" hint="Only needed when invitations are printed.">
          <TextArea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
        </Field>

        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Expander>

      <FormMessage error={error} />

      <div className="flex items-center gap-3">
        <PrimaryButton type="submit" disabled={!cleanName || busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
        {existing && onDelete ? (
          <button
            type="button"
            onClick={() => void remove()}
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

/** A real checkbox, at a 44px tap target. Chips are for choosing between
 *  options; a single yes/no reads better as what it is. */
function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-stone-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-rose-500"
      />
      {label}
    </label>
  );
}
