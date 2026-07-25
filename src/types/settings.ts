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
