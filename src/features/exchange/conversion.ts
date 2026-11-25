import type { CurrencyCode } from "@/domain/currency";
import {
  activeRateSet,
  buildConversion,
  defaultExchangeSettings,
  parseRateInput,
  resolveRate,
  type ConversionSnapshot,
  type ExchangeSettings,
  type ResolvedRate,
} from "@/domain/fx";
import type { FinancialSettings } from "@/domain/schemas";
import { toIsoWithOffset } from "@/lib/formatting/date";

/** Primary currency + exchange configuration, with defaults when settings predate 2.4.0. */
export interface ExchangeContext {
  primary: CurrencyCode;
  exchange: ExchangeSettings;
}

export function exchangeContextOf(settings: FinancialSettings): ExchangeContext {
  return { primary: settings.baseCurrency, exchange: settings.exchange ?? defaultExchangeSettings(settings.baseCurrency) };
}

/** The rate the app suggests now (active set, default mode with manual fallback). */
export function suggestedRate(ctx: ExchangeContext, from: CurrencyCode, to: CurrencyCode = ctx.primary): ResolvedRate | null {
  return resolveRate(activeRateSet(ctx.exchange), from, to, ctx.exchange.defaultMode);
}

/**
 * How a transaction form chooses its estimate in the primary currency:
 * - stored: keep the rate recorded when it was saved (default when editing — history is kept);
 * - current: the rate suggested now by the active rate set;
 * - custom: a rate typed for this transaction (an override);
 * - none: no estimate (only for a transaction that never had one).
 */
export type RateChoice = "stored" | "current" | "custom" | "none";

export type ConversionPlan =
  | { kind: "not-needed" }
  | { kind: "ok"; snapshot: ConversionSnapshot; fellBack: boolean }
  | { kind: "no-rate" }
  | { kind: "no-amount" }
  | { kind: "error"; error: "rate-empty" | "rate-invalid" | "rate-zero" | "rate-decimals" | "out-of-range" };

export function planConversion(input: {
  amount: number | null;
  from: CurrencyCode;
  ctx: ExchangeContext;
  choice: RateChoice;
  customRate: string;
  stored?: ConversionSnapshot;
  now: Date;
}): ConversionPlan {
  const { amount, from, ctx, choice } = input;
  const to = ctx.primary;
  if (from === to || choice === "none") return { kind: "not-needed" };
  if (choice === "custom") {
    const parsed = parseRateInput(input.customRate);
    if (!parsed.ok) {
      const error = parsed.error === "empty" ? "rate-empty" : parsed.error === "zero" ? "rate-zero" : parsed.error === "too-many-decimals" ? "rate-decimals" : "rate-invalid";
      return { kind: "error", error };
    }
    if (amount === null || amount <= 0) return { kind: "no-amount" };
    const snapshot = buildConversion({ amount, from, to, rate: parsed.rate, mode: "custom", rateSetId: null, source: "user", rateAt: toIsoWithOffset(input.now), overridden: true });
    return snapshot ? { kind: "ok", snapshot, fellBack: false } : { kind: "error", error: "out-of-range" };
  }
  if (choice === "stored" && input.stored && input.stored.from === from && input.stored.to === to) {
    if (amount === null || amount <= 0) return { kind: "no-amount" };
    const s = input.stored;
    // Same rate, mode, source and time as recorded; only the amount may have been corrected.
    const snapshot = buildConversion({ amount, from, to, rate: s.rate, mode: s.mode, rateSetId: s.rateSetId, source: s.source, rateAt: s.rateAt, overridden: s.overridden });
    return snapshot ? { kind: "ok", snapshot, fellBack: false } : { kind: "error", error: "out-of-range" };
  }
  const resolved = suggestedRate(ctx, from, to);
  if (!resolved) return { kind: "no-rate" };
  if (amount === null || amount <= 0) return { kind: "no-amount" };
  const snapshot = buildConversion({ amount, from, to, rate: resolved.rate, mode: resolved.mode, rateSetId: resolved.rateSetId, source: resolved.source, rateAt: resolved.updatedAt, overridden: false });
  return snapshot ? { kind: "ok", snapshot, fellBack: resolved.fellBack } : { kind: "error", error: "out-of-range" };
}
