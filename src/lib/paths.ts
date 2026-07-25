// The single place that builds Firestore references.
//
// SECURITY: tenant isolation in this app is a *path prefix* — every wedding's
// data lives under `tenants/{tenantId}/…`. A hand-written path string that drops
// or mistypes the tenant segment is exactly how one wedding's data leaks into
// another's screen, so no component should concatenate paths itself. Import from
// here instead. (firestore.rules is still the real boundary; this keeps honest
// code from making honest mistakes.)
//
// The pure id logic lives in ./tenantIds so the rules tests can import it
// without pulling in the Firebase client SDK.

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { membershipId } from "@/lib/tenantIds";

export { membershipId, slugifyTenantName } from "@/lib/tenantIds";

export const membershipsCol = (): CollectionReference => collection(db, "memberships");

export const membershipDoc = (tenantId: string, email: string): DocumentReference =>
  doc(db, "memberships", membershipId(tenantId, email));

export const usersCol = (): CollectionReference => collection(db, "users");

export const userDoc = (uid: string): DocumentReference => doc(db, "users", uid);

export const tenantsCol = (): CollectionReference => collection(db, "tenants");

export const tenantDoc = (tenantId: string): DocumentReference => doc(db, "tenants", tenantId);

// ---- tenant subcollections -------------------------------------------------
// Everything below is per-wedding. Phase 2 adds budgets / contacts / comparisons
// / questions here, following the same pattern.

export const categoriesCol = (tenantId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "categories");

export const categoryDoc = (tenantId: string, categoryId: string): DocumentReference =>
  doc(db, "tenants", tenantId, "categories", categoryId);

export const eventsCol = (tenantId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "events");

export const eventDoc = (tenantId: string, eventId: string): DocumentReference =>
  doc(db, "tenants", tenantId, "events", eventId);

export const settingsDoc = (tenantId: string, docId: string): DocumentReference =>
  doc(db, "tenants", tenantId, "settings", docId);
