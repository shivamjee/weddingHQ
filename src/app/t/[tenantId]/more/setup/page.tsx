"use client";

// More → Setup: this wedding's categories and events (PHASE2 Step 1).
//
// These two collections are the foundation everything else in Phase 2 hangs off
// — budget allocations are keyed by category, and contacts, questions and
// comparisons are all tagged with them — so this screen is built first and kept
// deliberately plain.
//
// SECURITY: couple-only in firestore.rules. `canWrite` below hides the controls
// for a family member; it is UX, not the boundary. A family member who forges a
// write gets rejected by the rules, which is what the emulator tests assert.

import { useMemo, useState } from "react";
import {
  deleteDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { categoryDoc, eventDoc, uniqueSlugId } from "@/lib/paths";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { DEFAULT_CATEGORIES, DEFAULT_EVENTS, FALLBACK_COLOUR, nextColour } from "@/lib/colours";
import { formatINR, paiseToRupeeInput, parseRupeeInput, toPaise, type Paise } from "@/lib/money";
import { ColourPicker } from "@/components/ui/ColourPicker";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@/components/ui/form";
import { dateInputValue, formatDate, toTimestamp } from "@/lib/dates";
import type { CategoryWithId, EventWithId } from "@/types";

export default function SetupPage() {
  const { tenantId, canWrite } = useTenant();

  return (
    <div className="flex flex-1 flex-col gap-8 px-5 py-6">
      <PageHeader
        backHref={tenantHref(tenantId, "/more")}
        title="Setup"
        subtitle={
          canWrite
            ? "Categories and events are the labels the rest of the app uses. Set them up once; edit them any time."
            : "The categories and events this wedding is organised around. Only the couple can change these."
        }
      />
      <CategoriesSection />
      <EventsSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function CategoriesSection() {
  const { tenantId, canWrite } = useTenant();
  const { categories, loading, reload } = useConfig();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usedColours = categories.map((c) => c.colour);

  async function seedDefaults() {
    setError(null);
    try {
      const batch = writeBatch(db);
      DEFAULT_CATEGORIES.forEach((c, i) => {
        batch.set(categoryDoc(tenantId, uniqueSlugId(c.name, [])), {
          name: c.name,
          colour: c.colour,
          order: i,
        });
      });
      await batch.commit();
      reload();
    } catch (err) {
      console.error("[setup] seeding categories failed:", err);
      setError("Could not add the suggested categories.");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-stone-800">Categories</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          What money gets grouped by — Venue, Food, Decor. Each side budgets against these.
        </p>
      </div>

      <FormMessage error={error} />

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : categories.length === 0 ? (
        <EmptyRow
          text="No categories yet."
          action={
            canWrite ? (
              <SecondaryButton onClick={seedDefaults}>Add 8 suggested</SecondaryButton>
            ) : null
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((category, index) => (
            <CategoryRow
              key={category.id}
              category={category}
              index={index}
              total={categories.length}
            />
          ))}
        </ul>
      )}

      {canWrite ? (
        adding ? (
          <CategoryForm
            initialColour={nextColour(usedColours)}
            nextOrder={categories.length}
            onDone={() => {
              setAdding(false);
              reload();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <SecondaryButton onClick={() => setAdding(true)} className="self-start">
            + Add category
          </SecondaryButton>
        )
      ) : null}
    </section>
  );
}

function CategoryRow({
  category,
  index,
  total,
}: {
  category: CategoryWithId;
  index: number;
  total: number;
}) {
  const { tenantId, canWrite } = useTenant();
  const { categories, reload } = useConfig();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <CategoryForm
          existing={category}
          initialColour={category.colour}
          nextOrder={category.order}
          onDone={() => {
            setEditing(false);
            reload();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: category.colour || FALLBACK_COLOUR }}
        aria-hidden
      />
      <p className="min-w-0 flex-1 truncate text-base font-medium text-stone-800">
        {category.name}
      </p>
      {canWrite ? (
        <>
          <ReorderButtons
            index={index}
            total={total}
            onMove={(to) =>
              reorder(categories, index, to, (id) => categoryDoc(tenantId, id), reload)
            }
          />
          <button
            onClick={() => setEditing(true)}
            className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-stone-500 hover:text-stone-800"
          >
            Edit
          </button>
        </>
      ) : null}
    </li>
  );
}

function CategoryForm({
  existing,
  initialColour,
  nextOrder,
  onDone,
  onCancel,
}: {
  existing?: CategoryWithId;
  initialColour: string;
  nextOrder: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { tenantId } = useTenant();
  const { categories } = useConfig();
  const [name, setName] = useState(existing?.name ?? "");
  const [colour, setColour] = useState(existing?.colour || initialColour);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = name.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await updateDoc(categoryDoc(tenantId, existing.id), { name: clean, colour });
      } else {
        // The id is derived from the name so `budgets/a_venue` stays readable in
        // the Firestore console. Uniqueness is checked against the already-loaded
        // list, so it costs no extra read. The id never changes on rename —
        // budget allocations are keyed by it.
        const id = uniqueSlugId(
          clean,
          categories.map((c) => c.id),
        );
        await setDoc(categoryDoc(tenantId, id), { name: clean, colour, order: nextOrder });
      }
      onDone();
    } catch (err) {
      console.error("[setup] category save failed:", err);
      setError("Could not save. Only the couple can edit categories.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (
      !window.confirm(
        `Delete "${existing.name}"? Any budget allocations for it will be removed too.`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteDoc(categoryDoc(tenantId, existing.id));
      onDone();
    } catch (err) {
      console.error("[setup] category delete failed:", err);
      setError("Could not delete that category.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4"
    >
      <Field label="Name">
        <TextInput
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Decor"
        />
      </Field>
      <ColourPicker value={colour} onChange={setColour} />
      <FormMessage error={error} />
      <div className="flex flex-wrap items-center gap-2">
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

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function EventsSection() {
  const { tenantId, canWrite } = useTenant();
  const { events, loading, reload } = useConfig();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usedColours = events.map((e) => e.colour);

  async function seedDefaults() {
    setError(null);
    try {
      const batch = writeBatch(db);
      DEFAULT_EVENTS.forEach((e, i) => {
        batch.set(eventDoc(tenantId, uniqueSlugId(e.name, [])), {
          name: e.name,
          colour: e.colour,
          order: i,
          // Deliberately null / zero: the wedding is more than a year out, and a
          // placeholder date or cost gets mistaken for a decision that was made.
          date: null,
          venueOptionId: null,
          perPlateEstPaise: 0,
        });
      });
      await batch.commit();
      reload();
    } catch (err) {
      console.error("[setup] seeding events failed:", err);
      setError("Could not add the suggested events.");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-stone-800">Events</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          The functions — Mehendi, Sangeet, Wedding. Dates can stay blank until they&rsquo;re
          decided.
        </p>
      </div>

      <FormMessage error={error} />

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : events.length === 0 ? (
        <EmptyRow
          text="No events yet."
          action={
            canWrite ? (
              <SecondaryButton onClick={seedDefaults}>Add 4 suggested</SecondaryButton>
            ) : null
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event, index) => (
            <EventRow key={event.id} event={event} index={index} total={events.length} />
          ))}
        </ul>
      )}

      {canWrite ? (
        adding ? (
          <EventForm
            initialColour={nextColour(usedColours)}
            nextOrder={events.length}
            onDone={() => {
              setAdding(false);
              reload();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <SecondaryButton onClick={() => setAdding(true)} className="self-start">
            + Add event
          </SecondaryButton>
        )
      ) : null}
    </section>
  );
}

function EventRow({ event, index, total }: { event: EventWithId; index: number; total: number }) {
  const { tenantId, canWrite } = useTenant();
  const { events, reload } = useConfig();
  const [editing, setEditing] = useState(false);

  const detail = useMemo(() => {
    const parts: string[] = [];
    if (event.date) parts.push(formatDate(event.date));
    if (event.perPlateEstPaise) parts.push(`${formatINR(toPaise(event.perPlateEstPaise))} a plate`);
    return parts.join(" · ");
  }, [event.date, event.perPlateEstPaise]);

  if (editing) {
    return (
      <li>
        <EventForm
          existing={event}
          initialColour={event.colour}
          nextOrder={event.order}
          onDone={() => {
            setEditing(false);
            reload();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: event.colour || FALLBACK_COLOUR }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-stone-800">{event.name}</p>
        {detail ? <p className="truncate text-xs text-stone-400">{detail}</p> : null}
      </div>
      {canWrite ? (
        <>
          <ReorderButtons
            index={index}
            total={total}
            onMove={(to) => reorder(events, index, to, (id) => eventDoc(tenantId, id), reload)}
          />
          <button
            onClick={() => setEditing(true)}
            className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-stone-500 hover:text-stone-800"
          >
            Edit
          </button>
        </>
      ) : null}
    </li>
  );
}

function EventForm({
  existing,
  initialColour,
  nextOrder,
  onDone,
  onCancel,
}: {
  existing?: EventWithId;
  initialColour: string;
  nextOrder: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { tenantId } = useTenant();
  const { events } = useConfig();
  const [name, setName] = useState(existing?.name ?? "");
  const [colour, setColour] = useState(existing?.colour || initialColour);
  const [date, setDate] = useState(dateInputValue(existing?.date ?? null));
  const [perPlate, setPerPlate] = useState(
    existing?.perPlateEstPaise ? paiseToRupeeInput(toPaise(existing.perPlateEstPaise)) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = name.trim();
  // Empty means "not set yet" and stores zero; anything unparseable blocks the
  // save rather than being silently coerced (src/lib/money.ts).
  const perPlatePaise: Paise | null =
    perPlate.trim() === "" ? toPaise(0) : parseRupeeInput(perPlate);
  const perPlateInvalid = perPlatePaise === null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean || busy || perPlatePaise === null) return;
    setBusy(true);
    setError(null);
    try {
      const fields = {
        name: clean,
        colour,
        date: toTimestamp(date),
        perPlateEstPaise: perPlatePaise,
      };
      if (existing) {
        await updateDoc(eventDoc(tenantId, existing.id), fields);
      } else {
        const id = uniqueSlugId(
          clean,
          events.map((ev) => ev.id),
        );
        await setDoc(eventDoc(tenantId, id), {
          ...fields,
          order: nextOrder,
          venueOptionId: null,
        });
      }
      onDone();
    } catch (err) {
      console.error("[setup] event save failed:", err);
      setError("Could not save. Only the couple can edit events.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!window.confirm(`Delete "${existing.name}"?`)) return;
    setBusy(true);
    try {
      await deleteDoc(eventDoc(tenantId, existing.id));
      onDone();
    } catch (err) {
      console.error("[setup] event delete failed:", err);
      setError("Could not delete that event.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4"
    >
      <Field label="Name">
        <TextInput
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Sangeet"
        />
      </Field>
      <Field label="Date (optional)" hint="Leave blank until it's actually decided.">
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field
        label="Estimated cost per plate (optional)"
        hint="Used later to project catering cost from the guest list."
      >
        <TextInput
          inputMode="decimal"
          value={perPlate}
          onChange={(e) => setPerPlate(e.target.value)}
          placeholder="1800"
        />
      </Field>
      <ColourPicker value={colour} onChange={setColour} />
      <FormMessage
        error={
          error ?? (perPlate.trim() && perPlateInvalid ? "Enter a plain number, like 1800." : null)
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton type="submit" disabled={!clean || busy || perPlateInvalid}>
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

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function EmptyRow({ text, action }: { text: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-stone-300 px-4 py-5">
      <p className="text-sm text-stone-500">{text}</p>
      {action}
    </div>
  );
}

/** Up/down arrows rather than drag-and-drop. Dragging a list row on a touch
 *  screen fights the page scroll and is genuinely hard for older users; two
 *  buttons always work and are reachable by keyboard and screen reader. */
function ReorderButtons({
  index,
  total,
  onMove,
}: {
  index: number;
  total: number;
  onMove: (toIndex: number) => void;
}) {
  return (
    <div className="flex shrink-0">
      <button
        onClick={() => onMove(index - 1)}
        disabled={index === 0}
        aria-label="Move up"
        className="flex h-11 w-8 items-center justify-center text-stone-400 disabled:opacity-25"
      >
        <Arrow up />
      </button>
      <button
        onClick={() => onMove(index + 1)}
        disabled={index === total - 1}
        aria-label="Move down"
        className="flex h-11 w-8 items-center justify-center text-stone-400 disabled:opacity-25"
      >
        <Arrow />
      </button>
    </div>
  );
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 ${up ? "" : "rotate-180"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

/**
 * Move one row and renumber the whole list 0..n-1 in a single batch.
 *
 * Renumbering everything rather than swapping two documents is deliberate: it
 * also repairs duplicate or missing `order` values (a hand-typed document in
 * the Firestore console has neither), so the list can't get into a state where
 * two rows fight over the same position. n is bounded at 50 by the loader, well
 * inside Firestore's 500-write batch limit.
 */
async function reorder<T extends { id: string }>(
  rows: T[],
  from: number,
  to: number,
  ref: (id: string) => DocumentReference,
  onDone: () => void,
) {
  if (to < 0 || to >= rows.length || from === to) return;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  try {
    const batch = writeBatch(db);
    next.forEach((row, i) => batch.update(ref(row.id), { order: i }));
    await batch.commit();
    onDone();
  } catch (err) {
    console.error("[setup] reorder failed:", err);
  }
}
