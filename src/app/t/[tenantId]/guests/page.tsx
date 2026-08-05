"use client";

// The Guests tab (PHASE3) — the list, the tier ladder, the projection, the
// filters and the room block.
//
// READ COST: ONE bounded read of the whole household collection per visit, plus
// the member list and the target setting. It deliberately does NOT paginate.
// FEATURES.md §4.4 requires every count on screen to respect the active filters,
// and a headcount computed over page 1 of 6 is simply wrong — worse than no
// filter at all. So the whole list comes down once and the *rendering* pages
// instead. At the real scale (100-300 households) that is the same order as the
// Budget screen's 300-document read, and nowhere near Spark's daily allowance.
// Home avoids it entirely by reading the one-document aggregate.
//
// The aggregate is written here and only here: after any household write, this
// screen recomputes aggregates/guestTotals from the list it already holds and
// overwrites it. One writer path, no transaction, and drift heals on the next
// write. See src/types/guestTotals.ts.

import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Papa from "papaparse";
import {
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ChipRow,
  Expander,
  FilterPanel,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/form";
import { GuestBars, type GuestBarRow } from "@/components/guests/GuestBars";
import { GuestNames } from "@/components/guests/GuestNames";
import { GuestView } from "@/components/guests/GuestView";
import { HouseholdCard } from "@/components/guests/HouseholdCard";
import { HouseholdView } from "@/components/guests/HouseholdView";
import { NamedGuestsBrowser } from "@/components/guests/NamedGuestsBrowser";
import { HouseholdForm, type HouseholdDraft } from "@/components/guests/HouseholdForm";
import { TierLadder } from "@/components/guests/TierLadder";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import {
  guestLogCol,
  guestTargetDoc,
  guestTotalsDoc,
  householdDoc,
  householdsCol,
  membershipsCol,
} from "@/lib/paths";
import {
  activeFilterCount,
  breakdownBy,
  filterHouseholds,
  guestTotalsFrom,
  platesByEvent,
  relationshipOptions,
  summarise,
  tierLadder,
  NO_FILTERS,
  type BreakdownKey,
  type GuestFilters,
} from "@/lib/guests";
import { householdsToCsvRows } from "@/lib/guestCsv";
import { formatINR } from "@/lib/money";
import { FALLBACK_COLOUR } from "@/lib/colours";
import {
  HOUSEHOLD_STATUSES,
  HOUSEHOLD_STATUS_LABELS,
  SIDES,
  TIERS,
  TIER_LABELS,
  type GuestLogAction,
  type GuestWithId,
  type HouseholdStatus,
  type HouseholdWithId,
  type MembershipWithId,
  type Side,
  type Tier,
} from "@/types";

/** READ COST: bounded per CLAUDE.md §3. Beyond this the screen under-reports
 *  rather than running up a bill, which is the right way round — and 500
 *  households is a wedding nobody in this group is having. */
const MAX_HOUSEHOLDS = 500;
/** This app tops out around 15 people; the cap exists so a bug can't scan. */
const MAX_MEMBERS = 50;
/** How many rows to draw before "Show more". RENDERING only — every household is
 *  already loaded and already counted. */
const RENDER_PAGE = 50;

type Mode =
  | { kind: "list" }
  | { kind: "view"; household: HouseholdWithId }
  | { kind: "form"; household?: HouseholdWithId }
  | { kind: "names"; household: HouseholdWithId }
  | { kind: "guestView"; guest: GuestWithId; household: HouseholdWithId };

interface Loaded {
  households: HouseholdWithId[];
  members: MembershipWithId[];
  targetHeads: number | null;
}

export default function GuestsPage() {
  const { user } = useAuth();
  const { tenantId, sideLabel } = useTenant();
  const { events } = useConfig();

  const [mode, setMode] = useState<Mode>({ kind: "list" });
  // At `lg:+`, detail opens as an inline expansion right under the row you
  // clicked (or under "+ Add" for a brand-new household), rather than a
  // separate pane elsewhere on screen — see the household map and the
  // return statement below. Below `lg:`, unchanged: a full-screen swap.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const openHouseholdId = mode.kind === "list" ? null : (mode.household?.id ?? null);
  const [filters, setFilters] = useState<GuestFilters>(NO_FILTERS);
  const [grouping, setGrouping] = useState<BreakdownKey>("side");
  const [shown, setShown] = useState(RENDER_PAGE);
  const [writeError, setWriteError] = useState<string | null>(null);
  // Held outside the loader so saving a target doesn't force a re-read of 300
  // households to move one number. `undefined` means "no local change yet".
  const [targetOverride, setTargetOverride] = useState<number | null | undefined>(undefined);

  const load = useCallback(async (): Promise<Loaded> => {
    const [householdSnap, memberSnap, targetSnap] = await Promise.all([
      getDocs(query(householdsCol(tenantId), limit(MAX_HOUSEHOLDS))),
      getDocs(query(membershipsCol(), where("tenantId", "==", tenantId), limit(MAX_MEMBERS))),
      getDoc(guestTargetDoc(tenantId)),
    ]);

    // Sorted in memory, not with orderBy("name"): a Firestore order query
    // silently OMITS documents missing that field, and a household that vanished
    // from the list would also vanish from the headcount. Same reasoning as
    // ConfigProvider's byOrder.
    const households = householdSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as HouseholdWithId)
      .sort((a, b) => a.name.localeCompare(b.name));

    const target = targetSnap.exists() ? Number(targetSnap.data().targetHeads) : 0;

    return {
      households,
      members: memberSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as MembershipWithId),
      targetHeads: Number.isFinite(target) && target > 0 ? target : null,
    };
  }, [tenantId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load the guest list.");

  const households = useMemo(() => data?.households ?? [], [data]);
  const plates = useMemo(() => platesByEvent(events), [events]);
  const targetHeads = targetOverride === undefined ? (data?.targetHeads ?? null) : targetOverride;

  const members = useMemo(
    () =>
      (data?.members ?? [])
        .filter((m): m is MembershipWithId & { uid: string } => Boolean(m.uid))
        .map((m) => ({ uid: m.uid, label: m.displayName || m.email })),
    [data],
  );

  const visible = useMemo(() => filterHouseholds(households, filters), [households, filters]);
  const summary = useMemo(() => summarise(visible, plates), [visible, plates]);
  const ladder = useMemo(
    () => tierLadder(visible, plates, targetHeads),
    [visible, plates, targetHeads],
  );

  const barRows = useMemo<GuestBarRow[]>(() => {
    const label = (key: string): { name: string; colour: string; icon?: string } => {
      if (grouping === "side") return { name: sideLabel(key as Side), colour: FALLBACK_COLOUR };
      if (grouping === "tier") return { name: TIER_LABELS[key as Tier], colour: FALLBACK_COLOUR };
      if (grouping === "event") {
        const event = events.find((e) => e.id === key);
        return {
          name: event?.name ?? "Unknown",
          colour: event?.colour ?? FALLBACK_COLOUR,
          icon: event?.icon,
        };
      }
      return {
        name: members.find((m) => m.uid === key)?.label ?? "Nobody said",
        colour: FALLBACK_COLOUR,
      };
    };
    return breakdownBy(visible, plates, grouping).map((row) => ({ ...row, ...label(row.key) }));
  }, [visible, plates, grouping, sideLabel, events, members]);

  // ---- writes --------------------------------------------------------------
  // Everything that changes a household goes through here, so the aggregate and
  // the change log have exactly one place that maintains them.

  const writeAggregate = useCallback(
    async (list: readonly HouseholdWithId[]) => {
      try {
        await setDoc(guestTotalsDoc(tenantId), {
          ...guestTotalsFrom(list, plates),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        // Best-effort: the household write already succeeded, and the next one
        // recomputes this document from scratch anyway. Failing somebody's edit
        // over a stale summary on Home would be the wrong trade.
        console.warn("[guests] totals rewrite failed (self-heals on the next write):", err);
      }
    },
    [tenantId, plates],
  );

  const writeLog = useCallback(
    async (
      action: GuestLogAction,
      householdName: string,
      householdId: string | null,
      people: number,
    ) => {
      if (!user) return;
      try {
        await addDoc(guestLogCol(tenantId), {
          action,
          householdName,
          householdId,
          people,
          by: user.uid,
          byName: user.displayName ?? user.email ?? "Someone",
          at: serverTimestamp(),
        });
      } catch (err) {
        console.warn("[guests] change log entry failed:", err);
      }
    },
    [tenantId, user],
  );

  const saveHousehold = useCallback(
    async (draft: HouseholdDraft, existing?: HouseholdWithId) => {
      if (!user) throw new Error("not signed in");
      let next: HouseholdWithId[];
      let saved: HouseholdWithId;

      if (existing) {
        await updateDoc(householdDoc(tenantId, existing.id), {
          ...draft,
          updatedAt: serverTimestamp(),
        });
        saved = { ...existing, ...draft };
        next = households.map((h) => (h.id === existing.id ? saved : h));
      } else {
        const ref = await addDoc(householdsCol(tenantId), {
          ...draft,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        saved = { id: ref.id, ...draft } as HouseholdWithId;
        next = [...households, saved];
      }

      await writeAggregate(next);
      await writeLog(
        existing ? "updated" : "added",
        draft.name,
        existing?.id ?? null,
        draft.adultCount + draft.childCount,
      );
      reload();
      // Every save — add or edit — routes into the Names screen for that
      // household. That screen's own empty state already offers "Add a name"
      // and a "Back to the guest list" skip, so this is the whole fix: one
      // fewer hop to remember, no new UI, and consistent whichever way you got
      // here.
      setMode({ kind: "names", household: saved });
    },
    [tenantId, user, households, writeAggregate, writeLog, reload],
  );

  const removeHousehold = useCallback(
    async (household: HouseholdWithId) => {
      await deleteDoc(householdDoc(tenantId, household.id));
      const next = households.filter((h) => h.id !== household.id);
      await writeAggregate(next);
      // The log is the only record left once the document is gone — which is
      // the whole reason it exists (§4.3).
      await writeLog("removed", household.name, null, household.adultCount + household.childCount);
      setMode({ kind: "list" });
      reload();
    },
    [tenantId, households, writeAggregate, writeLog, reload],
  );

  function exportCsv() {
    // Client-side only: a Blob and an object URL. No upload, no Storage, no
    // server — a few hundred rows is nothing to build in the browser.
    const csv = Papa.unparse(
      householdsToCsvRows(visible, {
        sideLabels: { a: sideLabel("a"), b: sideLabel("b") },
        eventName: (id) => events.find((e) => e.id === id)?.name ?? "",
      }),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `guest-list-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const eventNamesFor = useCallback(
    (h: HouseholdWithId) =>
      h.eventIds
        .map((id) => events.find((e) => e.id === id))
        .filter((e) => e !== undefined)
        .map((e) => ({ id: e.id, name: e.name, colour: e.colour, icon: e.icon })),
    [events],
  );

  // ---- modes ---------------------------------------------------------------
  // Below `lg:` this is a full-screen swap — exactly one of list/detail
  // renders, matching the rest of the app. At `lg:+`, `detail` instead renders
  // inline, directly under the row (or "+ Add") that opened it — see the
  // household map and the return statement below (CLAUDE.md § Responsive
  // layout). Same Mode state and handlers either way, just a different
  // render shape.

  let detail: ReactNode = null;

  if (mode.kind === "guestView") {
    detail = (
      <GuestView
        guest={mode.guest}
        household={mode.household}
        onBack={() => setMode({ kind: "list" })}
      />
    );
  } else if (mode.kind === "view") {
    const household = mode.household;
    detail = (
      <HouseholdView
        household={household}
        plates={plates}
        sideLabel={sideLabel(household.side)}
        eventNames={eventNamesFor(household)}
        onEdit={() => setMode({ kind: "form", household })}
        onNames={() => setMode({ kind: "names", household })}
        onBack={() => setMode({ kind: "list" })}
      />
    );
  } else if (mode.kind === "form") {
    const editing = mode.household;
    detail = (
      <div className="flex flex-1 flex-col px-5 py-6">
        <HouseholdForm
          existing={editing}
          households={households}
          members={members}
          plates={plates}
          onSave={(draft) => saveHousehold(draft, editing)}
          onCancel={() => setMode({ kind: "list" })}
          onDelete={editing ? () => removeHousehold(editing) : undefined}
        />
      </div>
    );
  } else if (mode.kind === "names") {
    const household = mode.household;
    detail = (
      <GuestNames
        tenantId={tenantId}
        uid={user?.uid ?? ""}
        household={household}
        onBack={() => setMode({ kind: "list" })}
        onReconcile={async (counts) => {
          await updateDoc(householdDoc(tenantId, household.id), {
            ...counts,
            updatedAt: serverTimestamp(),
          });
          const next = households.map((h) => (h.id === household.id ? { ...h, ...counts } : h));
          await writeAggregate(next);
          setMode({ kind: "list" });
          reload();
        }}
      />
    );
  }

  const filtering = activeFilterCount(filters) > 0 || filters.search.trim().length > 0;

  const list = (
    <div className="flex flex-1 flex-col gap-5 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-stone-800">Guests</h1>
          <p className="mt-1 text-sm text-stone-500">
            Households, not individuals — one invitation, however many plates.
          </p>
        </div>
        <SecondaryButton onClick={() => setMode({ kind: "form" })}>+ Add</SecondaryButton>
      </div>

      {/* The one case with no row to expand under: a brand-new household.
          Opens right where "+ Add" was clicked instead of the last row's
          detail pane. */}
      {isDesktop && mode.kind === "form" && !mode.household ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4">{detail}</div>
      ) : null}

      <FormMessage error={writeError ?? error} />

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : households.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
          <p className="text-sm text-stone-500">
            Nobody on the list yet. A name and two numbers is enough — &ldquo;Dad&rsquo;s
            colleagues, 12 people&rdquo; is a perfectly good entry.
          </p>
          <div className="mt-4 flex flex-col items-center gap-2">
            <PrimaryButton onClick={() => setMode({ kind: "form" })}>
              Add the first household
            </PrimaryButton>
            <Link
              href={tenantHref(tenantId, "/guests/import")}
              className="min-h-[44px] px-2 py-3 text-sm font-medium text-rose-600"
            >
              or import a spreadsheet
            </Link>
          </div>
        </div>
      ) : (
        <>
          <TierLadder
            rows={ladder}
            targetHeads={targetHeads}
            tenantId={tenantId}
            uid={user?.uid ?? ""}
            onTargetSaved={setTargetOverride}
          />

          <div className="flex flex-col gap-3">
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search households"
              className="min-h-[48px] w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-800 outline-none placeholder:text-stone-400 focus:border-rose-400"
            />

            <FilterPanel
              activeCount={activeFilterCount(filters)}
              onClear={() => setFilters((f) => ({ ...NO_FILTERS, search: f.search }))}
            >
              <ChipRow<Tier>
                label="Tier"
                options={TIERS.map((t) => ({ value: t, label: TIER_LABELS[t] }))}
                value={filters.tier}
                onChange={(tier) => setFilters((f) => ({ ...f, tier }))}
                allowClear
              />
              <ChipRow<Side>
                label="Side"
                options={SIDES.map((s) => ({ value: s, label: sideLabel(s) }))}
                value={filters.side}
                onChange={(side) => setFilters((f) => ({ ...f, side }))}
                allowClear
              />
              <ChipRow<HouseholdStatus>
                label="Status"
                options={HOUSEHOLD_STATUSES.map((s) => ({
                  value: s,
                  label: HOUSEHOLD_STATUS_LABELS[s],
                }))}
                value={filters.status}
                onChange={(status) => setFilters((f) => ({ ...f, status }))}
                allowClear
              />
              <ChipRow
                label="Whose guests"
                options={members.map((m) => ({ value: m.uid, label: m.label }))}
                value={filters.invitedBy}
                onChange={(invitedBy) => setFilters((f) => ({ ...f, invitedBy }))}
                allowClear
                emptyLabel="Nobody else is in this wedding yet."
              />
              <ChipRow
                label="Event"
                options={events.map((e) => ({
                  value: e.id,
                  label: e.name,
                  colour: e.colour,
                  icon: e.icon,
                }))}
                value={filters.eventId}
                onChange={(eventId) => setFilters((f) => ({ ...f, eventId }))}
                allowClear
                emptyLabel="No events yet."
              />
              <ChipRow
                label="Relationship"
                options={relationshipOptions(households).map((r) => ({ value: r, label: r }))}
                value={filters.relationship}
                onChange={(relationship) => setFilters((f) => ({ ...f, relationship }))}
                allowClear
                emptyLabel="Nobody has filled in a relationship yet."
              />
              {/* Travel and accommodation as one row: they are never both the
                  question at once, and two more chip rows is the clutter the
                  Phase 2.1 filter round set out to remove. */}
              <ChipRow<"travel" | "accommodation">
                label="Needs"
                options={[
                  { value: "travel", label: "Travel" },
                  { value: "accommodation", label: "Accommodation" },
                ]}
                value={
                  filters.travelNeeded
                    ? "travel"
                    : filters.accommodationNeeded
                      ? "accommodation"
                      : null
                }
                onChange={(need) =>
                  setFilters((f) => ({
                    ...f,
                    travelNeeded: need === "travel" ? true : null,
                    accommodationNeeded: need === "accommodation" ? true : null,
                  }))
                }
                allowClear
              />
            </FilterPanel>
          </div>

          {/* Every number here is computed from `visible`, so it always describes
              exactly the rows below it. A filter that changed the list but not
              the total would be worse than no filter (§4.4). */}
          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-2xl font-semibold text-stone-800">
              {summary.people} {summary.people === 1 ? "person" : "people"}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {summary.households} {summary.households === 1 ? "household" : "households"} ·{" "}
              {summary.adults} adults, {summary.children} children ·{" "}
              {formatINR(summary.projectedPaise)} projected
              {filtering ? <span className="text-rose-600"> · filtered</span> : null}
            </p>
            {/* The room block (§4.4). Hotels ask for this early and it is a
                large budget line, so it lives beside the headcount rather than
                on a screen of its own. */}
            {summary.accommodationHouseholds > 0 || summary.travelHouseholds > 0 ? (
              <p className="mt-1 text-sm text-stone-500">
                {summary.accommodationHouseholds} need a room ({summary.roomsNeeded} rooms,{" "}
                {summary.nightsNeeded} room-nights) · {summary.travelHouseholds} need travel
              </p>
            ) : null}
          </section>

          <NamedGuestsBrowser
            tenantId={tenantId}
            visibleHouseholds={visible}
            onViewGuest={(guest, household) => setMode({ kind: "guestView", guest, household })}
          />

          <Expander summary="Breakdown">
            <ChipRow<BreakdownKey>
              options={[
                { value: "side", label: "By side" },
                { value: "invitedBy", label: "Whose guests" },
                { value: "tier", label: "By tier" },
                { value: "event", label: "By event" },
              ]}
              value={grouping}
              onChange={(v) => v && setGrouping(v)}
            />
            <GuestBars rows={barRows} />
            <p className="text-xs text-stone-400">
              Solid is adults, lighter is children — child plates price differently.
            </p>
          </Expander>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
              Nothing matches those filters.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.slice(0, shown).map((household) => (
                <Fragment key={household.id}>
                  <HouseholdCard
                    household={household}
                    plates={plates}
                    sideLabel={sideLabel(household.side)}
                    onView={() => {
                      // A second click on the already-open row collapses it
                      // (desktop only — mobile has nothing to collapse back
                      // into, it's a full-screen swap).
                      if (isDesktop && mode.kind === "view" && mode.household.id === household.id) {
                        setMode({ kind: "list" });
                      } else {
                        setMode({ kind: "view", household });
                      }
                    }}
                  />
                  {/* Detail loads as an extension of the row you clicked, not
                      a separate pane elsewhere on screen — so it's always
                      obvious whose detail you're looking at. */}
                  {isDesktop && openHouseholdId === household.id ? (
                    <li className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
                      {detail}
                    </li>
                  ) : null}
                </Fragment>
              ))}
            </ul>
          )}

          {visible.length > shown ? (
            <SecondaryButton
              className="self-center"
              onClick={() => setShown((n) => n + RENDER_PAGE)}
            >
              Show {Math.min(RENDER_PAGE, visible.length - shown)} more
            </SecondaryButton>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={tenantHref(tenantId, "/guests/import")}
              className="min-h-[44px] px-2 py-3 text-sm font-medium text-rose-600"
            >
              Import a spreadsheet
            </Link>
            <button
              type="button"
              onClick={() => {
                try {
                  exportCsv();
                } catch (err) {
                  console.error("[guests] export failed:", err);
                  setWriteError("Could not build that CSV.");
                }
              }}
              className="min-h-[44px] px-2 py-3 text-sm font-medium text-rose-600"
            >
              Export {filtering ? "these" : "all"} as CSV
            </button>
          </div>

          <ChangeLog tenantId={tenantId} />
        </>
      )}
    </div>
  );

  // Below `lg:`, exactly one of `list`/`detail` is visible — a full-screen
  // swap, matching the rest of the app. At `lg:+`, `list` is always what's
  // on screen; `detail` is never rendered as a separate pane here — it's
  // already inlined above, right under the row (or "+ Add") that opened it,
  // which is what makes it obvious whose detail is showing (CLAUDE.md §
  // Responsive layout).
  return isDesktop ? list : mode.kind === "list" ? list : detail;
}

/** READ COST: a `<details>` renders its children eagerly, so the rows are
 *  mounted only once somebody actually opens the log. */
function ChangeLog({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-2xl border border-stone-200 bg-white"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium text-stone-600 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-stone-400">
          &#9662;
        </span>
        Who changed what
      </summary>
      <div className="px-4 py-3">{open ? <ChangeLogRows tenantId={tenantId} /> : null}</div>
    </details>
  );
}

/** READ COST: bounded. The log is append-only and grows forever, so this is the
 *  one collection in the phase where the cap really matters. */
const MAX_LOG_ROWS = 30;

const LOG_VERB: Record<GuestLogAction, string> = {
  added: "added",
  updated: "edited",
  removed: "removed",
  imported: "imported",
};

function ChangeLogRows({ tenantId }: { tenantId: string }) {
  const load = useCallback(async () => {
    // orderBy on a single field is an automatic index — nothing to deploy. The
    // collection is new, and every writer stamps `at`, so nothing is omitted.
    const snap = await getDocs(
      query(guestLogCol(tenantId), orderBy("at", "desc"), limit(MAX_LOG_ROWS)),
    );
    return snap.docs.map((d) => {
      const row = d.data();
      return {
        id: d.id,
        action: (row.action ?? "updated") as GuestLogAction,
        householdName: String(row.householdName ?? ""),
        byName: String(row.byName ?? "Someone"),
        people: Number(row.people ?? 0),
        at: (row.at?.toDate?.() as Date | undefined) ?? undefined,
      };
    });
  }, [tenantId]);

  const { data, loading, error } = useLoader(load, "Could not load the change log.");

  if (loading) return <p className="text-sm text-stone-400">Loading…</p>;
  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!data || data.length === 0)
    return <p className="text-sm text-stone-400">Nothing has changed yet.</p>;

  return (
    <ul className="flex flex-col gap-2 text-sm text-stone-600">
      {data.map((row) => (
        <li key={row.id}>
          <span className="font-medium text-stone-700">{row.byName}</span> {LOG_VERB[row.action]}{" "}
          {row.householdName}
          {row.people > 0 ? ` (${row.people})` : ""}
          {row.at ? <span className="text-stone-400"> · {row.at.toLocaleDateString()}</span> : null}
        </li>
      ))}
    </ul>
  );
}
