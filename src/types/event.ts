import type { Timestamp } from "firebase/firestore";
import type { Paise } from "@/lib/money";

/**
 * events/{eventId} — a wedding function like Mehendi, Sangeet, Wedding, Reception
 * (FEATURES.md §1.2). One of the two shared dimensions most records are tagged
 * with. Writable only by role=="couple".
 */
export interface Event {
  name: string;
  date: Timestamp | null;
  venueOptionId: string | null; // → a comparison option, once a venue is chosen (Phase 2)
  perPlateEstPaise: Paise; // drives the guest cost projection (Phase 3, §4.4)
  order: number;
  colour: string; // hex; keep chart colours consistent app-wide
}
