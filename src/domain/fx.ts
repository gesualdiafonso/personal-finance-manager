import { z } from "zod";
import { CURRENCY_CODES, currencyCodeSchema, minorDigitsOf, type CurrencyCode } from "./currency";

/**
 * Exchange rates and currency conversion (Step 10 addendum, D-FX-02..D-FX-09).
 *
 * - A rate is a positive decimal written as a string ("1450", "0.000689655"): how many units
 *   of the TARGET currency one unit of the SOURCE currency buys. USD→ARS 1450 means
 *   US$ 1 = $ 1.450, so USD 100 × 1450 = ARS 145.000.
 * - Rates never pass through a binary float: they are parsed into an exact fraction and every
 *   conversion runs on BigInt, rounding once, half away from zero, to the target's minor unit.
 * - A converted amount is always an ESTIMATE shown next to the original; the original amount
 *   and currency are never replaced (D2-02 still holds: no silent mixing of currencies).
 * - No quotation is ever invented: when there is no rate, the result is "missing-rate".
 */

/** Up to 12 integer digits and 10 decimals; canonical form uses "." and no thousands marks. */
export const RATE_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,10})?$/;
export const RATE_MAX_DECIMALS = 10;

export const rateSchema = z
  .string()
  .regex(RATE_PATTERN, "Expected a positive decimal rate like 1450 or 0.00069")
  .refine((r) => /[1-9]/.test(r), "A rate must be greater than zero");

export type Rate = z.infer<typeof rateSchema>;

export const CONVERSION_MODES = ["automatic", "manual", "custom"] as const;
export type ConversionMode = (typeof CONVERSION_MODES)[number];

/* ----------------------------------------------------------------------------- */
/* Exact decimal arithmetic                                                       */
/* ----------------------------------------------------------------------------- */

interface Fraction {
  num: bigint;
  den: bigint;
}

const TEN = BigInt(10);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const pow10 = (n: number): bigint => TEN ** BigInt(n);

export function isValidRate(rate: unknown): rate is Rate {
  return rateSchema.safeParse(rate).success;
}

function toFraction(rate: Rate): Fraction {
  const [whole = "0", decimals = ""] = rate.split(".");
  return { num: BigInt(whole + decimals), den: pow10(decimals.length) };
}

/** Integer division rounding half away from zero (den > 0). */
function roundDiv(num: bigint, den: bigint): bigint {
  const negative = num < ZERO;
  const abs = negative ? -num : num;
  const q = abs / den;
  const r = abs % den;
  const rounded = r * TWO >= den ? q + ONE : q;
  return negative ? -rounded : rounded;
}

/** A fraction written as a canonical rate with at most `decimals` places (trailing zeros cut). */
function fractionToRate(f: Fraction, decimals = RATE_MAX_DECIMALS): Rate | null {
  if (f.num <= ZERO || f.den <= ZERO) return null;
  const scaled = roundDiv(f.num * pow10(decimals), f.den);
  if (scaled <= ZERO) return null; // smaller than the precision we keep: not a usable rate
  const digits = scaled.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, "");
  const out = frac ? `${whole}.${frac}` : whole;
  return isValidRate(out) ? out : null;
}

export type ConversionError = "missing-rate" | "invalid-rate" | "invalid-amount" | "out-of-range";
export type ConversionResult = { ok: true; amount: number } | { ok: false; error: ConversionError };

/**
 * converted = amount × rate, in the target's minor units. `amount` is in the source's minor
 * units (cents; whole pesos for CLP). Same currency: rate must be 1 and the amount is returned
 * as is. Zero converts to zero; negative amounts keep their sign (balances can be negative).
 */
