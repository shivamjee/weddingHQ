"use client";

// Named guests inside one household (PHASE3 Step 4) — deliberately built AFTER
// the numbers worked.
//
// THE RULE: "12 planned · 3 named" is shown, and the planned count is never
// silently rewritten from the names (FEATURES.md §4.1). Reconciling is a button
// somebody presses, not something that happens while they type. A household with
// twelve heads and zero names is complete and correct; that is what parents
// actually enter, and demanding twelve blank rows is how the feature goes unused.
//
// Naming somebody changes no count, so nothing here touches
// aggregates/guestTotals — which is exactly why that document has one writer and
// cannot drift.

import { useCallback, useState } from "react";
import {
  addDoc,
  deleteDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ActionLink,
  ChipRow,
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@/components/ui/form";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLoader } from "@/lib/hooks/useLoader";
import { guestDoc, guestsCol } from "@/lib/paths";
import { householdHeads } from "@/lib/guests";
import { mailtoHref, telHref, whatsappHref } from "@/lib/phone";
import { AGE_GROUPS, AGE_GROUP_LABELS, type AgeGroup, type GuestWithId, type HouseholdWithId } from "@/types";

/** READ COST: bounded per CLAUDE.md §3. A household of more than 50 named people
 *  is a coach party, not an invitation; the screen under-reports rather than
 *  running up a bill. */
const MAX_NAMES = 50;

export function GuestNames({
  tenantId,
  uid,
  household,
  onBack,
  onReconcile,
}: {
  tenantId: string;
  uid: string;
  household: HouseholdWithId;
  onBack: () => void;
  /** Writes the household's counts. Only ever called from the explicit
   *  "use these numbers" button below. */
  onReconcile: (counts: { adultCount: number; childCount: number }) => Promise<void>;
}) {
  const householdId = household.id;

  const load = useCallback(async () => {
    // No orderBy: `where` + `orderBy` on different fields needs a composite
    // index, and sorting fifty names in memory is free. Same trade the rest of
    // the app makes.
    const snap = await getDocs(
      query(guestsCol(tenantId), where("householdId", "==", householdId), limit(MAX_NAMES)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as GuestWithId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tenantId, householdId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load the names.");
  const guests = data ?? [];

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GuestWithId | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const planned = householdHeads(household);
  // Infants are counted with children: a caterer bills by cover far more often
  // than they bill by age, and the counts stay hand-editable either way.
  const namedAdults = guests.filter((g) => g.ageGroup === "adult").length;
  const namedChildren = guests.length - namedAdults;
  const drifted = guests.length > 0 && guests.length !== planned;

  // Named guests have no phone/email of their own — the household IS the
  // invitation unit and its contact info is what every name in it shares. Same
  // reasoning as HouseholdCard.
  const tel = telHref(household.primaryPhone);
  const wa = whatsappHref(household.primaryPhone);
  const mail = mailtoHref(household.email ?? "");

  async function reconcile() {
    setBusy(true);
    setSaveError(null);
    try {
      await onReconcile({ adultCount: namedAdults, childCount: namedChildren });
    } catch (err) {
      console.error("[guests] reconcile failed:", err);
      setSaveError("Could not update the head count.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(guest: GuestWithId) {
    if (!window.confirm(`Remove ${guest.name}?`)) return;
    try {
      await deleteDoc(guestDoc(tenantId, guest.id));
      reload();
    } catch (err) {
      console.error("[guests] name delete failed:", err);
      setSaveError("Could not remove that name.");
    }
  }

  if (adding || editing) {
    return (
      <div className="flex flex-1 flex-col px-5 py-6">
        <GuestForm
          tenantId={tenantId}
          uid={uid}
          householdId={householdId}
          existing={editing ?? undefined}
          onDone={() => {
            setAdding(false);
            setEditing(null);
            reload();
          }}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <PageHeader
        title={household.name}
        subtitle={
          <>
            <strong>{planned}</strong> planned · <strong>{guests.length}</strong> named
          </>
        }
        action={<SecondaryButton onClick={() => setAdding(true)}>+ Name</SecondaryButton>}
      />
      <PrimaryButton type="button" onClick={onBack} className="self-start">
        Done
      </PrimaryButton>

      {/* Offered, never automatic. The planned count is the authoritative
          number until a person decides otherwise. */}
      {drifted ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            {guests.length} named, but the household is planned for {planned}.
          </p>
          <button
            type="button"
            onClick={() => void reconcile()}
            disabled={busy}
            className="mt-2 min-h-[44px] font-medium text-amber-900 underline"
          >
            {busy
              ? "Updating…"
              : `Set the count to ${namedAdults} adults and ${namedChildren} children`}
          </button>
        </div>
      ) : null}

      <FormMessage error={saveError ?? error} />

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : guests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center">
          <p className="text-sm text-stone-500">
            No names yet — and that is fine. {planned} planned{" "}
            {planned === 1 ? "person" : "people"} already counts everywhere.
          </p>
          <PrimaryButton className="mt-3" onClick={() => setAdding(true)}>
            Add a name
          </PrimaryButton>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {guests.map((guest) => (
            <li
              key={guest.id}
              className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-stone-800">{guest.name}</p>
                  <p className="text-sm text-stone-500">
                    {AGE_GROUP_LABELS[guest.ageGroup]}
                    {guest.dietary ? ` · ${guest.dietary}` : ""}
                  </p>
                  {guest.notes ? (
                    <p className="mt-0.5 text-xs text-stone-400">{guest.notes}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(guest)}
                  className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-stone-400 hover:text-stone-800"
                >
                  Edit
                </button>
              </div>

              {/* Via the household's own phone/email — a name has none of its
                  own. Only rendered when it actually parses, same as
                  HouseholdCard. */}
              {tel || wa || mail ? (
                <div className="flex flex-wrap gap-2">
                  {tel ? <ActionLink href={tel} label="Call" /> : null}
                  {wa ? <ActionLink href={wa} label="WhatsApp" external /> : null}
                  {mail ? <ActionLink href={mail} label="Email" /> : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void remove(guest)}
                className="self-start min-h-[44px] px-2 text-sm font-medium text-stone-400 hover:text-rose-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GuestForm({
  tenantId,
  uid,
  householdId,
  existing,
  onDone,
  onCancel,
}: {
  tenantId: string;
  uid: string;
  householdId: string;
  existing?: GuestWithId;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(existing?.ageGroup ?? "adult");
  const [dietary, setDietary] = useState(existing?.dietary ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = name.trim();

  async function save() {
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const fields = {
        householdId,
        name: clean,
        ageGroup,
        dietary: dietary.trim(),
        notes: notes.trim(),
        updatedAt: serverTimestamp(),
      };
      if (existing) {
        await updateDoc(guestDoc(tenantId, existing.id), fields);
      } else {
        await addDoc(guestsCol(tenantId), {
          ...fields,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
      }
      onDone();
    } catch (err) {
      console.error("[guests] name save failed:", err);
      setError("Could not save that name.");
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h1 className="text-xl font-semibold text-stone-800">{existing ? "Edit name" : "Add a name"}</h1>

      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>

      <ChipRow<AgeGroup>
        label="Age"
        options={AGE_GROUPS.map((a) => ({ value: a, label: AGE_GROUP_LABELS[a] }))}
        value={ageGroup}
        onChange={(v) => v && setAgeGroup(v)}
      />

      <Field label="Dietary" hint="Only needed when the caterer asks.">
        <TextInput
          value={dietary}
          onChange={(e) => setDietary(e.target.value)}
          placeholder="Vegetarian, no nuts…"
        />
      </Field>

      <Field label="Notes">
        <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <FormMessage error={error} />

      <div className="flex gap-3">
        <PrimaryButton type="submit" disabled={!clean || busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
    </form>
  );
}
