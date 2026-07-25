import type { Timestamp } from "firebase/firestore";
import type { Role, Side } from "./common";

/**
 * users/{uid} — created/updated on first successful sign-in from the matching
 * allowlist entry (FEATURES.md §1.1). `role` and `side` are copied from the
 * allowlist and MUST NOT be self-editable (enforced in firestore.rules).
 */
export interface User {
  email: string;
  displayName: string;
  photoURL: string | null;
  role: Role;
  side: Side;
  createdAt: Timestamp;
  lastSeenAt: Timestamp;
}
