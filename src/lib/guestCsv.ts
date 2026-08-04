// CSV import/export mapping for the guest list (FEATURES.md §4.6, PHASE3 Step 6).
//
// NOT a stretch goal: the list already exists in somebody's spreadsheet, or will
// the moment names are requested from parents, and typing 200 households by hand
// is how this feature dies.
//
// Pure functions, no Firebase and no Papa — the caller does the lexing with
// papaparse and the writing with a batch. That keeps the interesting part (which
// column is which, what counts as a duplicate, which rows are unusable) unit
// tested, and makes `mapRows` a genuine DRY RUN: it cannot write anything
// because it cannot reach Firestore.
//
// Everything imports as `proposed` (§4.6). A file somebody was handed is a
// suggestion, not an agreement.

import { duplicateMatches, nameTokens } from "@/lib/guests";
import {
  HOUSEHOLD_STATUSES,
  SIDES,
  TIERS,
  type Household,
  type HouseholdStatus,
  type Side,
  type Tier,
} from "@/types";

/** The household fields a spreadsheet can carry. Deliberately not every field:
 *  `createdBy`, timestamps and `status` are ours to set, and nobody's
 *  spreadsheet has an event id in it. */
export type CsvField =
  | "name"
  | "side"
  | "tier"
  | "adultCount"
  | "childCount"
  | "relationship"
  | "primaryPhone"
  | "address"
  | "notes"
  | "travelNeeded"
  | "accommodationNeeded"
  | "roomsNeeded"
  | "nightsNeeded";

export const CSV_FIELDS: readonly { field: CsvField; label: string; required?: boolean }[] = [
  { field: "name", label: "Name", required: true },
  { field: "side", label: "Side" },
  { field: "tier", label: "Tier" },
  { field: "adultCount", label: "Adults" },
  { field: "childCount", label: "Children" },
  { field: "relationship", label: "Relationship" },
  { field: "primaryPhone", label: "Phone" },
  { field: "address", label: "Address" },
  { field: "notes", label: "Notes" },
  { field: "travelNeeded", label: "Travel needed" },
  { field: "accommodationNeeded", label: "Accommodation" },
  { field: "roomsNeeded", label: "Rooms" },
  { field: "nightsNeeded", label: "Nights" },
];

/** header (lowercased, punctuation stripped) → field. Only the spellings people
 *  actually use; an unrecognised header is left for the mapping UI. */
const HEADER_HINTS: Record<string, CsvField> = {
  name: "name",
  household: "name",
  householdname: "name",
  family: "name",
  guest: "name",
  side: "side",
  whoseside: "side",
  tier: "tier",
  priority: "tier",
  adults: "adultCount",
  adult: "adultCount",
  adultcount: "adultCount",
  children: "childCount",
  child: "childCount",
  kids: "childCount",
  childcount: "childCount",
  relationship: "relationship",
  relation: "relationship",
  how: "relationship",
  phone: "primaryPhone",
  mobile: "primaryPhone",
  number: "primaryPhone",
  contact: "primaryPhone",
  address: "address",
  notes: "notes",
  note: "notes",
  comment: "notes",
  travel: "travelNeeded",
  travelneeded: "travelNeeded",
  accommodation: "accommodationNeeded",
  accommodationneeded: "accommodationNeeded",
  hotel: "accommodationNeeded",
  stay: "accommodationNeeded",
  rooms: "roomsNeeded",
  room: "roomsNeeded",
  nights: "nightsNeeded",
  night: "nightsNeeded",
};

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z]/g, "");
}

/** column index → field, guessed from the header row so the mapping UI opens
 *  mostly filled in. A guess is only ever a default — the user can change every
 *  one of them before anything is written. */
export function guessMapping(headers: readonly string[]): (CsvField | null)[] {
  const used = new Set<CsvField>();
  return headers.map((header) => {
    const guess = HEADER_HINTS[normaliseHeader(header)];
    if (!guess || used.has(guess)) return null;
    used.add(guess);
    return guess;
  });
}

