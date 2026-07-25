import type { Timestamp } from "firebase/firestore";

/**
 * users/{uid} — GLOBAL identity, created/updated on every sign-in. It holds no
 * wedding data: role and side are per-tenant and live on `memberships` instead.
 *
 * SECURITY: `isAdmin` grants read/write across *every* tenant and must not be
 * self-editable — firestore.rules freezes it, and the first admin is set by hand
 * in the Firestore console (see the bootstrap steps in CLAUDE.md).
 */
export interface User {
  email: string;
  displayName: string;
  photoURL: string | null;
  isAdmin: boolean;
  createdAt: Timestamp;
  lastSeenAt: Timestamp;
}
