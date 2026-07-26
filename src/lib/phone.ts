// Turning a phone number as somebody typed it into links that actually work.
//
// This is most of why Contacts exists on a phone (FEATURES.md §5): tap to dial,
// tap to WhatsApp. The failure mode is silent — a wa.me link built from a badly
// normalised number opens WhatsApp on "invalid number" rather than erroring, so
// it is easy to ship broken and never notice. Hence the unit tests.
//
// DEFAULT COUNTRY: India (+91). Numbers will be entered in every format a
// family uses — "98765 43210", "098765 43210", "+91 98765-43210" — and all of
// them mean the same person.

const INDIA_CC = "91";

/** Digits only, with a leading "+" preserved as a marker that the country code
 *  is already present. */
function digits(input: string): { value: string; explicitPlus: boolean } {
  const trimmed = input.trim();
  return {
    value: trimmed.replace(/\D/g, ""),
    explicitPlus: trimmed.startsWith("+") || trimmed.startsWith("00"),
  };
}

/**
 * A number in full international form WITHOUT the "+" — what wa.me expects.
 * Returns null when there aren't enough digits to be a real number, so callers
 * hide the link rather than render one that goes nowhere.
 */
export function toInternational(phone: string): string | null {
  const { value, explicitPlus } = digits(phone);
  if (value.length < 7) return null;

  // "00" is the other way of writing "+" — strip it before anything else, or
  // 0091… would be read as a local number starting with a trunk zero.
  const withoutIddPrefix = explicitPlus && value.startsWith("00") ? value.slice(2) : value;

  // Already carries a country code.
  if (explicitPlus) return withoutIddPrefix;
  if (withoutIddPrefix.length === 12 && withoutIddPrefix.startsWith(INDIA_CC)) {
    return withoutIddPrefix;
  }

  // Indian trunk prefix: 0 98765 43210 → 91 98765 43210.
  if (withoutIddPrefix.length === 11 && withoutIddPrefix.startsWith("0")) {
    return `${INDIA_CC}${withoutIddPrefix.slice(1)}`;
  }
  // A bare local mobile number.
  if (withoutIddPrefix.length === 10) return `${INDIA_CC}${withoutIddPrefix}`;

  // Anything else (a landline with an STD code, an unusual length) is passed
  // through as typed. Guessing a country code onto it would be worse than
  // dialling exactly what someone wrote down.
  return withoutIddPrefix;
}

/** `tel:` link, or null when there is nothing dialable. */
export function telHref(phone: string): string | null {
  const intl = toInternational(phone);
  return intl ? `tel:+${intl}` : null;
}

/** WhatsApp deep link (FEATURES.md §5 — realistically where most vendor contact
 *  happens). wa.me takes digits only, no "+", no spaces. */
export function whatsappHref(phone: string): string | null {
  const intl = toInternational(phone);
  return intl ? `https://wa.me/${intl}` : null;
}

/** `mailto:` link, or null when the address obviously isn't one. */
export function mailtoHref(email: string): string | null {
  const clean = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? `mailto:${clean}` : null;
}

/** Readable grouping for display: 9876543210 → "98765 43210". Leaves anything
 *  that isn't a 10-digit local number exactly as typed. */
export function formatPhone(phone: string): string {
  const trimmed = phone.trim();
  const value = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+") && value.length === 10) {
    return `${value.slice(0, 5)} ${value.slice(5)}`;
  }
  return trimmed;
}
