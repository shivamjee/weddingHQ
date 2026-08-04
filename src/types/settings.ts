import type { Timestamp } from "firebase/firestore";

/**
 * settings/currency — the single exchange-rates doc (FEATURES.md §1.4). Rates are
 * "units of the target currency per 1 INR". Conversion is display-time only; we
 * never store converted values or snapshot a rate per record. Hand-editable by
 * the couple. Writable only by role=="couple".
 */
export interface CurrencySettings {
  rates: {
    USD: number;
    EUR: number;
    GBP: number;
    AED: number;
  };
  updatedAt: Timestamp;
  updatedBy: string; // uid
}

/**
 * settings/guestTarget — the headcount the venue actually holds (FEATURES.md
 * §4.2). The tier ladder marks which tier breaks this number and by how many
 * people, which is the whole conversation the guest list exists to have.
 *
 * Writable by any member, like every other `settings` document since the Phase
 * 2.1 roles round. Absent until somebody sets it — the ladder then shows running
 * totals with no break marker rather than inventing a target.
 */
export interface GuestTargetSettings {
  targetHeads: number;
  updatedAt: Timestamp;
  updatedBy: string; // uid
}
