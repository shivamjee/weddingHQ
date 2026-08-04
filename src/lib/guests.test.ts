import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  breakdownBy,
  duplicateMatches,
  filterHouseholds,
  guestTotalsFrom,
  householdCostPaise,
  householdHeads,
  nameTokens,
  platesByEvent,
  relationshipOptions,
  summarise,
  tierLadder,
  NO_FILTERS,
  type GuestFilters,
  type PlateByEventId,
} from "./guests";
import type { HouseholdStatus, Side, Tier } from "@/types";

// ₹2,500 a plate = 250000 paise. Realistic numbers keep the lakh-scale
// exactness tests honest.
const PLATES: PlateByEventId = { mehendi: 150000, sangeet: 250000, wedding: 400000 };

type H = {
  id: string;
  name: string;
  side: Side;
  tier: Tier;
  status: HouseholdStatus;
  invitedBy: string;
  relationship: string;
  primaryPhone: string;
  eventIds: string[];
  adultCount: number;
  childCount: number;
  travelNeeded: boolean;
  accommodationNeeded: boolean;
  roomsNeeded: number | null;
  nightsNeeded: number | null;
};

// Spread-defaults builder, so each test states only the fields it cares about.
const h = (over: Partial<H> & Pick<H, "id">): H => ({
  name: `Household ${over.id}`,
  side: "a",
  tier: "must",
  status: "confirmed",
  invitedBy: "uid_couple",
  relationship: "",
  primaryPhone: "",
  eventIds: ["wedding"],
  adultCount: 2,
  childCount: 0,
  travelNeeded: false,
  accommodationNeeded: false,
  roomsNeeded: null,
  nightsNeeded: null,
  ...over,
});

describe("householdHeads", () => {
  it("is the two hand-entered counts and nothing else", () => {
    expect(householdHeads({ adultCount: 10, childCount: 2 })).toBe(12);
  });

  it("treats a blank, negative or fractional count as zero rather than poisoning the total", () => {
    expect(householdHeads({ adultCount: -3, childCount: 2.7 })).toBe(2);
    expect(householdHeads({ adultCount: NaN, childCount: 0 })).toBe(0);
  });
});

describe("householdCostPaise", () => {
  it("is planned heads times the plates of the events they're invited to", () => {
    // 4 heads × (sangeet 2500 + wedding 4000) = 4 × ₹6,500 = ₹26,000.
    const cost = householdCostPaise(
      { adultCount: 3, childCount: 1, eventIds: ["sangeet", "wedding"] },
      PLATES,
    );
    expect(cost).toBe(2600000);
  });

  it("does NOT count a household towards an event they were not invited to", () => {
    // The §4.1 promise: a colleague invited only to the reception must not
    // appear in the mehendi catering count.
    const receptionOnly = { adultCount: 2, childCount: 0, eventIds: ["wedding"] };
    expect(householdCostPaise(receptionOnly, PLATES)).toBe(2 * 400000);
  });

  it("costs nothing when they're invited to nothing, and ignores an unknown event id", () => {
    expect(householdCostPaise({ adultCount: 4, childCount: 0, eventIds: [] }, PLATES)).toBe(0);
    expect(householdCostPaise({ adultCount: 4, childCount: 0, eventIds: ["ghost"] }, PLATES)).toBe(
      0,
    );
  });

  it("counts twelve heads with zero names attached — THE regression this feature can cause", () => {
    // "Dad's colleagues, 12 people" is a complete household. Nothing in this
    // module takes a guest document, so a projection can never quietly switch to
    // counting names (FEATURES.md §4.1).
    const colleagues = { adultCount: 12, childCount: 0, eventIds: ["wedding"] };
    expect(householdHeads(colleagues)).toBe(12);
    expect(householdCostPaise(colleagues, PLATES)).toBe(12 * 400000);
  });

  it("stays exact at lakh scale — no float drift", () => {
    // 100 heads × ₹8,000 across three events = ₹8L exactly.
    const big = { adultCount: 100, childCount: 0, eventIds: ["mehendi", "sangeet", "wedding"] };
    expect(householdCostPaise(big, PLATES)).toBe(80000000);
    expect(Number.isInteger(householdCostPaise(big, PLATES))).toBe(true);
  });
});

