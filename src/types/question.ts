import type { Timestamp } from "firebase/firestore";

export type QuestionStatus = "open" | "asked" | "answered" | "moot";

export const QUESTION_STATUSES: readonly QuestionStatus[] = ["open", "asked", "answered", "moot"];

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  open: "Open",
  asked: "Asked",
  answered: "Answered",
  moot: "No longer needed",
};

/**
 * tenants/{tenantId}/questions/{questionId} — things to ask somebody
 * (FEATURES.md §3.1).
 *
 * `askWho` is deliberately FREE TEXT, not a contact reference: half the useful
 * questions are for someone who isn't in the contact list yet ("whoever does
 * the mandap", "Pandit ji"). `contactId` links it up once that person exists.
 *
 * The default view GROUPS BY `askWho`, and that grouping is the whole feature —
 * "here are the 6 things to raise with the caterer on Thursday" is useful in a
 * way a flat list of questions is not.
 *
 * SECURITY: readable and writable by any member — anyone who thinks of a
 * question should be able to write it down before they forget it.
 */
export interface Question {
  text: string;
  askWho: string; // free text: "Venue manager at Taj", "Pandit ji"
  contactId: string | null;
  categoryId: string | null;
  eventId: string | null;
  status: QuestionStatus;
  answer: string;
  askedBy: string | null; // uid
  askedAt: Timestamp | null;
  createdBy: string; // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface QuestionWithId extends Question {
  id: string;
}
