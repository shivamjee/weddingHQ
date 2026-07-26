// The app-wide chart palette and the one-tap starter sets for a new wedding.
//
// WHY A FIXED PALETTE: a category's colour is chosen once in Setup and then
// reused by every chart in the app (allocation health, side-by-side comparison,
// and later the per-category and per-event breakdowns). If people could pick any
// hex value, two categories would end up near-identical and the side-by-side
// chart — the whole point of Phase 2's budget screen — would stop being readable.
// Twelve fixed swatches keep them distinguishable and keep the picker to one tap.
//
// Chosen to sit on white with white text on top, at roughly equal visual weight,
// and to stay distinct for the most common colour-vision deficiencies (no
// red/green pair carrying meaning on its own).

export const PALETTE = [
  "#e11d48", // rose
  "#f97316", // orange
  "#f59e0b", // amber
  "#84cc16", // lime
  "#10b981", // emerald
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
  "#78716c", // stone
] as const;

export type PaletteColour = (typeof PALETTE)[number];

/** Fallback for a record whose colour is missing or was hand-typed in the
 *  Firestore console. Never render `undefined` into a chart fill. */
export const FALLBACK_COLOUR = "#78716c";

/** Pick the next unused palette colour, so adding six categories in a row does
 *  not produce six rose-coloured bars. Wraps once the palette is exhausted. */
export function nextColour(used: readonly string[]): string {
  const free = PALETTE.find((c) => !used.includes(c));
  return free ?? PALETTE[used.length % PALETTE.length];
}

/** Suggested starting categories (FEATURES.md §1.2). Offered as one tap on an
 *  empty Setup screen; every one of them is editable and deletable afterwards. */
export const DEFAULT_CATEGORIES: readonly { name: string; colour: string }[] = [
  { name: "Venue", colour: PALETTE[7] },
  { name: "Food", colour: PALETTE[1] },
  { name: "Decor", colour: PALETTE[10] },
  { name: "Attire", colour: PALETTE[9] },
  { name: "Jewellery", colour: PALETTE[2] },
  { name: "Photography", colour: PALETTE[6] },
  { name: "Transport", colour: PALETTE[5] },
  { name: "Accommodation", colour: PALETTE[4] },
];

/** Suggested starting events. Dates are deliberately null — the wedding is more
 *  than a year out and a placeholder date would be mistaken for a real one. */
export const DEFAULT_EVENTS: readonly { name: string; colour: string }[] = [
  { name: "Mehendi", colour: PALETTE[4] },
  { name: "Sangeet", colour: PALETTE[9] },
  { name: "Wedding", colour: PALETTE[0] },
  { name: "Reception", colour: PALETTE[7] },
];