describe("platesByEvent", () => {
  it("indexes the events already loaded by useConfig, so the projection costs no extra read", () => {
    expect(
      platesByEvent([
        { id: "sangeet", perPlateEstPaise: 250000 },
        { id: "wedding", perPlateEstPaise: 400000 },
      ]),
    ).toEqual({ sangeet: 250000, wedding: 400000 });
  });
});

describe("summarise", () => {
  it("splits adults and children, because child plates price differently", () => {
    const summary = summarise(
      [h({ id: "1", adultCount: 2, childCount: 2 }), h({ id: "2", adultCount: 4, childCount: 0 })],
      PLATES,
    );
    expect(summary).toMatchObject({ households: 2, adults: 6, children: 2, people: 8 });
  });

  it("is zero across the board on an empty list — no NaN, no division", () => {
    expect(summarise([], PLATES)).toMatchObject({
      households: 0,
      people: 0,
      projectedPaise: 0,
      roomsNeeded: 0,
    });
  });

  it("sums room-nights only for households that actually need accommodation", () => {
    const summary = summarise(
      [
        h({ id: "1", accommodationNeeded: true, roomsNeeded: 2, nightsNeeded: 3 }),
        h({ id: "2", accommodationNeeded: true, roomsNeeded: 1, nightsNeeded: 3 }),
        // Rooms filled in but the box unticked: not part of the block.
        h({ id: "3", accommodationNeeded: false, roomsNeeded: 9, nightsNeeded: 9 }),
      ],
      PLATES,
    );
    expect(summary).toMatchObject({
      accommodationHouseholds: 2,
      roomsNeeded: 3,
      nightsNeeded: 6,
    });
  });
});

describe("filterHouseholds", () => {
  const list = [
    h({ id: "1", side: "a", tier: "must", eventIds: ["wedding"] }),
    h({ id: "2", side: "b", tier: "should", eventIds: ["sangeet", "wedding"] }),
    h({ id: "3", side: "b", tier: "should", eventIds: ["wedding"], status: "proposed" }),
  ];

  it("returns everything when nothing is selected", () => {
    expect(filterHouseholds(list, NO_FILTERS)).toHaveLength(3);
  });

  it("combines axes — side AND tier AND event, not OR", () => {
    const filters: GuestFilters = { ...NO_FILTERS, side: "b", tier: "should", eventId: "sangeet" };
    expect(filterHouseholds(list, filters).map((x) => x.id)).toEqual(["2"]);
  });

  it("filters on a boolean axis without treating false as 'not filtering'", () => {
    const withTravel = [
      h({ id: "1", travelNeeded: true }),
      h({ id: "2", travelNeeded: false }),
    ];
    expect(filterHouseholds(withTravel, { ...NO_FILTERS, travelNeeded: false })).toHaveLength(1);
    expect(filterHouseholds(withTravel, { ...NO_FILTERS, travelNeeded: null })).toHaveLength(2);
  });

  it("a filtered summary equals the sum of exactly the rows shown", () => {
    // The invariant behind "every count on screen respects the active filters":
    // the screen summarises the same array it renders.
    const filters: GuestFilters = { ...NO_FILTERS, side: "b" };
    const visible = filterHouseholds(list, filters);
    const summary = summarise(visible, PLATES);
    expect(summary.households).toBe(visible.length);
    expect(summary.projectedPaise).toBe(
      visible.reduce((total, x) => total + householdCostPaise(x, PLATES), 0),
    );
  });

  it("search is case-insensitive on the name and is not counted as a chip", () => {
    const named = [h({ id: "1", name: "The Agarwals" }), h({ id: "2", name: "Sharma family" })];
    expect(filterHouseholds(named, { ...NO_FILTERS, search: "agarwal" })).toHaveLength(1);
    expect(activeFilterCount({ ...NO_FILTERS, search: "agarwal" })).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, side: "a", tier: "must" })).toBe(2);
  });
});

