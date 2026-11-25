import { z } from "zod";

/**
 * Supported currencies (ISO 4217), each with its own number of minor digits: amounts are
 * always integers in the currency's minor unit (centavos, cents; whole pesos for CLP and
 * guaraníes for PYG, which have none). Step 10 addendum (D-FX-01) widened the list from
 * ARS/USD; amounts in different currencies are still never added as if equivalent — any
 * conversion is explicit, uses a stated exchange rate and is labelled as an estimate
 * (src/domain/exchange.ts, docs/features/currency-exchange.md).
 */
export const SUPPORTED_CURRENCIES = {
  ARS: { minorDigits: 2, symbol: "$", name: "Peso argentino" },
  USD: { minorDigits: 2, symbol: "US$", name: "Dólar estadounidense" },
  EUR: { minorDigits: 2, symbol: "€", name: "Euro" },
  BRL: { minorDigits: 2, symbol: "R$", name: "Real brasileño" },
  UYU: { minorDigits: 2, symbol: "$U", name: "Peso uruguayo" },
  CLP: { minorDigits: 0, symbol: "CLP$", name: "Peso chileno" },
  PYG: { minorDigits: 0, symbol: "₲", name: "Guaraní paraguayo" },
  GBP: { minorDigits: 2, symbol: "£", name: "Libra esterlina" },
} as const;

export type CurrencyCode = keyof typeof SUPPORTED_CURRENCIES;
export const CURRENCY_CODES = Object.keys(SUPPORTED_CURRENCIES) as CurrencyCode[];

const ISO_4217_FORMAT = /^[A-Z]{3}$/;

/** Zod: an ISO 4217 code that this application supports (output typed as CurrencyCode). */
export const currencyCodeSchema = z
  .string()
  .regex(ISO_4217_FORMAT, "Expected an ISO 4217 currency code (3 upper-case letters)")
  .pipe(z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]], { error: () => `Unsupported currency; supported: ${CURRENCY_CODES.join(", ")}` }));

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && value in SUPPORTED_CURRENCIES;
}

export const minorDigitsOf = (currency: CurrencyCode): number => SUPPORTED_CURRENCIES[currency].minorDigits;