export function convertMinor(amount: number, from: CurrencyCode, to: CurrencyCode, rate: Rate | null | undefined): ConversionResult {
  if (!Number.isSafeInteger(amount)) return { ok: false, error: "invalid-amount" };
  if (from === to) return { ok: true, amount };
  if (rate == null || rate === "") return { ok: false, error: "missing-rate" };
  if (!isValidRate(rate)) return { ok: false, error: "invalid-rate" };
  const r = toFraction(rate);
  const num = BigInt(amount) * r.num * pow10(minorDigitsOf(to));
  const den = r.den * pow10(minorDigitsOf(from));
  const out = roundDiv(num, den);
  const asNumber = Number(out);
  if (!Number.isSafeInteger(asNumber)) return { ok: false, error: "out-of-range" };
  return { ok: true, amount: asNumber === 0 ? 0 : asNumber }; // no -0
}

/** 1 ÷ rate, kept to RATE_MAX_DECIMALS places; null when the inverse is too small to keep. */
export function invertRate(rate: Rate): Rate | null {
  if (!isValidRate(rate)) return null;
  const f = toFraction(rate);
  return fractionToRate({ num: f.den, den: f.num });
}

/** a ÷ b for two rates (cross rate through a common currency). */
function divideRates(a: Rate, b: Rate): Rate | null {
  const fa = toFraction(a);
  const fb = toFraction(b);
  return fractionToRate({ num: fa.num * fb.den, den: fa.den * fb.num });
}

/** Compares two rates exactly (−1, 0, 1). */
export function compareRates(a: Rate, b: Rate): number {
  const fa = toFraction(a);
  const fb = toFraction(b);
  const l = fa.num * fb.den;
  const r = fb.num * fa.den;
  return l === r ? 0 : l < r ? -1 : 1;
}

/**
 * Parses a rate typed in es-AR ("1.450,25", "1450,25", "0,00069") or pasted in canonical form
 * ("1450.25"). With a comma, dots are thousands marks; without one, a single dot followed by
 * other than exactly three digits is taken as the decimal point ("1450.5"), while "1.450" stays
 * one thousand four hundred and fifty, as es-AR reads it.
 */
export function parseRateInput(input: string): { ok: true; rate: Rate } | { ok: false; error: "empty" | "invalid" | "zero" | "too-many-decimals" } {
  let s = input.replace(/[\s  ]/g, "");
  if (s === "") return { ok: false, error: "empty" };
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d+$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // canonical decimal point
  } else {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: "invalid" };
  const [whole = "0", decimals = ""] = s.split(".");
  if (decimals.length > RATE_MAX_DECIMALS) return { ok: false, error: "too-many-decimals" };
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
  const trimmedDec = decimals.replace(/0+$/, "");
  const canonical = trimmedDec ? `${trimmedWhole}.${trimmedDec}` : trimmedWhole;
  if (!/[1-9]/.test(canonical)) return { ok: false, error: "zero" };
  if (!isValidRate(canonical)) return { ok: false, error: "invalid" };
  return { ok: true, rate: canonical };
}

/** es-AR display of a rate: "1.450", "1.450,25", "0,00068966". */
export function formatRate(rate: Rate, maxDecimals = 8): string {
  const shown = fractionToRate(toFraction(rate), maxDecimals) ?? rate;
  const [whole = "0", decimals = ""] = shown.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals ? `${grouped},${decimals}` : grouped;
}

/* ----------------------------------------------------------------------------- */
/* Rate sets (named configurations: Oficial, MEP, user-defined)                  */
/* ----------------------------------------------------------------------------- */

export const QUOTE_SOURCES = ["manual", "dolarapi"] as const;
export type QuoteSource = (typeof QUOTE_SOURCES)[number];

const isoInstant = z.iso.datetime({ offset: true });

/** One quotation: how many units of the set's base currency one unit of `currency` buys. */
export const quoteSchema = z.strictObject({
  rate: rateSchema,
  updatedAt: isoInstant,
  source: z.enum(QUOTE_SOURCES),
});
export type Quote = z.infer<typeof quoteSchema>;

