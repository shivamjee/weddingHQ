import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import {
  CSV_FIELDS,
  guessMapping,
  guestsToCsvRows,
  householdsToCsvRows,
  mapRows,
  parseStatus,
  type CsvField,
} from "./guestCsv";
import type { Side } from "@/types";

const SIDE_LABELS: Record<Side, string> = { a: "Shivam", b: "Swara" };

const context = {
  existing: [] as { id: string; name: string; primaryPhone: string }[],
  sideLabels: SIDE_LABELS,
  eventIds: ["wedding"],
  defaultSide: "a" as Side,
  invitedBy: "uid_mom",
};

describe("guessMapping", () => {
  it("recognises the headers people actually write", () => {
    expect(guessMapping(["Household Name", "Side", "Adults", "Kids", "Phone"])).toEqual([
      "name",
      "side",
      "adultCount",
      "childCount",
      "primaryPhone",
    ]);
  });

  it("leaves a column it doesn't recognise for the user to map", () => {
    expect(guessMapping(["Name", "Sangeet?"])).toEqual(["name", null]);
  });

  it("never maps two columns to the same field", () => {
    // "Name" and "Family" both hint at `name`; only the first wins, or the
    // second silently overwrites the first on import.
    expect(guessMapping(["Name", "Family"])).toEqual(["name", null]);
  });

  it("covers every mappable field with at least one hint", () => {
    const headers = CSV_FIELDS.map((f) => f.label);
    const guessed = guessMapping(headers).filter(Boolean) as CsvField[];
    expect(new Set(guessed)).toEqual(new Set(CSV_FIELDS.map((f) => f.field)));
  });
});

describe("mapRows — the dry run", () => {
  const mapping: (CsvField | null)[] = ["name", "side", "tier", "adultCount", "childCount"];

  it("maps a clean file and totals the people it would add", () => {
    const preview = mapRows(
      [
        ["The Agarwals", "Shivam", "Must", "2", "2"],
        ["The Guptas", "Swara", "should", "4", "0"],
      ],
      mapping,
      context,
    );
    expect(preview).toMatchObject({ readyCount: 2, skippedCount: 0, totalPeople: 8 });
    expect(preview.rows[0].draft).toMatchObject({
      name: "The Agarwals",
      side: "a",
      tier: "must",
      adultCount: 2,
      childCount: 2,
    });
    expect(preview.rows[1].draft.side).toBe("b");
  });

  it("imports everything as proposed, whatever the file says", () => {
    // A list somebody was handed is a suggestion, not an agreement (§4.6).
    const preview = mapRows([["The Agarwals", "Shivam", "must", "2", "0"]], mapping, context);
    expect(preview.rows[0].draft.status).toBe("proposed");
  });

  it("skips a row with no name and keeps the line number the user can find", () => {
    const preview = mapRows(
      [
        ["The Agarwals", "Shivam", "must", "2", "0"],
        ["", "Swara", "must", "4", "0"],
      ],
      mapping,
      context,
    );
    expect(preview).toMatchObject({ readyCount: 1, skippedCount: 1 });
    // Row 3 of the file: header is line 1, first data row is line 2.
    expect(preview.rows[1]).toMatchObject({ line: 3, problems: ["No name"] });
  });

  it("warns about a missing head count without refusing the row", () => {
    const preview = mapRows([["The Agarwals", "", "", "", ""]], mapping, context);
    expect(preview.readyCount).toBe(1);
    expect(preview.rows[0].warnings[0]).toMatch(/head count/i);
    expect(preview.rows[0].draft.adultCount).toBe(0);
  });

  it("defaults an unrecognised or missing tier to 'should', not to 'must'", () => {
    const preview = mapRows(
      [
        ["A", "", "", "1", "0"],
        ["B", "", "banana", "1", "0"],
        ["C", "", "C", "1", "0"],
      ],
      mapping,
      context,
    );
    expect(preview.rows.map((r) => r.draft.tier)).toEqual(["should", "should", "if_space"]);
  });

  it("reads a side by the tenant's own label, because no spreadsheet says 'a'", () => {
    const preview = mapRows([["A", "swara", "must", "1", "0"]], mapping, context);
    expect(preview.rows[0].draft.side).toBe("b");
  });

  it("falls back to the default side when the column is missing or unknown", () => {
    const preview = mapRows(
      [
        ["A", "", "must", "1", "0"],
        ["B", "Cousin Bob", "must", "1", "0"],
      ],
      mapping,
      { ...context, defaultSide: "b" },
    );
    expect(preview.rows.map((r) => r.draft.side)).toEqual(["b", "b"]);
  });

  it("flags a row that duplicates an existing household", () => {
    const preview = mapRows([["Agarwal", "", "must", "2", "0"]], mapping, {
      ...context,
      existing: [{ id: "hh1", name: "The Agarwals", primaryPhone: "" }],
    });
    expect(preview.duplicateCount).toBe(1);
    expect(preview.rows[0].duplicateOf).toEqual(["The Agarwals"]);
  });

  it("flags the same family appearing twice within the file itself", () => {
    const preview = mapRows(
      [
        ["The Agarwals", "", "must", "2", "0"],
        ["Agarwal family", "", "must", "2", "0"],
      ],
      mapping,
      context,
    );
    expect(preview.rows[0].duplicateInFile).toBe(false);
    expect(preview.rows[1].duplicateInFile).toBe(true);
    expect(preview.duplicateCount).toBe(1);
  });

  it("puts every imported household in the events chosen in the wizard", () => {
    const preview = mapRows([["A", "", "must", "2", "0"]], mapping, {
      ...context,
      eventIds: ["sangeet", "wedding"],
    });
    expect(preview.rows[0].draft.eventIds).toEqual(["sangeet", "wedding"]);
  });

  it("only records rooms and nights when accommodation is actually ticked", () => {
    const withRooms: (CsvField | null)[] = [
      "name",
      "accommodationNeeded",
      "roomsNeeded",
      "nightsNeeded",
    ];
    const preview = mapRows(
      [
        ["A", "yes", "2", "3"],
        ["B", "no", "9", "9"],
      ],
      withRooms,
      context,
    );
    expect(preview.rows[0].draft).toMatchObject({ roomsNeeded: 2, nightsNeeded: 3 });
    expect(preview.rows[1].draft).toMatchObject({
      accommodationNeeded: false,
      roomsNeeded: null,
      nightsNeeded: null,
    });
  });

  it("survives a short row — a trailing empty column is missing, not undefined", () => {
    const preview = mapRows([["The Agarwals"]], mapping, context);
    expect(preview.readyCount).toBe(1);
    expect(preview.rows[0].draft.relationship).toBe("");
  });
});

