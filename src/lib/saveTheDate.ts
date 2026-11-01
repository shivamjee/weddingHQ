// Public Save the Date (/save-the-date). Pure helpers, no Firestore.
//
// The names and date are hardcoded HERE on purpose — a deliberate exception to
// CLAUDE.md's "never hardcode a person's name, read the tenant doc" rule. This
// page is public (no sign-in), and reading `tenants/shivam-swara` would mean
// opening Firestore rules to anonymous reads. Hardcoding costs zero reads and
// exposes nothing beyond what the card itself shows.
export const WEDDING = {
  // The one tenant this card belongs to — Home links to it only there.
  tenantId: "shivam-swara",
  partnerA: "Shivam Jee",
  partnerB: "Swara Singh",
  shortNames: "Shivam & Swara",
  // Midnight IST on the wedding day — the countdown target. Time of day isn't
  // fixed yet, so the calendar entry is an all-day event.
  startsAt: new Date("2027-12-08T00:00:00+05:30"),
  dateLabel: "8 December 2027",
  weekdayLabel: "Wednesday",
  // YYYYMMDD, all-day: end is the (exclusive) next day.
  calStart: "20271208",
  calEnd: "20271209",
  details: "Save the date! Formal invitation and details to follow.",
} as const;

export type Countdown = { days: number; hours: number; minutes: number; seconds: number };

export function countdown(now: Date, target: Date = WEDDING.startsAt): Countdown {
  const total = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export function googleCalendarUrl(): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${WEDDING.shortNames} — Wedding`,
    dates: `${WEDDING.calStart}/${WEDDING.calEnd}`,
    details: WEDDING.details,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// Static file in public/ — iOS Safari opens a .ics link straight into
// "Add to Calendar"; macOS/Outlook open it in their calendar app.
export const ICS_PATH = "/save-the-date/shivam-swara.ics";

export const SAVE_THE_DATE_PATH = "/save-the-date";
