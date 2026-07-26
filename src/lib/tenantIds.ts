// Pure id logic for tenants and memberships. NO Firebase imports — this module
// is deliberately dependency-free so firestore.rules tests can import the real
// membershipId() and prove the app and the rules agree on the scheme, without
// dragging the client SDK into an emulator test.

/** Separator in a membership document id. Two underscores, because an email
 *  local-part may legally contain a single one. */
const MEMBERSHIP_SEP = "__";

/**
 * memberships/{tenantId}__{emailLowercased} — deterministic, so inviting the
 * same person twice overwrites rather than duplicating.
 *
 * SECURITY: firestore.rules rebuilds this exact string to find the caller's
 * membership (`tenantId + "__" + request.auth.token.email.lower()`). If the two
 * ever disagree, every access check silently fails. tests/rules import this
 * function rather than reimplementing it, so drift breaks the build.
 */
export function membershipId(tenantId: string, email: string): string {
  return `${tenantId}${MEMBERSHIP_SEP}${email.trim().toLowerCase()}`;
}

/**
 * Turn a human name into a readable, URL- and path-safe id ("Shivam & Swara" →
 * "shivam-swara", "Per-plate Food" → "per-plate-food").
 *
 * Must never contain "/" — a slash would push the resulting document onto a
 * different Firestore path than the one intended, which for a tenant id would
 * also mis-target the membership lookup in firestore.rules.
 *
 * Returns "" for a name with no ASCII-representable characters at all (a purely
 * Devanagari category name, say); callers must handle that rather than writing
 * a document with an empty id.
 */
export function slugify(name: string, maxLength = 40): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents left by NFKD
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

/** Slugify a wedding name into a tenant id. Ids appear in every app URL, so
 *  they should stay legible. */
export function slugifyTenantName(name: string): string {
  return slugify(name, 40);
}

/**
 * A slug id that doesn't collide with ids already in use, by appending -2, -3…
 *
 * `existing` is the ids we already hold in memory (the ConfigProvider keeps the
 * whole, limit()-bounded category and event lists), so uniqueness costs zero
 * extra Firestore reads. Falls back to a random suffix when the name slugifies
 * to nothing — an empty document id is not writable.
 */
export function uniqueSlugId(name: string, existing: readonly string[], maxLength = 40): string {
  const base = slugify(name, maxLength) || `item-${Math.random().toString(36).slice(2, 8)}`;
  if (!existing.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
