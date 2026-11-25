import { z } from "zod";
import type { CurrencyCode } from "@/domain/currency";
import { isValidRate, type ExchangeSettings, type Quote, type Rate, type RateSet, type RateSetKind } from "@/domain/fx";
import { toIsoWithOffset } from "@/lib/formatting/date";

/**
 * Optional automatic quotations from DolarApi.com (D-FX-06): a free, public API (MIT) that
 * publishes Argentine peso quotations from public sources. It is only called when the user
 * enabled it in Settings AND pressed "Actualizar cotizaciones"; nothing is ever sent but the
 * GET itself (no financial data, no identifiers). Every value is validated; any failure leaves
 * the manual quotes untouched, so the app never depends on this service.
 *
 * Quotes are "venta" (what one pays for 1 unit in ARS). Only for a rate set whose base is ARS.
 */
export const DOLARAPI_BASE = "https://dolarapi.com/v1";

/** Endpoint per rate-set kind for USD; other currencies only have the official quotation. */
const USD_ENDPOINT: Partial<Record<RateSetKind, string>> = {
  official: "/dolares/oficial",
  mep: "/dolares/bolsa",
  blue: "/dolares/blue",
  card: "/dolares/tarjeta",
};
const OFFICIAL_OTHERS: Partial<Record<CurrencyCode, string>> = {
  EUR: "/cotizaciones/eur",
  BRL: "/cotizaciones/brl",
  CLP: "/cotizaciones/clp",
  UYU: "/cotizaciones/uyu",
};

const responseSchema = z.object({
  venta: z.number().finite().positive(),
  fechaActualizacion: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date"),
});

/** A float from JSON → a canonical rate string, or null when it is not a usable rate. */
export function rateFromNumber(n: number): Rate | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const text = n.toFixed(10).replace(/\.?0+$/, "");
  return isValidRate(text) ? text : null;
}

export function providerSupports(set: RateSet, currency: CurrencyCode): boolean {
  if (set.base !== "ARS" || currency === "ARS") return false;
  if (currency === "USD") return Boolean(USD_ENDPOINT[set.kind]);
  return set.kind === "official" && Boolean(OFFICIAL_OTHERS[currency]);
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export interface RefreshResult {
  settings: ExchangeSettings;
  updated: CurrencyCode[];
  failed: CurrencyCode[];
}

/**
 * Fetches the quotations the active rate set can get automatically for the enabled currencies
 * and returns NEW settings (the input is not modified). Failures are reported per currency.
 */
export async function refreshFromProvider(
  settings: ExchangeSettings,
  options: { fetch?: FetchLike; timeoutMs?: number; now?: () => Date } = {},
): Promise<RefreshResult> {
  const set = settings.rateSets.find((r) => r.id === settings.activeRateSetId);
  if (!settings.providerEnabled || !set) return { settings, updated: [], failed: [] };
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const targets = settings.enabledCurrencies.filter((c) => providerSupports(set, c));
  const automatic: RateSet["automatic"] = { ...set.automatic };
  const updated: CurrencyCode[] = [];
  const failed: CurrencyCode[] = [];
  await Promise.all(
    targets.map(async (code) => {
      const path = code === "USD" ? USD_ENDPOINT[set.kind] : OFFICIAL_OTHERS[code];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
      try {
        const res = await doFetch(`${DOLARAPI_BASE}${path}`, { signal: controller.signal, headers: { accept: "application/json" } });
        if (!res.ok) throw new Error("HTTP error");
        const body = responseSchema.parse(await res.json());
        const rate = rateFromNumber(body.venta);
        if (!rate) throw new Error("Unusable rate");
        const quote: Quote = { rate, updatedAt: toIsoWithOffset(new Date(body.fechaActualizacion)), source: "dolarapi" };
        automatic[code] = quote;
        updated.push(code);
      } catch {
        failed.push(code);
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  if (updated.length === 0) return { settings, updated, failed: failed.sort() };
  return {
    settings: { ...settings, rateSets: settings.rateSets.map((r) => (r.id === set.id ? { ...r, automatic } : r)) },
    updated: updated.sort(),
    failed: failed.sort(),
  };
}
