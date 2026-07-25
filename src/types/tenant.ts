import type { Timestamp } from "firebase/firestore";

/** Display metadata for one side of a wedding. The id (`"a"` / `"b"`) is fixed by
 *  the schema; only the label varies per tenant. */
export interface SideInfo {
  label: string; // "Shivam", "Swara"
}

/**
 * tenants/{tenantId} — one wedding. All of that wedding's data lives in
 * subcollections beneath this document (categories, events, settings, and from
 * Phase 2: budgets, contacts, comparisons, questions), so tenant isolation is a
 * path prefix rather than a filter every query has to remember.
 *
 * SECURITY: readable only by someone with a matching `memberships/{tenantId}__{email}`
 * doc, or a global admin. Created and deleted by admins only (firestore.rules).
 */
export interface Tenant {
  name: string; // "Shivam & Swara"
  sideA: SideInfo;
  sideB: SideInfo;
  weddingDate: Timestamp | null; // null until set — never rendered as a placeholder
  archived: boolean;
  createdBy: string; // uid
  createdAt: Timestamp;
}

/** A tenant document paired with its id, which the doc itself doesn't carry. */
export interface TenantWithId extends Tenant {
  id: string;
}