function parseCount(value: string): number {
  const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const TRUTHY = new Set(["yes", "y", "true", "1", "needed", "required"]);

function parseBool(value: string): boolean {
  return TRUTHY.has(value.trim().toLowerCase());
}

/** Match a side by its id OR by the tenant's own label, because a spreadsheet
 *  will say "Shivam", not "a". */
function parseSide(value: string, labels: Record<Side, string>): Side | null {
  const clean = value.trim().toLowerCase();
  if (!clean) return null;
  const byId = SIDES.find((s) => s === clean);
  if (byId) return byId;
  return SIDES.find((s) => labels[s].trim().toLowerCase() === clean) ?? null;
}

function parseTier(value: string): Tier | null {
  const clean = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!clean) return null;
  if (TIERS.includes(clean as Tier)) return clean as Tier;
  // The shorthands people actually type in a spreadsheet column called "Tier".
  if (clean === "a" || clean === "1" || clean === "definite") return "must";
  if (clean === "b" || clean === "2" || clean === "maybe") return "should";
  if (clean === "c" || clean === "3" || clean === "ifspace") return "if_space";
  return null;
}

/** A household as it will be written, minus the fields the caller stamps. */
export type ImportDraft = Omit<Household, "createdBy" | "createdAt" | "updatedAt">;

export interface ImportRow {
  /** 1-based row number in the file, including the header, so an error message
   *  points at a line the user can actually find in their spreadsheet. */
  line: number;
  draft: ImportDraft;
  /** Why this row cannot be imported. Non-empty means it is skipped. */
  problems: string[];
  /** Worth saying, but not a reason to skip the row. */
  warnings: string[];
  /** Existing household names this row looks like a repeat of. Warning only —
   *  the user decides. */
  duplicateOf: string[];
  /** Another row in the SAME file with the same name. */
  duplicateInFile: boolean;
}

export interface ImportPreview {
  rows: ImportRow[];
  readyCount: number;
  skippedCount: number;
  duplicateCount: number;
  totalPeople: number;
}

/**
 * The dry run (§4.6): map every row, flag what cannot be imported and what looks
 * like a repeat, and report the totals — all before a single write. Nothing here
 * touches Firestore, which is what makes "preview" honest rather than a promise.
 *
 * Defaults: `tier: "should"` and `status: "proposed"`. A spreadsheet that
 * doesn't say means nobody has decided, and both of those are the
 * decide-it-later value.
 */
