// Guest-list maths (FEATURES.md §4.2 / §4.4, PHASE3 Steps 2-3).
//
// Pure functions, no Firebase, so the arithmetic is unit-tested rather than
// eyeballed in a chart. Everything is integer paise in and integer paise out —
// no division until the render edge. Same contract as src/lib/budget.ts.
//
// THE RULE THIS MODULE ENFORCES: head counts come from the household's
// hand-entered `adultCount` / `childCount` and NEVER from counting `guests`
// documents (FEATURES.md §4.1). "Dad's colleagues, 12 people" is a complete
// household with zero names attached, and it must count as 12 everywhere. No
// function here takes a guest document at all, which is the cheapest way to make
// that impossible to get wrong.

import { toPaise, type Paise } from "@/lib/money";
import { toInternational } from "@/lib/phone";
import { TIERS, type HouseholdStatus, type Side, type Tier } from "@/types";

/** The fields every projection actually needs. Structural rather than
 *  `Household`, so tests build plain literals and the CSV dry-run can score rows
 *  that aren't documents yet. */
export interface PlannedHousehold {
  adultCount: number;
  childCount: number;
  eventIds: readonly string[];
}

/** Per-plate cost for each event, in paise, keyed by event id. Built once from
 *  `useConfig().events`, which is already loaded — this phase adds no read for
 *  it. */
export type PlateByEventId = Readonly<Record<string, number>>;

/** A count that a person typed. Negative, fractional and NaN all become 0 rather
 *  than poisoning a total downstream. */
function count(n: number | null | undefined): number {
  const value = Math.trunc(n || 0);
  return value > 0 ? value : 0;
}

export function platesByEvent(
  events: readonly { id: string; perPlateEstPaise: number }[],
): PlateByEventId {
  const plates: Record<string, number> = {};
  for (const event of events) plates[event.id] = count(event.perPlateEstPaise);
  return plates;
}

/** Planned heads for one household. THE number — see the module header. */
export function householdHeads(h: { adultCount: number; childCount: number }): number {
  return count(h.adultCount) + count(h.childCount);
}

/**
 * What one household is projected to cost: planned heads × the sum of the
 * per-plate estimates for the events they are actually invited to.
 *
 * Per-event invitation is the point of the `eventIds` loop — a colleague invited
 * only to the reception must not appear in the mehendi catering count
 * (FEATURES.md §4.1). A household invited to nothing costs nothing, which is the
 * honest answer rather than a guess.
 *
 * Child plates are priced the same as adult plates here. FEATURES.md §4.4 only
 * asks for the adults-vs-children split in the *breakdowns*, and inventing a
 * child rate nobody has quoted would make the projection look precise while
 * being wrong.
 * ponytail: single plate rate; add `perPlateChildEstPaise` to Event if a caterer
 * ever actually quotes one.
 */
export function householdCostPaise(h: PlannedHousehold, plates: PlateByEventId): Paise {
  const perHead = h.eventIds.reduce((total, eventId) => total + count(plates[eventId]), 0);
  return toPaise(householdHeads(h) * perHead);
}

/** Every number the Guests screen puts on the screen, for whatever set of
 *  households it was handed. A filtered view is `summarise(filterHouseholds(…))`,
 *  which is how "every count respects the active filters" stays true by
 *  construction instead of by remembering to. */
export interface GuestSummary {
  households: number;
  adults: number;
  children: number;
  /** adults + children — the number the venue argues about. */
  people: number;
  projectedPaise: Paise;
  /** Room block (FEATURES.md §4.4): hotels ask early and it is a large line. */
  accommodationHouseholds: number;
  roomsNeeded: number;
  nightsNeeded: number;
  travelHouseholds: number;
}

type Summarisable = PlannedHousehold & {
  accommodationNeeded?: boolean;
  travelNeeded?: boolean;
  roomsNeeded?: number | null;
  nightsNeeded?: number | null;
};

