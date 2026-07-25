// Money helpers.
//
// HARD RULE (CLAUDE.md / FEATURES.md §1.3): all money is an integer number of
// PAISE. Never a float. ₹13,00,000 is 130000000 paise. Rupee floats produce
// settlements that don't balance by a few paise, which is miserable to debug.
// Format to rupees only at the render edge, never store or compute in rupees.
//
// The `Paise` brand below makes a bare `number` awkward to pass where paise are
// expected, so the "is this rupees or paise?" mistake is caught at compile time.

/**
 * A branded integer count of paise (1 rupee = 100 paise).
 * You cannot assign a raw `number` to a `Paise` — go through `toPaise()` /
 * `rupeesToPaise()`. This is a compile-time-only tag; at runtime it is a number.
 */
export type Paise = number & { readonly __brand: "Paise" };

/** Brand an integer number of paise. Throws on non-integer input (a float here
 *  almost always means someone passed rupees or did rupee arithmetic). */
export function toPaise(n: number): Paise {
  if (!Number.isInteger(n)) {
    throw new Error(`Paise must be an integer; got ${n}. Money must never be a float.`);
  }
  return n as Paise;
}

/** Convert a rupee amount to branded paise, rounding to the nearest paisa. */
export function rupeesToPaise(rupees: number): Paise {
  return toPaise(Math.round(rupees * 100));
}

/**
 * Format paise as INR with Indian digit grouping, e.g. 130000000 → "₹13,00,000".
 *
 * SUBTLE: Indian grouping is ##,##,### (3 digits, then 2s) — NOT the Western
 * ###,### thousands grouping. Getting it wrong survives eyeballing on small
 * numbers and only shows up at lakh/crore scale, so this is unit-tested.
 * We format the whole-rupee part and the paise part separately from integers to
 * avoid any floating-point error from a `paise / 100` division.
 */
export function formatINR(paise: Paise): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const paisePart = abs % 100;

  // `en-IN` gives native Indian grouping; rupees is an integer so this is exact.
  const grouped = new Intl.NumberFormat("en-IN").format(rupees);
  const body = paisePart === 0 ? grouped : `${grouped}.${String(paisePart).padStart(2, "0")}`;

  return `${negative ? "-" : ""}₹${body}`;
}

/**
 * Compact Indian form for charts and dense summaries, e.g. 130000000 → "13L",
 * 120000000000 → "1.2Cr". Lakh = 1e5 rupees, Crore = 1e7 rupees. Up to one
 * decimal place, trailing ".0" trimmed. No currency symbol (per PHASE1 spec).
 */
export function formatCompact(paise: Paise): string {
  const negative = paise < 0;
  const rupees = Math.abs(paise) / 100;
  const sign = negative ? "-" : "";

  const trim = (value: number) => value.toFixed(1).replace(/\.0$/, "");

  if (rupees >= 1e7) return `${sign}${trim(rupees / 1e7)}Cr`;
  if (rupees >= 1e5) return `${sign}${trim(rupees / 1e5)}L`;
  if (rupees >= 1e3) return `${sign}${trim(rupees / 1e3)}K`;
  // Below ₹1,000 the exact rupee figure is short enough to show in full.
  return `${sign}₹${Math.round(rupees)}`;
}

/** Currencies the app can display INR amounts in (FEATURES.md §1.4). */
export type DisplayCurrency = "INR" | "USD" | "EUR" | "GBP" | "AED";

/**
 * Convert paise to a display currency and format it, using a `rate` expressed
 * as "units of the target currency per 1 INR" (matching settings/currency.rates
 * in FEATURES.md §1.4). Conversion is display-time only — we never store the
 * converted value or snapshot a rate per record.
 */
export function convert(paise: Paise, rate: number, currency: DisplayCurrency = "USD"): string {
  if (currency === "INR") return formatINR(paise);
  const rupees = paise / 100;
  const converted = rupees * rate;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(converted);
}
