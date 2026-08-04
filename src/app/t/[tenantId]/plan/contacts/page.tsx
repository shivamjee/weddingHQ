"use client";

// Plan → Contacts (PHASE2 Step 3, FEATURES.md §5).
//
// The point of this screen on a phone is the three tap-to-act links: dial,
// WhatsApp, email. Everything else is in service of finding the right row fast.
//
// SECURITY: member-read AND member-write (firestore.rules `contacts`). Unlike
// categories and budgets, anyone in the wedding can add a vendor they found.
//
// READ COST: one bounded page of 50, ordered by name, with an explicit "Load
// more" cursor. Search and the type/category filters run over the LOADED page
// client-side — no query per keystroke, per PHASE2's read-cost rules. At this
// app's scale (a few dozen vendors) the first page is the whole list.

import { useCallback, useMemo, useState } from "react";
import {
  addDoc,
  deleteDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { contactDoc, contactsCol } from "@/lib/paths";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTenant } from "@/lib/tenants/TenantProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import { formatPhone, mailtoHref, telHref, whatsappHref } from "@/lib/phone";
import {
  ActionLink,
  ChipMultiRow,
  ChipRow,
  Field,
  FilterPanel,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import { CONTACT_TYPES, CONTACT_TYPE_LABELS, type ContactType, type ContactWithId } from "@/types";

const PAGE_SIZE = 50;

export default function ContactsPage() {
  // No `canWrite` check anywhere on this screen: contacts are member-writable
  // by design (see firestore.rules), so every member gets the Add button.
  const { tenantId } = useTenant();
  const { categories, categoryById, events } = useConfig();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContactType | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ContactWithId | null>(null);

  // Pagination cursor. Held outside the loader so "Load more" appends rather
  // than replacing — the loader itself always fetches the FIRST page.
  const [extraPages, setExtraPages] = useState<ContactWithId[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [moreAvailable, setMoreAvailable] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    // orderBy("name") is a single-field index, which Firestore maintains
    // automatically — no composite index to deploy.
    const snap = await getDocs(query(contactsCol(tenantId), orderBy("name"), limit(PAGE_SIZE)));
    setExtraPages([]);
    setCursor(snap.docs.at(-1) ?? null);
    setMoreAvailable(snap.docs.length === PAGE_SIZE);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ContactWithId);
  }, [tenantId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load contacts.");

  const contacts = useMemo(() => [...(data ?? []), ...extraPages], [data, extraPages]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(contactsCol(tenantId), orderBy("name"), startAfter(cursor), limit(PAGE_SIZE)),
      );
      setExtraPages((prev) => [
        ...prev,
        ...snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ContactWithId),
      ]);
      setCursor(snap.docs.at(-1) ?? null);
      setMoreAvailable(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("[contacts] load more failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (categoryFilter && c.categoryId !== categoryFilter) return false;
      // `eventIds` is a LIST on a contact (one caterer can cover the Sangeet and
      // the Reception), unlike a question's single `eventId`.
      if (eventFilter && !(c.eventIds ?? []).includes(eventFilter)) return false;
      if (!needle) return true;
      // Name, organisation and role — the three things you'd actually remember
      // about a vendor (FEATURES.md §5).
      return [c.name, c.organisation, c.role].some((f) => (f ?? "").toLowerCase().includes(needle));
    });
  }, [contacts, search, typeFilter, categoryFilter, eventFilter]);

  if (editing || adding) {
    return (
      <div className="flex flex-1 flex-col px-5 py-6">
        <ContactForm
          existing={editing ?? undefined}
          onDone={() => {
            setEditing(null);
            setAdding(false);
            reload();
          }}
          onCancel={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Contacts</h1>
          <p className="mt-1 text-sm text-stone-500">Tap to call, message or email.</p>
        </div>
        <SecondaryButton onClick={() => setAdding(true)}>+ Add</SecondaryButton>
      </div>

      <FormMessage error={error} />

      {contacts.length > 0 ? (
        <div className="flex flex-col gap-3">
          {/* Search stays OUTSIDE the drawer — it's the primary way to find a
              contact, and burying it behind a tap would be the opposite of the
              fix. Only the chip rows fold away. */}
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, business or role"
          />
          <FilterPanel
            activeCount={[typeFilter, categoryFilter, eventFilter].filter(Boolean).length}
            onClear={() => {
              setTypeFilter(null);
              setCategoryFilter(null);
              setEventFilter(null);
            }}
          >
            <ChipRow<ContactType>
              label="Type"
              options={CONTACT_TYPES.map((t) => ({ value: t, label: CONTACT_TYPE_LABELS[t] }))}
              value={typeFilter}
              onChange={setTypeFilter}
              allowClear
            />
            {categories.length > 0 ? (
              <ChipRow
                label="Category"
                options={categories.map((c) => ({
                  value: c.id,
                  label: c.name,
                  colour: c.colour,
                  icon: c.icon,
                }))}
                value={categoryFilter}
                onChange={setCategoryFilter}
                allowClear
              />
            ) : null}
            {events.length > 0 ? (
              <ChipRow
                label="Event"
                options={events.map((e) => ({
                  value: e.id,
                  label: e.name,
                  colour: e.colour,
                  icon: e.icon,
                }))}
                value={eventFilter}
                onChange={setEventFilter}
                allowClear
              />
            ) : null}
          </FilterPanel>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-stone-300 px-4 py-6">
          <p className="text-sm text-stone-500">
            No contacts yet. Add the venues, caterers and photographers you&rsquo;re talking to —
            anyone in the wedding can.
          </p>
          <PrimaryButton onClick={() => setAdding(true)}>Add the first contact</PrimaryButton>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
          Nothing matches those filters.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              categoryName={categoryById(contact.categoryId)?.name ?? null}
              categoryColour={categoryById(contact.categoryId)?.colour ?? null}
              onEdit={() => setEditing(contact)}
            />
          ))}
        </ul>
      )}

      {moreAvailable ? (
        <SecondaryButton onClick={loadMore} disabled={loadingMore} className="self-center">
          {loadingMore ? "Loading…" : "Load more"}
        </SecondaryButton>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ContactCard({
  contact,
  categoryName,
  categoryColour,
  onEdit,
}: {
  contact: ContactWithId;
  categoryName: string | null;
  categoryColour: string | null;
  onEdit: () => void;
}) {
  const tel = telHref(contact.phone);
  const wa = whatsappHref(contact.phone);
  const mail = mailtoHref(contact.email);
  const subtitle = [contact.role, contact.organisation].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-stone-800">{contact.name}</p>
          {subtitle ? <p className="truncate text-sm text-stone-500">{subtitle}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-400">
            <span>{CONTACT_TYPE_LABELS[contact.type] ?? "Other"}</span>
            {categoryName ? (
              <span className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: categoryColour ?? undefined }}
                  aria-hidden
                />
                {categoryName}
              </span>
            ) : null}
          </div>
        </div>
        <button
          onClick={onEdit}
          className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-stone-400 hover:text-stone-800"
        >
          Edit
        </button>
      </div>

      {contact.phone ? (
        <p className="-mt-1 text-sm text-stone-500">{formatPhone(contact.phone)}</p>
      ) : null}

      {/* The whole reason this screen exists on a phone. Links are only rendered
          when the underlying value actually parses, so nothing here is a dead
          tap that opens a dialler on an empty number. */}
      {tel || wa || mail ? (
        <div className="flex flex-wrap gap-2">
          {tel ? <ActionLink href={tel} label="Call" /> : null}
          {wa ? <ActionLink href={wa} label="WhatsApp" external /> : null}
          {mail ? <ActionLink href={mail} label="Email" /> : null}
        </div>
      ) : null}

      {contact.notes ? (
        <p className="text-sm whitespace-pre-wrap text-stone-500">{contact.notes}</p>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------

function ContactForm({
  existing,
  onDone,
  onCancel,
}: {
  existing?: ContactWithId;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { categories, events } = useConfig();

  const [name, setName] = useState(existing?.name ?? "");
  const [organisation, setOrganisation] = useState(existing?.organisation ?? "");
  const [role, setRole] = useState(existing?.role ?? "");
  const [type, setType] = useState<ContactType>(existing?.type ?? "vendor");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [altPhone, setAltPhone] = useState(existing?.altPhone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [eventIds, setEventIds] = useState<string[]>(existing?.eventIds ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = name.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean || busy || !user) return;
    setBusy(true);
    setError(null);

    const fields = {
      name: clean,
      organisation: organisation.trim(),
      role: role.trim(),
      type,
      phone: phone.trim(),
      altPhone: altPhone.trim(),
      email: email.trim(),
      address: address.trim(),
      categoryId,
      eventIds,
      notes: notes.trim(),
      updatedAt: serverTimestamp(),
    };

    try {
      if (existing) {
        await updateDoc(contactDoc(tenantId, existing.id), fields);
      } else {
        await addDoc(contactsCol(tenantId), {
          ...fields,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      onDone();
    } catch (err) {
      console.error("[contacts] save failed:", err);
      setError("Could not save that contact.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!window.confirm(`Delete ${existing.name}?`)) return;
    setBusy(true);
    try {
      await deleteDoc(contactDoc(tenantId, existing.id));
      onDone();
    } catch (err) {
      console.error("[contacts] delete failed:", err);
      setError("Could not delete that contact.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-stone-800">
        {existing ? "Edit contact" : "New contact"}
      </h1>

      <Field label="Name">
        <TextInput
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Rakesh Sharma"
        />
      </Field>
      <Field label="Business (optional)">
        <TextInput
          value={organisation}
          onChange={(e) => setOrganisation(e.target.value)}
          placeholder="Taj Palace"
        />
      </Field>
      <Field label="Role (optional)">
        <TextInput
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Venue manager"
        />
      </Field>

      <ChipRow<ContactType>
        label="Type"
        options={CONTACT_TYPES.map((t) => ({ value: t, label: CONTACT_TYPE_LABELS[t] }))}
        value={type}
        onChange={(v) => v && setType(v)}
      />

      <Field label="Phone" hint="Any format — 98765 43210, +91 98765 43210, all work.">
        <TextInput
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
        />
      </Field>
      <Field label="Other phone (optional)">
        <TextInput
          type="tel"
          inputMode="tel"
          value={altPhone}
          onChange={(e) => setAltPhone(e.target.value)}
        />
      </Field>
      <Field label="Email (optional)">
        <TextInput
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Address (optional)">
        <TextArea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
      </Field>

      <ChipRow
        label="Category"
        options={categories.map((c) => ({ value: c.id, label: c.name, colour: c.colour }))}
        value={categoryId}
        onChange={setCategoryId}
        allowClear
        emptyLabel="No categories yet — add them in More → Setup."
      />
      <ChipMultiRow
        label="Events"
        options={events.map((e) => ({ value: e.id, label: e.name, colour: e.colour }))}
        values={eventIds}
        onChange={setEventIds}
        emptyLabel="No events yet — add them in More → Setup."
      />

      <Field label="Notes (optional)">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <FormMessage error={error} />

      <div className="flex flex-wrap items-center gap-2 pb-4">
        <PrimaryButton type="submit" disabled={!clean || busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
        {existing ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="ml-auto min-h-[44px] px-2 text-sm font-medium text-stone-400 hover:text-rose-600"
          >
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}
