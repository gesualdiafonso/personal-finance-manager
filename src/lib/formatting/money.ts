import { APP_CONFIG } from "@/lib/config/app";
import { type MinorUnits, MoneyError, toMinorUnits } from "@/types/money";

/** U+2212 MINUS SIGN — never the hyphen (docs/design-system/tipografia.md §5). */
export const MINUS = "−";
/** U+00A0 NO-BREAK SPACE between the symbol and the number. */
export const NBSP = " ";
export const CURRENCY_SYMBOL = "$";

/**
 * - `always`: always show cents (tables, statements, forms) — keeps columns aligned.
 * - `auto`: hide ",00"; show other cents (hero, indicators, mobile lists).
 * - `never`: round to whole pesos, half away from zero (charts, compact labels).
 */
export type CentsMode = "always" | "auto" | "never";
/**
 * - `negative`: only negatives carry a sign (balances, totals).
 * - `explicit`: "+" for positives too (statements, income/expense lists).
 */
export type SignMode = "negative" | "explicit";

export interface MoneyFormatOptions {
  cents?: CentsMode;
  sign?: SignMode;
}

export interface MoneyParts {
  sign: "" | "+" | typeof MINUS;
  symbol: string;
  /** Whole pesos with es-AR grouping, e.g. "4.812.340". */
  whole: string;
  /** Decimal part including the comma, e.g. ",56", or "" when hidden. */
  cents: string;
}

const groupFormatter = new Intl.NumberFormat(APP_CONFIG.locale, {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/** Splits an integer amount without floating-point division. */
function split(abs: number): { whole: number; cents: number } {
  const cents = abs % 100;
  const whole = (abs - cents) / 100; // exact: abs - cents is a multiple of 100
  return { whole, cents };
}

export function formatMoneyParts(amount: MinorUnits | number, options: MoneyFormatOptions = {}): MoneyParts {
  const value = toMinorUnits(amount);
  const { cents: centsMode = "always", sign: signMode = "negative" } = options;
  const abs = Math.abs(value);
  const { cents } = split(abs);
  let { whole } = split(abs);

  if (centsMode === "never" && cents >= 50) {
    whole += 1;
  }
  const roundedZero = centsMode === "never" ? whole === 0 : abs === 0;

  let sign: MoneyParts["sign"] = "";
  if (!roundedZero) {
    if (value < 0) sign = MINUS;
    else if (signMode === "explicit") sign = "+";
  }

  let centsText = "";
  if (centsMode === "always" || (centsMode === "auto" && cents !== 0)) {
    centsText = `,${String(cents).padStart(2, "0")}`;
  }

  return { sign, symbol: CURRENCY_SYMBOL, whole: groupFormatter.format(whole), cents: centsText };
}

/** "$ 4.812.340,56", "−$ 48.300,00", "+$ 3.450.000" (sign before the symbol). */
export function formatMoney(amount: MinorUnits | number, options: MoneyFormatOptions = {}): string {
  const p = formatMoneyParts(amount, options);
  return `${p.sign}${p.symbol}${NBSP}${p.whole}${p.cents}`;
}

const decimalFormatter = new Intl.NumberFormat(APP_CONFIG.locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/**
 * Compact form for chart axes and labels only (never for comparable values):
 * 2.130.000,00 → "2,1 M"; 312.000,00 → "312 mil". Uses integer rounding.
 */
export function formatMoneyCompact(amount: MinorUnits | number): string {
  const value = toMinorUnits(amount);
  const sign = value < 0 ? MINUS : "";
  const pesos = Math.round(Math.abs(value) / 100);
  if (pesos >= 1_000_000) {
    const tenths = Math.round(pesos / 100_000); // tenths of a million
    return `${sign}${decimalFormatter.format(tenths / 10)}${NBSP}M`;
  }
  if (pesos >= 1_000) {
    return `${sign}${groupFormatter.format(Math.round(pesos / 1_000))}${NBSP}mil`;
  }
  return `${sign}${groupFormatter.format(pesos)}`;
}

export type ParseMoneyError = "empty" | "invalid" | "too-many-decimals" | "out-of-range";
export type ParseMoneyResult = { ok: true; value: MinorUnits } | { ok: false; error: ParseMoneyError };

/**
 * Parses user input in es-AR convention into minor units. The comma is always the decimal
 * separator; dots are thousands separators and are ignored. The sign is never typed
 * (it comes from the transaction kind), so "-" is rejected.
 * Accepts "1.234,56", "1234,56", "1234", "$ 1.234".
 */
export function parseMoneyInput(input: string): ParseMoneyResult {
  const cleaned = input.replace(/\$/g, "").replace(/[\s  ]/g, "").replace(/\./g, "");
  if (cleaned === "") return { ok: false, error: "empty" };
  const match = /^(\d+)(?:,(\d*))?$/.exec(cleaned);
  if (!match) return { ok: false, error: "invalid" };
  const wholeDigits = match[1] ?? "0";
  const decimals = match[2] ?? "";
  if (decimals.length > 2) return { ok: false, error: "too-many-decimals" };
  const centsDigits = decimals.padEnd(2, "0");
  const asString = `${wholeDigits.replace(/^0+(?=\d)/, "")}${centsDigits}`;
  const value = Number(asString);
  if (!Number.isSafeInteger(value)) return { ok: false, error: "out-of-range" };
  return { ok: true, value: value as MinorUnits };
}

export { MoneyError };

/**
 * Formats a Money value with its own currency symbol: ARS "$ 1.234,56", USD "US$ 1.234,56".
 * Number formatting stays es-AR for every currency (Financial Settings numberFormat).
 */
export function formatCurrencyAmount(
  value: { amount: number; currency: string },
  options: MoneyFormatOptions = {},
): string {
  const symbols: Record<string, string> = { ARS: "$", USD: "US$" };
  const symbol = symbols[value.currency];
  if (!symbol) throw new MoneyError(`Unsupported currency ${value.currency}`);
  const p = formatMoneyParts(value.amount, options);
  return `${p.sign}${symbol}${NBSP}${p.whole}${p.cents}`;
}
