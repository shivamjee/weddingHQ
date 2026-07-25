import type { Timestamp } from "firebase/firestore";
import type { Role, Side } from "./common";

/**
 * memberships/{tenantId}__{emailLowercased} — the access gate, replacing Phase 1's
 * `allowlist` collection. One document is both the *invitation* and the
 * *membership*: the couple (or an admin) writes it fully formed, and the invitee
 * never writes their own role or side. That removes the self-elevation problem
 * entirely rather than defending against it in rules.
 *
 * Keyed by email (not uid) because invitations are sent before the person has
 * ever signed in. Top-level (not a tenant subcollection) so "which weddings am I
 * in?" is one indexed `where("email","==",…)` query at sign-in.
 *
 * SECURITY: writable only by a `role: "couple"` member of the same tenant, or a
 * global admin. The member themselves may update *only* `uid` / `lastSeenAt`.
 */
export interface Membership {
  tenantId: string;
  email: string; // lowercased; must match the id's suffix (enforced in rules)
  role: Role;
  side: Side;
  displayName: string | null; // set by the inviter; shown before their first sign-in
  invitedBy: string; // uid
  invitedAt: Timestamp;
  uid: string | null; // stamped on that person's first sign-in
  lastSeenAt: Timestamp | null;
}

/** A membership document paired with its id. */
export interface MembershipWithId extends Membership {
  id: string;
}
