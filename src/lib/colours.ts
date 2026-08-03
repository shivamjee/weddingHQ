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

/** Emoji offered for a category or an event, alongside its colour. An icon is
 *  quicker to recognise in a list than a coloured dot once there are eight of
 *  them — but it does NOT replace the colour, because the charts need a fill and
 *  an emoji cannot provide one.
 *
 *  A fixed set rather than a free text field: on a phone the emoji keyboard is
 *  fine, but on desktop a text input invites someone to type "X", and nothing
 *  downstream is prepared to render an arbitrary string in a 10px slot. */
export const WEDDING_ICONS = [
  "💒", "🍽️", "🌸", "📸", "🎵", "💄", "🚗", "🎁",
  "💍", "🏨", "🪔", "✨", "🎂", "👗", "📿", "💐",
] as const;

/** Suggested starting categories (FEATURES.md §1.2). Offered as one tap on an
 *  empty Setup screen; every one of them is editable and deletable afterwards. */
export const DEFAULT_CATEGORIES: readonly { name: string; colour: string; icon: string }[] = [
  { name: "Venue", colour: PALETTE[7], icon: "💒" },
  { name: "Food", colour: PALETTE[1], icon: "🍽️" },
  { name: "Decor", colour: PALETTE[10], icon: "🌸" },
  { name: "Attire", colour: PALETTE[9], icon: "👗" },
  { name: "Jewellery", colour: PALETTE[2], icon: "💍" },
  { name: "Photography", colour: PALETTE[6], icon: "📸" },
  { name: "Transport", colour: PALETTE[5], icon: "🚗" },
  { name: "Accommodation", colour: PALETTE[4], icon: "🏨" },
];

/** Suggested starting events. Dates are deliberately null — the wedding is more
 *  than a year out and a placeholder date would be mistaken for a real one. */
export const DEFAULT_EVENTS: readonly { name: string; colour: string; icon: string }[] = [
  { name: "Mehendi", colour: PALETTE[4], icon: "🪔" },
  { name: "Sangeet", colour: PALETTE[9], icon: "🎵" },
  { name: "Wedding", colour: PALETTE[0], icon: "💐" },
  { name: "Reception", colour: PALETTE[7], icon: "🎂" },
];