export const RATE_SET_KINDS = ["official", "mep", "blue", "card", "custom"] as const;
export type RateSetKind = (typeof RATE_SET_KINDS)[number];

export const rateSetSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/, "Rate set id in kebab-case"),
    name: z.string().trim().min(1).max(40),
    kind: z.enum(RATE_SET_KINDS),
    /** Currency the quotes are expressed in (normally the primary currency). */
    base: currencyCodeSchema,
    /** Quotes typed by the user: always available, never touched by the provider. */
    manual: z.partialRecord(currencyCodeSchema, quoteSchema),
    /** Quotes fetched from the provider (automatic mode); kept apart from the manual ones. */
    automatic: z.partialRecord(currencyCodeSchema, quoteSchema),
  })
  .superRefine((s, ctx) => {
    for (const [code, q] of Object.entries(s.manual)) {
      if (code === s.base) ctx.addIssue({ code: "custom", path: ["manual", code], message: "The base currency has no quote (it is 1)" });
      if (q && q.source !== "manual") ctx.addIssue({ code: "custom", path: ["manual", code, "source"], message: "Manual quotes have source manual" });
    }
    for (const [code, q] of Object.entries(s.automatic)) {
      if (code === s.base) ctx.addIssue({ code: "custom", path: ["automatic", code], message: "The base currency has no quote (it is 1)" });
      if (q && q.source === "manual") ctx.addIssue({ code: "custom", path: ["automatic", code, "source"], message: "Automatic quotes come from a provider" });
    }
  });
export type RateSet = z.infer<typeof rateSetSchema>;

export const exchangeSettingsSchema = z
  .strictObject({
    /** Currencies offered in forms (the primary currency is always included). */
    enabledCurrencies: z.array(currencyCodeSchema).min(1),
    /** automatic: prefer provider quotes and fall back to manual; manual: only typed quotes. */
    defaultMode: z.enum(["automatic", "manual"]),
    activeRateSetId: z.string(),
    rateSets: z.array(rateSetSchema).min(1),
    /** Opt-in: the app never calls a provider unless this is true AND the user asks for it. */
    providerEnabled: z.boolean(),
  })
  .superRefine((s, ctx) => {
    const ids = new Set<string>();
    s.rateSets.forEach((r, i) => {
      if (ids.has(r.id)) ctx.addIssue({ code: "custom", path: ["rateSets", i, "id"], message: `Duplicate rate set id ${r.id}` });
      ids.add(r.id);
    });
    if (!ids.has(s.activeRateSetId)) ctx.addIssue({ code: "custom", path: ["activeRateSetId"], message: "activeRateSetId must name one of rateSets" });
    if (new Set(s.enabledCurrencies).size !== s.enabledCurrencies.length) ctx.addIssue({ code: "custom", path: ["enabledCurrencies"], message: "Duplicate currency" });
  });
export type ExchangeSettings = z.infer<typeof exchangeSettingsSchema>;

/** Defaults: two named sets with NO quotes — the user (or the opt-in provider) fills them. */
export function defaultExchangeSettings(primary: CurrencyCode = "ARS"): ExchangeSettings {
  return {
    enabledCurrencies: primary === "USD" ? ["USD", "ARS"] : [primary, "USD"].filter((c, i, a) => a.indexOf(c) === i) as CurrencyCode[],
    defaultMode: "manual",
    activeRateSetId: "oficial",
    rateSets: [
      { id: "oficial", name: "Oficial", kind: "official", base: primary, manual: {}, automatic: {} },
      { id: "mep", name: "MEP", kind: "mep", base: primary, manual: {}, automatic: {} },
    ],
    providerEnabled: false,
  };
}

/** Enabled currencies, primary first, always including the primary and in a stable order. */
export function enabledCurrencies(settings: ExchangeSettings, primary: CurrencyCode): CurrencyCode[] {
  const set = new Set<CurrencyCode>([primary, ...settings.enabledCurrencies]);
  return [primary, ...CURRENCY_CODES.filter((c) => c !== primary && set.has(c))];
}

