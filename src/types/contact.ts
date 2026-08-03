import type { Timestamp } from "firebase/firestore";

/** What kind of relationship this is. Drives the filter chips on the Contacts
 *  screen and nothing else — a contact's category is the more useful grouping. */
export type ContactType = "vendor" | "family" | "service" | "other";

export const CONTACT_TYPES: readonly ContactType[] = ["vendor", "family", "service", "other"];

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  vendor: "Vendor",
  family: "Family",
  service: "Service",
  other: "Other",
};

/**
 * tenants/{tenantId}/contacts/{contactId} — the people and businesses involved
 * in this wedding (FEATURES.md §5).
 *
 * Most of the value is on a phone: `tel:`, `mailto:` and a WhatsApp link, one
 * tap from the list. Comparison options and open questions both point at a
 * contact, which is how "the six things to ask the caterer" gets its phone
 * number attached.
 *
 * SECURITY: readable AND writable by any member of the wedding. Keeping the
 * vendor list current is collaborative work — an aunt who gets a decorator's
 * number should be able to add it without waiting for the couple.
 *
 * PRIVACY: these phone numbers and emails must never be sent to the AI route
 * handler (PHASE2 Step 5b) — free-tier prompts may be used to improve the
 * provider's models.
 */
export interface Contact {
  name: string;
  organisation: string; // "Taj Palace", "Sharma Caterers"
  role: string; // "Venue manager", "Photographer", "Pandit"
  type: ContactType;
  phone: string;
  altPhone: string;
  email: string;
  address: string;
  categoryId: string | null;
  eventIds: string[];
  notes: string;
  // No `isBooked` here on purpose (removed after Phase 2 QA): it was written and
  // shown as a pill but read by nothing, and `ComparisonOption.status` already
  // has a "booked" value — two sources of truth for one fact. Existing documents
  // keep the orphan field; nothing reads it. Whether a vendor is confirmed lives
  // on the comparison option.
  createdBy: string; // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ContactWithId extends Contact {
  id: string;
}
