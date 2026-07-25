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

/** Slugify a wedding name into a readable, URL-safe tenant id ("Shivam & Swara"
 *  → "shivam-swara"). Ids appear in every app URL, so they should stay legible.
 *  Must not contain "/" or the membership id above could be pushed onto a
 *  different Firestore path. */
export function slugifyTenantName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents left by NFKD
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
