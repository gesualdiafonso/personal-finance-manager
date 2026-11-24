import { APP_CONFIG } from "@/lib/config/app";
import type { FinancialSettings } from "./schemas";

/**
 * Financial settings live in data/settings.json (official, versioned) and in IndexedDB on the
 * device. They are NOT UI preferences: theme and similar stay in LocalStorage (Step 02 §4.8).
 * Defaults (D2, approved): ARS, Buenos Aires, es-AR, week starts on Monday.
 */
export const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  baseCurrency: "ARS",
  timezone: APP_CONFIG.timeZone,
  locale: APP_CONFIG.locale,
  firstDayOfWeek: "monday",
  numberFormat: APP_CONFIG.locale,
};
