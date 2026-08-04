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
import { budgetAllocationId, budgetTotalsId, membershipId } from "@/lib/tenantIds";
import type { Side } from "@/types/common";

export {
  BUDGET_TOTALS_PREFIX,
  budgetAllocationId,
  budgetTotalsId,
  membershipId,
  slugify,
  slugifyTenantName,
  uniqueSlugId,
} from "@/lib/tenantIds";

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

// ---- budgets (Phase 2 Step 2) ----------------------------------------------
// One collection holds both shapes: per-category allocations (`a_venue`) and
// each side's overall ceiling (`_totals_a`). See src/types/budget.ts.

export const budgetsCol = (tenantId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "budgets");

/** Omit `eventId` for the category-level amount (its ceiling); pass one for an
 *  optional per-event breakdown underneath it. See budgetAllocationId(). */
export const budgetDoc = (
  tenantId: string,
  side: Side,
  categoryId: string,
  eventId?: string | null,
): DocumentReference =>
  doc(db, "tenants", tenantId, "budgets", budgetAllocationId(side, categoryId, eventId));

export const budgetTotalsDoc = (tenantId: string, side: Side): DocumentReference =>
  doc(db, "tenants", tenantId, "budgets", budgetTotalsId(side));

// ---- contacts & questions (Phase 2 Steps 3-4) ------------------------------
// Auto-ids, unlike categories/events: nothing keys off a contact's or
// question's id, and two vendors can legitimately share a name.

export const contactsCol = (tenantId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "contacts");

export const contactDoc = (tenantId: string, contactId: string): DocumentReference =>
  doc(db, "tenants", tenantId, "contacts", contactId);

export const questionsCol = (tenantId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "questions");

export const questionDoc = (tenantId: string, questionId: string): DocumentReference =>
  doc(db, "tenants", tenantId, "questions", questionId);

// ---- comparisons (Phase 2 Step 5) ------------------------------------------
// Options are a SUBCOLLECTION of their comparison, not a field on it: a table
// with a dozen venues would otherwise be one document that every edit rewrites
// in full, and two people editing different venues would clobber each other.

export const comparisonsCol = (tenantId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "comparisons");

export const comparisonDoc = (tenantId: string, comparisonId: string): DocumentReference =>
  doc(db, "tenants", tenantId, "comparisons", comparisonId);

export const optionsCol = (tenantId: string, comparisonId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "comparisons", comparisonId, "options");

export const optionDoc = (
  tenantId: string,
  comparisonId: string,
  optionId: string,
): DocumentReference =>
  doc(db, "tenants", tenantId, "comparisons", comparisonId, "options", optionId);

// ---- guest list (Phase 3) --------------------------------------------------
// Auto-ids for both, like contacts: nothing keys off a household's or a guest's
// id, and two families can legitimately be called "The Sharmas".

export const householdsCol = (tenantId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "households");

export const householdDoc = (tenantId: string, householdId: string): DocumentReference =>
  doc(db, "tenants", tenantId, "households", householdId);

/** TOP-LEVEL under the tenant, NOT nested under the household — see the comment
 *  on `Guest` in src/types/guest.ts. The link is the `householdId` field. */
export const guestsCol = (tenantId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "guests");

export const guestDoc = (tenantId: string, guestId: string): DocumentReference =>
  doc(db, "tenants", tenantId, "guests", guestId);

/** tenants/{t}/aggregates/guestTotals — the one-document rollup Home reads
 *  instead of the whole household list. See src/types/guestTotals.ts. */
export const guestTotalsDoc = (tenantId: string): DocumentReference =>
  doc(db, "tenants", tenantId, "aggregates", "guestTotals");

/** Append-only change log. Create-only in firestore.rules. */
export const guestLogCol = (tenantId: string): CollectionReference =>
  collection(db, "tenants", tenantId, "guestLog");

/** The venue capacity the tier ladder measures against. A plain `settings` doc —
 *  no new builder needed, but named here so callers don't retype the doc id. */
export const GUEST_TARGET_SETTINGS_ID = "guestTarget";

export const guestTargetDoc = (tenantId: string): DocumentReference =>
  settingsDoc(tenantId, GUEST_TARGET_SETTINGS_ID);