describe("relationshipOptions", () => {
  it("offers only the relationships somebody actually typed, deduped and sorted", () => {
    expect(
      relationshipOptions([
        { relationship: "Paternal cousins" },
        { relationship: "" },
        { relationship: "Dad's colleagues" },
        { relationship: "Paternal cousins" },
      ]),
    ).toEqual(["Dad's colleagues", "Paternal cousins"]);
  });
});

describe("tierLadder", () => {
  // The §4.2 worked example, in miniature: must 260, +should 430, +if space 550.
  const list = [
    h({ id: "m", tier: "must", adultCount: 260, eventIds: ["wedding"] }),
    h({ id: "s", tier: "should", adultCount: 170, eventIds: ["wedding"] }),
    h({ id: "i", tier: "if_space", adultCount: 120, eventIds: ["wedding"] }),
  ];

  it("runs a CUMULATIVE total, not a per-tier one", () => {
    const rows = tierLadder(list, PLATES, 400);
    expect(rows.map((r) => r.people)).toEqual([260, 170, 120]);
    expect(rows.map((r) => r.runningPeople)).toEqual([260, 430, 550]);
  });

  it("marks which tier breaks the target and by how many people", () => {
    const rows = tierLadder(list, PLATES, 400);
    expect(rows[0]).toMatchObject({ tier: "must", overBy: 0, breaksTarget: false });
    expect(rows[1]).toMatchObject({ tier: "should", overBy: 30, breaksTarget: true });
    // Still over, but "should" is the tier that broke it — only one marker.
    expect(rows[2]).toMatchObject({ tier: "if_space", overBy: 150, breaksTarget: false });
  });

  it("is exactly on target, not over, at the boundary", () => {
    const rows = tierLadder(list, PLATES, 430);
    expect(rows[1]).toMatchObject({ overBy: 0, breaksTarget: false });
    expect(rows[2]).toMatchObject({ overBy: 120, breaksTarget: true });
  });

  it("marks nothing when no target is set — it does not invent one", () => {
    const rows = tierLadder(list, PLATES, null);
    expect(rows.every((r) => r.overBy === 0 && !r.breaksTarget)).toBe(true);
    expect(rows[2].runningPeople).toBe(550);
  });

  it("keeps empty rungs, so a tier nobody has used is visibly empty", () => {
    const rows = tierLadder([h({ id: "m", tier: "must", adultCount: 10 })], PLATES, null);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ tier: "if_space", households: 0, runningPeople: 10 });
  });

  it("accumulates cost alongside people", () => {
    const rows = tierLadder(list, PLATES, null);
    expect(rows[0].runningPaise).toBe(260 * 400000);
    expect(rows[2].runningPaise).toBe(550 * 400000);
  });

  it("rooms is per-tier, not cumulative — unlike the running fields", () => {
    const withRooms = [
      h({ id: "m", tier: "must", accommodationNeeded: true, roomsNeeded: 2 }),
      h({ id: "s", tier: "should", accommodationNeeded: true, roomsNeeded: 3 }),
    ];
    const rows = tierLadder(withRooms, PLATES, null);
    expect(rows[0].rooms).toBe(2);
    expect(rows[1].rooms).toBe(3); // NOT 5 — this tier alone, not must+should
    expect(rows[2].rooms).toBe(0);
  });
});

describe("breakdownBy", () => {
  const list = [
    h({ id: "1", side: "a", adultCount: 2, childCount: 1, eventIds: ["sangeet", "wedding"] }),
    h({ id: "2", side: "b", adultCount: 4, childCount: 0, eventIds: ["wedding"] }),
  ];

  it("groups by side with adults and children kept apart", () => {
    const rows = breakdownBy(list, PLATES, "side");
    expect(rows.find((r) => r.key === "a")).toMatchObject({ adults: 2, children: 1, people: 3 });
    expect(rows.find((r) => r.key === "b")).toMatchObject({ adults: 4, children: 0, people: 4 });
  });

  it("counts a household once per event, priced at THAT event's plate", () => {
    const rows = breakdownBy(list, PLATES, "event");
    // Sangeet: only household 1, 3 heads × ₹2,500.
    expect(rows.find((r) => r.key === "sangeet")).toMatchObject({
      people: 3,
      projectedPaise: 3 * 250000,
    });
    // Wedding: both, 7 heads × ₹4,000.
    expect(rows.find((r) => r.key === "wedding")).toMatchObject({
      people: 7,
      projectedPaise: 7 * 400000,
    });
  });

  it("event bars sum to the same total as the projection, not to a multiple of it", () => {
    const perEvent = breakdownBy(list, PLATES, "event").reduce(
      (total, r) => total + r.projectedPaise,
      0,
    );
    expect(perEvent).toBe(summarise(list, PLATES).projectedPaise);
  });
});