export function summarise(
  households: readonly Summarisable[],
  plates: PlateByEventId,
): GuestSummary {
  let adults = 0;
  let children = 0;
  let projected = 0;
  let accommodationHouseholds = 0;
  let rooms = 0;
  let nights = 0;
  let travel = 0;

  for (const h of households) {
    adults += count(h.adultCount);
    children += count(h.childCount);
    projected += householdCostPaise(h, plates);
    if (h.travelNeeded) travel += 1;
    if (h.accommodationNeeded) {
      accommodationHouseholds += 1;
      rooms += count(h.roomsNeeded);
      // Nights are summed, not maxed: the hotel bills room-nights, so two
      // households at 3 nights each is six room-nights of demand, not three.
      nights += count(h.nightsNeeded);
    }
  }

  return {
    households: households.length,
    adults,
    children,
    people: adults + children,
    projectedPaise: toPaise(projected),
    accommodationHouseholds,
    roomsNeeded: rooms,
    nightsNeeded: nights,
    travelHouseholds: travel,
  };
}

// ---- filters ---------------------------------------------------------------

/** Every axis FEATURES.md §4.4 asks for, all combinable. `null` means "not
 *  filtering on this". */
export interface GuestFilters {
  tier: Tier | null;
  side: Side | null;
  invitedBy: string | null;
  eventId: string | null;
  relationship: string | null;
  status: HouseholdStatus | null;
  travelNeeded: boolean | null;
  accommodationNeeded: boolean | null;
  /** Free-text match on the household name. Not a "filter chip" — it lives above
   *  the drawer, like the Contacts screen's search. */
  search: string;
}

export const NO_FILTERS: GuestFilters = {
  tier: null,
  side: null,
  invitedBy: null,
  eventId: null,
  relationship: null,
  status: null,
  travelNeeded: null,
  accommodationNeeded: null,
  search: "",
};

/** How many chips are lit, for `FilterPanel`'s badge. `search` is excluded —
 *  it has its own visible input, so counting it would look like a phantom
 *  filter. */
export function activeFilterCount(filters: GuestFilters): number {
  return [
    filters.tier,
    filters.side,
    filters.invitedBy,
    filters.eventId,
    filters.relationship,
    filters.status,
    filters.travelNeeded,
    filters.accommodationNeeded,
  ].filter((value) => value !== null).length;
}

type Filterable = PlannedHousehold & {
  name: string;
  tier: Tier;
  side: Side;
  invitedBy: string;
  relationship: string;
  status: HouseholdStatus;
  travelNeeded: boolean;
  accommodationNeeded: boolean;
};

export function filterHouseholds<T extends Filterable>(
  households: readonly T[],
  filters: GuestFilters,
): T[] {
  const search = filters.search.trim().toLowerCase();
  return households.filter((h) => {
    if (filters.tier && h.tier !== filters.tier) return false;
    if (filters.side && h.side !== filters.side) return false;
    if (filters.invitedBy && h.invitedBy !== filters.invitedBy) return false;
    if (filters.eventId && !h.eventIds.includes(filters.eventId)) return false;
    if (filters.relationship && h.relationship !== filters.relationship) return false;
    if (filters.status && h.status !== filters.status) return false;
    if (filters.travelNeeded !== null && h.travelNeeded !== filters.travelNeeded) return false;
    if (
      filters.accommodationNeeded !== null &&
      h.accommodationNeeded !== filters.accommodationNeeded
    ) {
      return false;
    }
    if (search && !h.name.toLowerCase().includes(search)) return false;
    return true;
  });
}

/** The distinct relationships people have actually typed, for the filter chips.
 *  Free text, so the options come from the data rather than an enum. */