describe("round trip through papaparse", () => {
  it("survives a comma inside a quoted name — the reason we don't split on commas", () => {
    const csv = 'Name,Adults\n"Agarwal, Jr.",3\n';
    const parsed = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: true });
    const [headers, ...rows] = parsed.data;
    const preview = mapRows(rows, guessMapping(headers), context);
    expect(preview.rows[0].draft.name).toBe("Agarwal, Jr.");
    expect(preview.rows[0].draft.adultCount).toBe(3);
  });

  it("survives an escaped quote and a CRLF file", () => {
    const csv = 'Name,Adults\r\n"The ""Big"" Agarwals",2\r\n';
    const parsed = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: true });
    const [headers, ...rows] = parsed.data;
    const preview = mapRows(rows, guessMapping(headers), context);
    expect(preview.rows[0].draft.name).toBe('The "Big" Agarwals');
  });

  it("exports and re-imports the same household without losing it", () => {
    const original = {
      name: "Agarwal, Jr.",
      side: "b" as Side,
      tier: "must" as const,
      status: "confirmed" as const,
      invitedBy: "uid_mom",
      relationship: "Paternal cousins",
      eventIds: ["wedding"],
      adultCount: 3,
      childCount: 1,
      travelNeeded: true,
      accommodationNeeded: true,
      roomsNeeded: 2,
      nightsNeeded: 3,
      address: "12 Main St, Jaipur",
      primaryPhone: "98765 43210",
      notes: 'Said "maybe"',
    };
    const csv = Papa.unparse(
      householdsToCsvRows([original], {
        sideLabels: SIDE_LABELS,
        eventName: () => "Wedding",
      }),
    );
    const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: true });
    const [headers, ...rows] = parsed.data;
    const preview = mapRows(rows, guessMapping(headers), context);

    expect(preview.rows[0].draft).toMatchObject({
      name: "Agarwal, Jr.",
      side: "b",
      tier: "must",
      adultCount: 3,
      childCount: 1,
      relationship: "Paternal cousins",
      primaryPhone: "98765 43210",
      address: "12 Main St, Jaipur",
      notes: 'Said "maybe"',
      travelNeeded: true,
      accommodationNeeded: true,
      roomsNeeded: 2,
      nightsNeeded: 3,
    });
    // Re-imported rows come back as proposed even though the file said
    // confirmed — see the "imports everything as proposed" test.
    expect(preview.rows[0].draft.status).toBe("proposed");
  });
});

describe("export rows", () => {
  it("names the side by its label, not its id, and joins the events", () => {
    const rows = householdsToCsvRows(
      [
        {
          name: "The Agarwals",
          side: "a",
          tier: "must",
          status: "confirmed",
          invitedBy: "",
          relationship: "",
          eventIds: ["sangeet", "wedding"],
          adultCount: 2,
          childCount: 2,
          travelNeeded: false,
          accommodationNeeded: false,
          roomsNeeded: null,
          nightsNeeded: null,
          address: "",
          primaryPhone: "",
          notes: "",
        },
      ],
      {
        sideLabels: SIDE_LABELS,
        eventName: (id) => (id === "sangeet" ? "Sangeet" : "Wedding"),
      },
    );
    expect(rows[0]).toMatchObject({
      Side: "Shivam",
      Events: "Sangeet; Wedding",
      People: 4,
      Rooms: "",
    });
  });

  it("gives the caterer one row per named guest", () => {
    const rows = guestsToCsvRows(
      [{ name: "Rohit", ageGroup: "adult", dietary: "Veg", householdId: "hh1" }],
      () => "The Agarwals",
    );
    expect(rows[0]).toEqual({
      Name: "Rohit",
      Household: "The Agarwals",
      Age: "adult",
      Dietary: "Veg",
    });
  });
});

describe("parseStatus", () => {
  it("accepts the two real values and nothing else", () => {
    expect(parseStatus("Confirmed")).toBe("confirmed");
    expect(parseStatus("proposed")).toBe("proposed");
    expect(parseStatus("probably")).toBeNull();
  });
});