describe("guestTotalsFrom", () => {
  const list = [
    h({ id: "1", side: "a", tier: "must", adultCount: 2, childCount: 1, eventIds: ["wedding"] }),
    h({
      id: "2",
      side: "b",
      tier: "should",
      adultCount: 4,
      eventIds: ["wedding"],
      accommodationNeeded: true,
      roomsNeeded: 2,
      nightsNeeded: 3,
    }),
  ];

  it("carries every tier and both sides, including the ones with nobody in them", () => {
    const totals = guestTotalsFrom(list, PLATES);
    expect(totals.byTier.must).toMatchObject({ households: 1, people: 3 });
    expect(totals.byTier.should).toMatchObject({ households: 1, people: 4 });
    expect(totals.byTier.if_space).toMatchObject({ households: 0, people: 0, projectedPaise: 0 });
    expect(totals.bySide.a.people).toBe(3);
    expect(totals.bySide.b.people).toBe(4);
  });

  it("overall matches the ladder's last rung — the number Home shows", () => {
    const totals = guestTotalsFrom(list, PLATES);
    const rows = tierLadder(list, PLATES, null);
    expect(totals.overall.people).toBe(rows[rows.length - 1].runningPeople);
    expect(totals.overall.projectedPaise).toBe(rows[rows.length - 1].runningPaise);
  });

  it("carries the room block", () => {
    expect(guestTotalsFrom(list, PLATES)).toMatchObject({ roomsNeeded: 2, nightsNeeded: 3 });
  });

  it("recomputing from the same list twice gives the same document — it cannot drift", () => {
    expect(guestTotalsFrom(list, PLATES)).toEqual(guestTotalsFrom([...list], PLATES));
  });

  it("is all zeroes, not undefined, when the last household is deleted", () => {
    const totals = guestTotalsFrom([], PLATES);
    expect(totals.overall).toMatchObject({ households: 0, people: 0, projectedPaise: 0 });
    expect(totals.byEvent).toEqual({});
  });
});

describe("nameTokens", () => {
  it("reduces the ways people write the same family name to one token", () => {
    expect(nameTokens("The Agarwals")).toEqual(["agarwal"]);
    expect(nameTokens("Agarwal family")).toEqual(["agarwal"]);
    expect(nameTokens("Mr & Mrs Agarwal")).toEqual(["agarwal"]);
  });

  it("keeps short words that are actually names", () => {
    expect(nameTokens("Raj & Anu")).toEqual(["raj", "anu"]);
  });
});

describe("duplicateMatches", () => {
  const existing = [
    h({ id: "1", name: "The Agarwals", primaryPhone: "98765 43210" }),
    h({ id: "2", name: "Sharma family", primaryPhone: "" }),
  ];

  it("flags the same family entered a second time under a different spelling", () => {
    const found = duplicateMatches({ name: "Agarwal", primaryPhone: "" }, existing);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ reason: "name" });
    expect(found[0].household.id).toBe("1");
  });

  it("flags the same phone number however it was typed", () => {
    const found = duplicateMatches({ name: "Completely Different", primaryPhone: "+91 98765-43210" }, existing);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ reason: "phone" });
  });

  it("does not flag a household against itself while editing it", () => {
    expect(duplicateMatches({ id: "1", name: "The Agarwals", primaryPhone: "98765 43210" }, existing)).toEqual(
      [],
    );
  });

  it("leaves unrelated households alone", () => {
    expect(duplicateMatches({ name: "The Guptas", primaryPhone: "99999 11111" }, existing)).toEqual(
      [],
    );
  });

  it("says nothing at all on an empty name and no phone, rather than flagging everyone", () => {
    expect(duplicateMatches({ name: "", primaryPhone: "" }, existing)).toEqual([]);
  });
});