export function relationshipOptions(households: readonly { relationship: string }[]): string[] {
  const seen = new Set<string>();
  for (const h of households) {
    const value = h.relationship.trim();
    if (value) seen.add(value);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// ---- the tier ladder -------------------------------------------------------

/** One rung. CUMULATIVE, not per-tier: `runningPeople` is everyone at this tier
 *  AND every tier above it, which is the number that gets argued about. */
export interface LadderRow {
  tier: Tier;
  /** This tier alone. */
  households: number;
  people: number;
  projectedPaise: Paise;
  /** This tier and everything above it — the point of the whole table. */
  runningHouseholds: number;
  runningPeople: number;
  runningPaise: Paise;
  /** People over the target at this rung; 0 when inside it or when no target is
   *  set. */
  overBy: number;
  /** True on the FIRST rung that exceeds the target — "which tier breaks it". */
  breaksTarget: boolean;
}

/**
 * The primary view (FEATURES.md §4.2). With a cap of 400: Must is 260, adding
 * Should takes you to 430, so 30 people come off Should. The conversation
 * becomes "which of these are really Should?" rather than "why did you delete my
 * cousin?".
 *
 * Rungs with nothing in them are kept, not dropped — an empty "If space" tier is
 * information, and a table whose rows appear and vanish is hard to read.
 */
export function tierLadder(
  households: readonly (PlannedHousehold & { tier: Tier })[],
  plates: PlateByEventId,
  targetHeads: number | null,
): LadderRow[] {
  const target = targetHeads !== null && targetHeads > 0 ? Math.trunc(targetHeads) : null;
  let runningHouseholds = 0;
  let runningPeople = 0;
  let runningPaise = 0;
  let alreadyBroken = false;

  return TIERS.map((tier) => {
    const inTier = households.filter((h) => h.tier === tier);
    const summary = summarise(inTier, plates);

    runningHouseholds += summary.households;
    runningPeople += summary.people;
    runningPaise += summary.projectedPaise;

    const over = target !== null && runningPeople > target ? runningPeople - target : 0;
    const breaksTarget = over > 0 && !alreadyBroken;
    if (breaksTarget) alreadyBroken = true;

    return {
      tier,
      households: summary.households,
      people: summary.people,
      projectedPaise: summary.projectedPaise,
      runningHouseholds,
      runningPeople,
      runningPaise: toPaise(runningPaise),
      overBy: over,
      breaksTarget,
    };
  });
}

// ---- breakdowns ------------------------------------------------------------

/** One bar. `key` is a side / uid / event id; the caller turns it into a label
 *  and a colour, because only the caller knows the tenant's side labels and the
 *  event's own colour. */
export interface BreakdownRow {
  key: string;
  households: number;
  adults: number;
  children: number;
  people: number;
  projectedPaise: Paise;
}

export type BreakdownKey = "side" | "invitedBy" | "tier" | "event";

/**
 * Households and people grouped by side, by whose guest they are, by tier, or by
 * event (FEATURES.md §4.4). Adults and children stay separate — child plates
 * price differently, so collapsing them loses the number a caterer will ask for.
 *
 * The `"event"` grouping counts a household once per event it is invited to, and
 * prices it at THAT event's per-plate rate. So the event bars sum to the same
 * total as the projection, rather than counting a four-event household four
 * times at full cost.
 */
export function breakdownBy(
  households: readonly (PlannedHousehold & {
    side: Side;
    invitedBy: string;
    tier: Tier;
  })[],
  plates: PlateByEventId,
  key: BreakdownKey,
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();

  const bump = (bucket: string, h: PlannedHousehold, paise: number) => {
    const row = rows.get(bucket) ?? {
      key: bucket,
      households: 0,
      adults: 0,
      children: 0,
      people: 0,
      projectedPaise: toPaise(0),
    };
    row.households += 1;
    row.adults += count(h.adultCount);
    row.children += count(h.childCount);
    row.people += householdHeads(h);
    row.projectedPaise = toPaise(row.projectedPaise + paise);
    rows.set(bucket, row);
  };

  for (const h of households) {
    if (key === "event") {
      for (const eventId of h.eventIds) {
        bump(eventId, h, householdHeads(h) * count(plates[eventId]));
      }
    } else {
      bump(h[key], h, householdCostPaise(h, plates));
    }
  }

  return [...rows.values()];
}

// ---- the aggregate ---------------------------------------------------------

function emptySlice() {
  return { households: 0, adults: 0, children: 0, people: 0, projectedPaise: toPaise(0) };
}

function sliceFrom(row: BreakdownRow | undefined) {
  return row
    ? {
        households: row.households,
        adults: row.adults,
        children: row.children,
        people: row.people,
        projectedPaise: row.projectedPaise,
      }
    : emptySlice();
}

/**
 * The whole `aggregates/guestTotals` body, recomputed from the full list.
 *
 * Recompute-and-overwrite rather than an incremental delta: the caller already
 * holds every household in memory, so recomputing costs nothing, there is no
 * transaction to get wrong, and a document that somehow drifted heals itself on
 * the next household write. See src/types/guestTotals.ts.
 *
 * `updatedAt` is left to the caller so this stays free of Firebase.
 */
export function guestTotalsFrom(
  households: readonly (PlannedHousehold & {
    side: Side;
    invitedBy: string;
    tier: Tier;
    accommodationNeeded?: boolean;
    roomsNeeded?: number | null;
    nightsNeeded?: number | null;
  })[],
  plates: PlateByEventId,
) {
  const byKey = (key: BreakdownKey) =>
    new Map(breakdownBy(households, plates, key).map((row) => [row.key, row]));

  const tiers = byKey("tier");
  const sides = byKey("side");
  const events = byKey("event");
  const overall = summarise(households, plates);

  const byEvent: Record<string, ReturnType<typeof sliceFrom>> = {};
  for (const [eventId, row] of events) byEvent[eventId] = sliceFrom(row);

  return {
    byTier: {
      must: sliceFrom(tiers.get("must")),
      should: sliceFrom(tiers.get("should")),
      if_space: sliceFrom(tiers.get("if_space")),
    },
    bySide: {
      a: sliceFrom(sides.get("a")),
      b: sliceFrom(sides.get("b")),
    },
    byEvent,
    overall: {
      households: overall.households,
      adults: overall.adults,
      children: overall.children,
      people: overall.people,
      projectedPaise: overall.projectedPaise,
    },
    roomsNeeded: overall.roomsNeeded,
    nightsNeeded: overall.nightsNeeded,
  };
}

// ---- duplicate detection ---------------------------------------------------

/** Words that carry no identity in a household name, so "The Agarwals",
 *  "Agarwal family" and "Agarwal" all reduce to the same token. */
const NAME_NOISE = new Set(["the", "family", "familys", "ji", "and", "mr", "mrs", "dr", "&"]);

/** Lowercase, strip punctuation, drop noise words, and stem a trailing "s" so a
 *  plural surname matches its singular. */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
    .filter((word) => word.length > 0 && !NAME_NOISE.has(word));
}

export interface DuplicateMatch<T> {
  household: T;
  reason: "name" | "phone";
}

/**
 * Warn at entry, not as a cleanup screen later (FEATURES.md §4.3). With four
 * people adding independently, mutual family friends WILL be entered twice, and
 * the moment to say so is while somebody is still typing.
 *
 * A phone match is treated as certain; a name match is a nudge. Names match when
 * every identifying token of the shorter name appears in the longer one, so
 * "The Agarwals" flags "Agarwal" and "Agarwal Uncle" but not "Aggarwal".
 * ponytail: token-set containment, not edit distance — a typo'd surname slips
 * through. Reach for a proper fuzzy match only if that actually happens.
 */
export function duplicateMatches<T extends { id: string; name: string; primaryPhone: string }>(
  candidate: { id?: string; name: string; primaryPhone: string },
  households: readonly T[],
): DuplicateMatch<T>[] {
  const tokens = nameTokens(candidate.name);
  const phone = toInternational(candidate.primaryPhone);
  if (tokens.length === 0 && !phone) return [];

  const matches: DuplicateMatch<T>[] = [];
  for (const other of households) {
    if (candidate.id && other.id === candidate.id) continue;

    if (phone && toInternational(other.primaryPhone) === phone) {
      matches.push({ household: other, reason: "phone" });
      continue;
    }

    const otherTokens = nameTokens(other.name);
    if (tokens.length === 0 || otherTokens.length === 0) continue;
    const [shorter, longer] =
      tokens.length <= otherTokens.length ? [tokens, otherTokens] : [otherTokens, tokens];
    if (shorter.every((token) => longer.includes(token))) {
      matches.push({ household: other, reason: "name" });
    }
  }
  return matches;
}