export function activeRateSet(settings: ExchangeSettings): RateSet {
  return settings.rateSets.find((r) => r.id === settings.activeRateSetId) ?? settings.rateSets[0]!;
}

export interface ResolvedRate {
  rate: Rate;
  /** What the rate came from: provider quotes (automatic) or typed quotes (manual). */
  mode: Exclude<ConversionMode, "custom">;
  source: QuoteSource;
  /** Oldest quote used (a cross rate uses two). */
  updatedAt: string;
  rateSetId: string;
  /** Automatic was asked for but some quote was missing, so manual quotes were used. */
  fellBack: boolean;
}

/** Quote of `currency` in the set's base, honouring the requested mode with manual fallback. */
function quoteOf(set: RateSet, currency: CurrencyCode, mode: "automatic" | "manual"): { quote: Quote; mode: "automatic" | "manual"; fellBack: boolean } | null {
  if (mode === "automatic") {
    const auto = set.automatic[currency];
    if (auto) return { quote: auto, mode: "automatic", fellBack: false };
    const manual = set.manual[currency];
    return manual ? { quote: manual, mode: "manual", fellBack: true } : null;
  }
  const manual = set.manual[currency];
  return manual ? { quote: manual, mode: "manual", fellBack: false } : null;
}

/**
 * Rate from → to using the set's quotes: q(from) ÷ q(to), with q(base) = 1. Works for
 * foreign→primary (USD→ARS = q(USD)), primary→foreign (ARS→USD = 1 ÷ q(USD)) and between two
 * foreign currencies (EUR→USD = q(EUR) ÷ q(USD)). Null when a needed quote is missing.
 */
export function resolveRate(set: RateSet, from: CurrencyCode, to: CurrencyCode, mode: "automatic" | "manual"): ResolvedRate | null {
  if (from === to) return { rate: "1", mode, source: "manual", updatedAt: new Date(0).toISOString(), rateSetId: set.id, fellBack: false };
  const qf = from === set.base ? null : quoteOf(set, from, mode);
  const qt = to === set.base ? null : quoteOf(set, to, mode);
  if ((from !== set.base && !qf) || (to !== set.base && !qt)) return null;
  const rf = qf?.quote.rate ?? "1";
  const rt = qt?.quote.rate ?? "1";
  const rate = rt === "1" ? rf : divideRates(rf, rt);
  if (!rate) return null;
  const used = [qf, qt].filter((q): q is NonNullable<typeof q> => q !== null);
  const anyManual = used.some((q) => q.mode === "manual");
  const auto = used.find((q) => q.mode === "automatic");
  return {
    rate,
    mode: anyManual ? "manual" : "automatic",
    source: anyManual ? "manual" : (auto?.quote.source ?? "manual"),
    updatedAt: used.map((q) => q.quote.updatedAt).sort()[0]!,
    rateSetId: set.id,
    fellBack: used.some((q) => q.fellBack),
  };
}

/* ----------------------------------------------------------------------------- */
/* Conversion snapshot stored on a transaction                                    */
/* ----------------------------------------------------------------------------- */

/**
 * What a transaction recorded about its value in the primary currency, at the moment it was
 * saved. Immutable history: later rate changes never rewrite it (D-FX-05). The original amount
 * and currency stay in the transaction's own `amount`/`currency`; `from`/`amount` repeat them so
 * the snapshot can be checked on its own.
 */
