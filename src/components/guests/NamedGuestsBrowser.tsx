"use client";

// Browse every NAMED guest across the currently filtered households.
//
// Added on request as a companion to the summary box above it, which shows
// PLANNED headcount (the authoritative number) and was never meant to open into
// a names list — most households have none at all (§4.1's whole point). This is
// the honest answer to "where do I see names": a separate, secondary view, not a
// drill-down on the summary.
//
// Tapping a row opens that guest's profile (GuestView) — same screen the
// household's own Names list uses, just without Edit/Remove: this is a
// cross-household browse, and editing stays one tap further, on the household
// the guest actually belongs to.
//
// READ COST: one bounded read of the WHOLE `guests` collection, lazy — mounted
// only once the expander is opened, same pattern as the change log below it.

import { useCallback, useMemo, useState } from "react";
import { getDocs, limit, query } from "firebase/firestore";
import { useLoader } from "@/lib/hooks/useLoader";
import { guestsCol } from "@/lib/paths";
import { AGE_GROUP_LABELS, type GuestWithId, type HouseholdWithId } from "@/types";

/** READ COST: bounded per CLAUDE.md §3. A wedding with more than 500 NAMED
 *  guests (not planned heads) is not this app's audience; the view
 *  under-reports rather than running up a bill. */
const MAX_NAMED_GUESTS = 500;

export function NamedGuestsBrowser({
  tenantId,
  visibleHouseholds,
  onViewGuest,
}: {
  tenantId: string;
  /** Already filtered by the screen's active filters — this view respects them
   *  too, same as every other count on the page (§4.4). */
  visibleHouseholds: readonly HouseholdWithId[];
  /** Opens the guest's profile — a full-screen swap owned by the parent page,
   *  same as the household "view" mode, rather than something rendered inside
   *  this collapsed drawer. */
  onViewGuest: (guest: GuestWithId, household: HouseholdWithId) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="rounded-2xl border border-stone-200 bg-white [&[open]>summary]:border-b [&[open]>summary]:border-stone-100"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium text-stone-600 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-stone-400">
          &#9662;
        </span>
        Named guests
      </summary>
      <div className="px-4 py-3">
        {open ? (
          <Rows tenantId={tenantId} visibleHouseholds={visibleHouseholds} onViewGuest={onViewGuest} />
        ) : null}
      </div>
    </details>
  );
}

function Rows({
  tenantId,
  visibleHouseholds,
  onViewGuest,
}: {
  tenantId: string;
  visibleHouseholds: readonly HouseholdWithId[];
  onViewGuest: (guest: GuestWithId, household: HouseholdWithId) => void;
}) {
  const load = useCallback(async () => {
    const snap = await getDocs(query(guestsCol(tenantId), limit(MAX_NAMED_GUESTS)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GuestWithId);
  }, [tenantId]);

  const { data, loading, error } = useLoader(load, "Could not load named guests.");

  const householdById = useMemo(
    () => new Map(visibleHouseholds.map((h) => [h.id, h])),
    [visibleHouseholds],
  );
  const visibleIds = useMemo(() => new Set(visibleHouseholds.map((h) => h.id)), [visibleHouseholds]);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((g) => visibleIds.has(g.householdId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data, visibleIds],
  );

  if (loading) return <p className="text-sm text-stone-400">Loading…</p>;
  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-stone-400">
        No names entered yet for the households shown — planned headcounts above already count
        everyone, named or not.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.map((guest) => {
        const household = householdById.get(guest.householdId);
        return (
          <li key={guest.id} className="border-b border-stone-50 pb-2 last:border-0">
            <button
              type="button"
              onClick={() => household && onViewGuest(guest, household)}
              disabled={!household}
              className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-stone-700">{guest.name}</p>
                <p className="truncate text-xs text-stone-400">
                  {household?.name ?? "Unknown household"}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-stone-400">
                {AGE_GROUP_LABELS[guest.ageGroup]}
                {guest.dietary ? (
                  <>
                    <br />
                    {guest.dietary}
                  </>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
