import { z } from "zod";

/**
 * Supported currencies (decision D2-02). Codes are ISO 4217. Every supported currency has
 * 2 minor digits, so "integer cents" is exact for all of them; adding a currency with a
 * different number of minor digits requires a documented decision and new tests.
 *
 * There are NO conversion rules: amounts in different currencies are never added,
 * compared or transferred into each other (docs/architecture/domain-models.md).
 */
export const SUPPORTED_CURRENCIES = {
  ARS: { minorDigits: 2, symbol: "$" },
  USD: { minorDigits: 2, symbol: "US$" },
} as const;

export type CurrencyCode = keyof typeof SUPPORTED_CURRENCIES;
export const CURRENCY_CODES = Object.keys(SUPPORTED_CURRENCIES) as CurrencyCode[];

const ISO_4217_FORMAT = /^[A-Z]{3}$/;

/** Zod: an ISO 4217 code that this application supports (output typed as CurrencyCode). */
export const currencyCodeSchema = z
  .string()
  .regex(ISO_4217_FORMAT, "Expected an ISO 4217 currency code (3 upper-case letters)")
  .pipe(z.enum(["ARS", "USD"], { error: () => `Unsupported currency; supported: ${CURRENCY_CODES.join(", ")}` }));

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && value in SUPPORTED_CURRENCIES;
}