export const conversionSnapshotSchema = z
  .strictObject({
    from: currencyCodeSchema,
    to: currencyCodeSchema,
    /** Original amount in `from` minor units (equals the transaction's amount). */
    amount: z.number().int().positive(),
    /** Estimated amount in `to` minor units: amount × rate, rounded half away from zero. */
    converted: z.number().int().min(0),
    rate: rateSchema,
    mode: z.enum(CONVERSION_MODES),
    /** Rate set used (absent for a custom rate typed on the transaction). */
    rateSetId: z.string().nullable(),
    source: z.enum([...QUOTE_SOURCES, "user"]),
    /** When the applied rate was quoted (custom: when it was typed). */
    rateAt: isoInstant,
    /** The suggested rate was replaced by the user on this transaction. */
    overridden: z.boolean(),
  })
  .superRefine((c, ctx) => {
    if (c.from === c.to) ctx.addIssue({ code: "custom", path: ["to"], message: "A conversion needs two different currencies" });
    const expected = convertMinor(c.amount, c.from, c.to, c.rate);
    if (expected.ok && expected.amount !== c.converted) {
      ctx.addIssue({ code: "custom", path: ["converted"], message: `converted must be amount × rate (${expected.amount})` });
    }
    if (!expected.ok) ctx.addIssue({ code: "custom", path: ["converted"], message: `Conversion failed: ${expected.error}` });
    if (c.mode === "custom" && !c.overridden) ctx.addIssue({ code: "custom", path: ["overridden"], message: "A custom rate is an override" });
  });
export type ConversionSnapshot = z.infer<typeof conversionSnapshotSchema>;

/** Builds a consistent snapshot, or null when the amount cannot be converted with that rate. */
export function buildConversion(input: {
  amount: number;
  from: CurrencyCode;
  to: CurrencyCode;
  rate: Rate;
  mode: ConversionMode;
  rateSetId: string | null;
  source: QuoteSource | "user";
  rateAt: string;
  overridden: boolean;
}): ConversionSnapshot | null {
  if (input.from === input.to || input.amount <= 0) return null;
  const converted = convertMinor(input.amount, input.from, input.to, input.rate);
  if (!converted.ok) return null;
  return { ...input, converted: converted.amount };
}

/* ----------------------------------------------------------------------------- */
/* Multi-currency aggregation                                                     */
/* ----------------------------------------------------------------------------- */

export interface ConvertedTotal {
  currency: CurrencyCode;
  /** Sum of every amount that could be converted, in `currency` minor units. */
  total: number;
  /** Original totals per currency, never converted. */
  byCurrency: Partial<Record<CurrencyCode, number>>;
  /** Currencies left out of `total` because no rate was available. */
  missing: CurrencyCode[];
  /** Rates used, per source currency. */
  rates: Partial<Record<CurrencyCode, ResolvedRate>>;
  /** True when anything was converted: the total is then an estimate. */
  estimated: boolean;
}

/**
 * Consolidates amounts held in several currencies into `target` (an estimate). Each currency
 * is summed in its own minor units first and converted once, so rounding happens once per
 * currency, never per item. Currencies without a rate are reported in `missing`, not guessed.
 */
export function consolidate(
  items: ReadonlyArray<{ amount: number; currency: CurrencyCode }>,
  target: CurrencyCode,
  set: RateSet | null,
  mode: "automatic" | "manual",
): ConvertedTotal {
  const byCurrency: Partial<Record<CurrencyCode, number>> = {};
  for (const i of items) byCurrency[i.currency] = (byCurrency[i.currency] ?? 0) + i.amount;
  let total = 0;
  let estimated = false;
  const missing: CurrencyCode[] = [];
  const rates: Partial<Record<CurrencyCode, ResolvedRate>> = {};
  for (const code of CURRENCY_CODES) {
    const sum = byCurrency[code];
    if (sum === undefined) continue;
    if (code === target) {
      total += sum;
      continue;
    }
    const resolved = set ? resolveRate(set, code, target, mode) : null;
    const converted = resolved ? convertMinor(sum, code, target, resolved.rate) : null;
    if (!resolved || !converted?.ok) {
      missing.push(code);
      continue;
    }
    rates[code] = resolved;
    total += converted.amount;
    estimated = true;
  }
  return { currency: target, total, byCurrency, missing, rates, estimated };
}