export function mapRows(
  rows: readonly string[][],
  mapping: readonly (CsvField | null)[],
  context: {
    existing: readonly { id: string; name: string; primaryPhone: string }[];
    sideLabels: Record<Side, string>;
    /** Applied to every imported household — the events they're invited to are a
     *  bulk decision made in the wizard, not a spreadsheet column. */
    eventIds: string[];
    defaultSide: Side;
    invitedBy: string;
  },
): ImportPreview {
  const column = (row: readonly string[], field: CsvField): string => {
    const index = mapping.indexOf(field);
    return index >= 0 ? (row[index] ?? "").trim() : "";
  };

  const seenTokens = new Map<string, number>();
  const out: ImportRow[] = [];

  rows.forEach((row, index) => {
    const line = index + 2; // +1 for zero-indexing, +1 for the header row
    const name = column(row, "name");
    // Only a missing name makes a row unimportable. Everything else is a
    // warning: a spreadsheet somebody was handed is allowed to be incomplete.
    const problems: string[] = [];
    const warnings: string[] = [];
    if (!name) problems.push("No name");

    const side = parseSide(column(row, "side"), context.sideLabels) ?? context.defaultSide;
    const tier = parseTier(column(row, "tier")) ?? "should";
    const accommodationNeeded = parseBool(column(row, "accommodationNeeded"));
    const rooms = parseCount(column(row, "roomsNeeded"));
    const nights = parseCount(column(row, "nightsNeeded"));

    const draft: ImportDraft = {
      name,
      side,
      tier,
      status: "proposed",
      invitedBy: context.invitedBy,
      relationship: column(row, "relationship"),
      eventIds: [...context.eventIds],
      adultCount: parseCount(column(row, "adultCount")),
      childCount: parseCount(column(row, "childCount")),
      travelNeeded: parseBool(column(row, "travelNeeded")),
      accommodationNeeded,
      roomsNeeded: accommodationNeeded && rooms > 0 ? rooms : null,
      nightsNeeded: accommodationNeeded && nights > 0 ? nights : null,
      address: column(row, "address"),
      primaryPhone: column(row, "primaryPhone"),
      notes: column(row, "notes"),
    };

    // A row with a name but no heads is importable — somebody will fill the
    // count in later — but it is worth saying so, because it counts as zero
    // people in every projection until they do.
    if (name && draft.adultCount + draft.childCount === 0) {
      warnings.push("No head count — counts as 0 people");
    }

    const key = nameTokens(name).join(" ");
    const firstSeenAt = key ? seenTokens.get(key) : undefined;
    if (key && firstSeenAt === undefined) seenTokens.set(key, line);

    out.push({
      line,
      draft,
      problems,
      warnings,
      duplicateOf: name
        ? duplicateMatches({ name, primaryPhone: draft.primaryPhone }, context.existing).map(
            (m) => m.household.name,
          )
        : [],
      duplicateInFile: firstSeenAt !== undefined,
    });
  });

  const ready = out.filter((r) => r.problems.length === 0);
  return {
    rows: out,
    readyCount: ready.length,
    skippedCount: out.length - ready.length,
    duplicateCount: ready.filter((r) => r.duplicateOf.length > 0 || r.duplicateInFile).length,
    totalPeople: ready.reduce((t, r) => t + r.draft.adultCount + r.draft.childCount, 0),
  };
}

/** Rows for Papa.unparse — a flat sheet a vendor or a hotel can open. One row
 *  per household; event names are joined rather than exploded, because a caterer
 *  wants one line per invitation. */
export function householdsToCsvRows(
  households: readonly (Omit<Household, "createdBy" | "createdAt" | "updatedAt"> & {
    id?: string;
  })[],
  context: { sideLabels: Record<Side, string>; eventName: (id: string) => string },
): Record<string, string | number>[] {
  return households.map((h) => ({
    Name: h.name,
    Side: context.sideLabels[h.side],
    Tier: h.tier,
    Status: h.status,
    Adults: h.adultCount,
    Children: h.childCount,
    People: h.adultCount + h.childCount,
    Events: h.eventIds.map(context.eventName).filter(Boolean).join("; "),
    Relationship: h.relationship,
    Phone: h.primaryPhone,
    Address: h.address,
    "Travel needed": h.travelNeeded ? "Yes" : "No",
    Accommodation: h.accommodationNeeded ? "Yes" : "No",
    Rooms: h.roomsNeeded ?? "",
    Nights: h.nightsNeeded ?? "",
    Notes: h.notes,
  }));
}

/** One row per NAMED guest, for the caterer's dietary sheet and the seating
 *  chart Phase 6 will want. Households with no names contribute nothing here,
 *  which is why the household export above is the primary one. */
export function guestsToCsvRows(
  guests: readonly { name: string; ageGroup: string; dietary: string; householdId: string }[],
  householdName: (id: string) => string,
): Record<string, string>[] {
  return guests.map((g) => ({
    Name: g.name,
    Household: householdName(g.householdId),
    Age: g.ageGroup,
    Dietary: g.dietary,
  }));
}

/** Guard for the status column on import, kept beside the other parsers even
 *  though import always forces `proposed` — so a future "import as confirmed"
 *  has one obvious place to read from. */
export function parseStatus(value: string): HouseholdStatus | null {
  const clean = value.trim().toLowerCase();
  return HOUSEHOLD_STATUSES.find((s) => s === clean) ?? null;
}
