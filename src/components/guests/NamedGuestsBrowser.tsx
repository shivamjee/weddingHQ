"use client";

// Browse every NAMED guest across the currently filtered households.
//
// Added on request as a companion to the summary box above it, which shows
// PLANNED headcount (the authoritative number) and was never meant to open into
// a names list — most households have none at all (§4.1's whole point). This is
// the honest answer to "where do I see names": a separate, secondary view, not a
// drill-down on the summary. Editing a name still happens on the household's own
// "Names" screen; this is read-only, for scanning across households.
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
}: {
  tenantId: string;
  /** Already filtered by the screen's active filters — this view respects them
   *  too, same as every other count on the page (§4.4). */
  visibleHouseholds: readonly HouseholdWithId[];
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
        {open ? <Rows tenantId={tenantId} visibleHouseholds={visibleHouseholds} /> : null}
      </div>
    </details>
  );
}

function Rows({
  tenantId,
  visibleHouseholds,
}: {
  tenantId: string;
  visibleHouseholds: readonly HouseholdWithId[];
}) {
  const load = useCallback(async () => {
    const snap = await getDocs(query(guestsCol(tenantId), limit(MAX_NAMED_GUESTS)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GuestWithId);
  }, [tenantId]);

  const { data, loading, error } = useLoader(load, "Could not load named guests.");

  const householdName = useMemo(
    () => new Map(visibleHouseholds.map((h) => [h.id, h.name])),
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
      {rows.map((guest) => (
        <li
          key={guest.id}
          className="flex items-center justify-between gap-3 border-b border-stone-50 pb-2 last:border-0"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-stone-700">{guest.name}</p>
            <p className="truncate text-xs text-stone-400">
              {householdName.get(guest.householdId) ?? "Unknown household"}
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
        </li>
      ))}
    </ul>
  );
}
