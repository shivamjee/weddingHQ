// Dates at the input edge.
//
// Every date in this app is optional and often genuinely unknown — the wedding
// is more than a year out. The rule these helpers enforce is that "not decided
// yet" stays `null` all the way to Firestore, and is never quietly written as
// today's date or as an epoch zero that later renders as "1 January 1970".
//
// TIMEZONE: an <input type="date"> gives a bare "YYYY-MM-DD" with no time and no
// zone. `new Date("2027-02-14")` parses that as UTC midnight, which in Phoenix
// (UTC-7) is the evening of the 13th — so a date typed as the 14th displays as
// the 13th. We therefore build the Date from its parts in LOCAL time instead.
// This is the one subtle bug in date handling and it is silent until someone
// notices a wedding function is listed a day early.

import { Timestamp } from "firebase/firestore";

/** Firestore Timestamp → the "YYYY-MM-DD" an <input type="date"> expects.
 *  Null / missing → "" (an empty date field, not a placeholder date). */
export function dateInputValue(value: Timestamp | null | undefined): string {
  if (!value) return "";
  const d = value.toDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" from a date input → a Timestamp at local midnight, or null for
 *  an empty field. Invalid text also yields null rather than an Invalid Date,
 *  which Firestore would reject at write time with an opaque error. */
export function toTimestamp(input: string): Timestamp | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

/** Human-readable date for display, or a caller-chosen fallback when unset.
 *  Never invents a date for a null. */
export function formatDate(value: Timestamp | null | undefined, fallback = "No date yet"): string {
  if (!value) return fallback;
  return value.toDate().toLocaleDateString("en-IN", { dateStyle: "medium" });
}
