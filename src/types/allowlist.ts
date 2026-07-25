import type { Timestamp } from "firebase/firestore";
import type { Role, Side } from "./common";

/**
 * allowlist/{emailLowercased} — the access gate (FEATURES.md §1.1). Document ID
 * is the invitee's lowercased email. Only role=="couple" may write it. The very
 * first entry is created by hand in the Firestore console (bootstrap, §11).
 */
export interface AllowlistEntry {
  side: Side;
  role: Role;
  addedBy: string; // uid of the couple member who added them
  addedAt: Timestamp;
}
