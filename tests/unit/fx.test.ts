import { describe, expect, it, vi } from "vitest";
import {
  buildConversion,
  compareRates,
  consolidate,
  conversionSnapshotSchema,
  convertMinor,
  defaultExchangeSettings,
  enabledCurrencies,
  exchangeSettingsSchema,
  formatRate,
  invertRate,
  isValidRate,
  parseRateInput,
  rateSetSchema,
  resolveRate,
  type ExchangeSettings,
  type RateSet,
} from "@/domain/fx";
import { transactionSchema, financialSettingsSchema } from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { exchangeContextOf, planConversion, type ExchangeContext } from "@/features/exchange/conversion";
import { draftToSettings } from "@/features/exchange/currency-settings";
import { formatMoney, parseMoneyInput } from "@/lib/formatting/money";
import { rateFromNumber, refreshFromProvider, providerSupports, type FetchLike } from "@/services/fx/dolarapi";

/**
 * Multi-currency & exchange rates (Step 10 addendum). Every quotation below is FICTITIOUS
 * (EJEMPLO-FICTICIO): round numbers chosen for the arithmetic, not market data.
 */
const AT = "2026-11-24T09:00:00-03:00";
const LATER = "2026-11-24T15:00:00-03:00";
const q = (rate: string, source: "manual" | "dolarapi" = "manual", updatedAt = AT) => ({ rate, updatedAt, source });

const ars: RateSet = {
  id: "oficial",
  name: "Oficial",
  kind: "official",
  base: "ARS",
  manual: { USD: q("1450"), EUR: q("1600"), CLP: q("1.5"), BRL: q("260.25") },
  automatic: {},
};

describe("convertMinor — converted = original × rate", () => {
  it("USD → ARS: USD 100 × 1.450 = ARS 145.000", () => {
    expect(convertMinor(100_00, "USD", "ARS", "1450")).toEqual({ ok: true, amount: 145_000_00 });
  });
  it("EUR → ARS with decimals in the rate", () => {
    expect(convertMinor(250_50, "EUR", "ARS", "1600.75")).toEqual({ ok: true, amount: 400_987_88 }); // 250,50 × 1600,75 = 400.987,875 → ,88
  });
  it("ARS → USD with the inverse rate", () => {
    const inverse = invertRate("1450")!;
    expect(inverse).toBe("0.0006896552");
    expect(convertMinor(145_000_00, "ARS", "USD", inverse)).toEqual({ ok: true, amount: 100_00 });
  });
  it("respects each currency's minor digits (CLP has none)", () => {
    expect(convertMinor(1000, "CLP", "ARS", "1.5")).toEqual({ ok: true, amount: 1500_00 }); // CLP 1.000 → $ 1.500,00
    expect(convertMinor(1500_00, "ARS", "CLP", "0.6666666667")).toEqual({ ok: true, amount: 1000 });
    expect(convertMinor(1, "ARS", "CLP", "0.5")).toEqual({ ok: true, amount: 0 }); // $ 0,01 × 0,5 = CLP 0,005 → 0
  });
  it("rounds once, half away from zero, also for negative balances", () => {
    expect(convertMinor(1, "USD", "ARS", "0.5")).toEqual({ ok: true, amount: 1 }); // 0,005 → 0,01
    expect(convertMinor(-1, "USD", "ARS", "0.5")).toEqual({ ok: true, amount: -1 });
    expect(convertMinor(3, "USD", "ARS", "0.1")).toEqual({ ok: true, amount: 0 });
  });
  it("is exact where floats are not (0,1 + 0,2 style rates)", () => {
    expect(convertMinor(1_000_000_00, "USD", "ARS", "0.3")).toEqual({ ok: true, amount: 300_000_00 });
    expect(convertMinor(7_77, "EUR", "ARS", "1234.5678901234")).toEqual({ ok: true, amount: 9_592_59 }); // 7,77 × 1.234,5678901234 = 9.592,5925…
  });
  it("zero, identical currency, missing and invalid rates", () => {
    expect(convertMinor(0, "USD", "ARS", "1450")).toEqual({ ok: true, amount: 0 });
    expect(convertMinor(123, "ARS", "ARS", null)).toEqual({ ok: true, amount: 123 });
    expect(convertMinor(100, "USD", "ARS", null)).toEqual({ ok: false, error: "missing-rate" });
    for (const bad of ["0", "0.000", "-1", "abc", "1e3", "1,5", "01.5", "1.12345678901", " 1"]) {
      expect(convertMinor(100, "USD", "ARS", bad)).toEqual({ ok: false, error: "invalid-rate" });
    }
    expect(convertMinor(1.5, "USD", "ARS", "1")).toEqual({ ok: false, error: "invalid-amount" });
  });
  it("very large values: refuses what JavaScript cannot hold exactly", () => {
    expect(convertMinor(9_000_000_000_000, "USD", "ARS", "1")).toEqual({ ok: true, amount: 9_000_000_000_000 });
    expect(convertMinor(Number.MAX_SAFE_INTEGER, "USD", "ARS", "1450")).toEqual({ ok: false, error: "out-of-range" });
  });
});

describe("rates: parsing, formatting, comparison", () => {
  it("reads es-AR input and canonical input", () => {
    expect(parseRateInput("1.450,25")).toEqual({ ok: true, rate: "1450.25" });
    expect(parseRateInput("1450,25")).toEqual({ ok: true, rate: "1450.25" });
    expect(parseRateInput("1.450")).toEqual({ ok: true, rate: "1450" }); // es-AR thousands
    expect(parseRateInput("1450.5")).toEqual({ ok: true, rate: "1450.5" });
    expect(parseRateInput("0,00069")).toEqual({ ok: true, rate: "0.00069" });
    expect(parseRateInput("")).toEqual({ ok: false, error: "empty" });
    expect(parseRateInput("0")).toEqual({ ok: false, error: "zero" });
    expect(parseRateInput("-5")).toEqual({ ok: false, error: "invalid" });
    expect(parseRateInput("1,12345678901")).toEqual({ ok: false, error: "too-many-decimals" });
  });
  it("formats in es-AR and compares exactly", () => {
    expect(formatRate("1450")).toBe("1.450");
    expect(formatRate("1450.25")).toBe("1.450,25");
    expect(formatRate("0.0006896552")).toBe("0,00068966");
    expect(compareRates("1450", "1450.0")).toBe(0);
    expect(compareRates("0.1", "0.09")).toBe(1);
    expect(isValidRate("1450")).toBe(true);
    expect(rateFromNumber(1450.5)).toBe("1450.5");
    expect(rateFromNumber(0)).toBeNull();
    expect(rateFromNumber(Number.NaN)).toBeNull();
  });
});

describe("rate sets: manual, automatic with fallback, cross rates", () => {
  it("foreign → primary, primary → foreign and between two foreign currencies", () => {
    expect(resolveRate(ars, "USD", "ARS", "manual")?.rate).toBe("1450");
    expect(resolveRate(ars, "ARS", "USD", "manual")?.rate).toBe("0.0006896552");
    expect(resolveRate(ars, "EUR", "USD", "manual")?.rate).toBe("1.1034482759"); // 1600 / 1450
    expect(resolveRate(ars, "GBP", "ARS", "manual")).toBeNull(); // never invented
  });
  it("automatic prefers provider quotes and falls back to manual ones", () => {
    const withAuto: RateSet = { ...ars, automatic: { USD: q("1480", "dolarapi", LATER) } };
    expect(resolveRate(withAuto, "USD", "ARS", "automatic")).toMatchObject({ rate: "1480", mode: "automatic", source: "dolarapi", fellBack: false, updatedAt: LATER });
    expect(resolveRate(withAuto, "USD", "ARS", "manual")).toMatchObject({ rate: "1450", mode: "manual", source: "manual" });
    expect(resolveRate(withAuto, "EUR", "ARS", "automatic")).toMatchObject({ rate: "1600", mode: "manual", fellBack: true });
  });
  it("validates rate sets and settings", () => {
    expect(rateSetSchema.safeParse(ars).success).toBe(true);
    expect(rateSetSchema.safeParse({ ...ars, manual: { ARS: q("1") } }).success).toBe(false); // base has no quote
    expect(rateSetSchema.safeParse({ ...ars, manual: { USD: q("0") } }).success).toBe(false);
    expect(rateSetSchema.safeParse({ ...ars, automatic: { USD: q("1450", "manual") } }).success).toBe(false);
    const settings = defaultExchangeSettings("ARS");
    expect(exchangeSettingsSchema.safeParse(settings).success).toBe(true);
    expect(settings.rateSets.every((s) => Object.keys(s.manual).length === 0 && Object.keys(s.automatic).length === 0)).toBe(true); // no invented quotes
    expect(exchangeSettingsSchema.safeParse({ ...settings, activeRateSetId: "nope" }).success).toBe(false);
    expect(exchangeSettingsSchema.safeParse({ ...settings, rateSets: [...settings.rateSets, settings.rateSets[0]] }).success).toBe(false);
    expect(financialSettingsSchema.safeParse({ ...DEFAULT_FINANCIAL_SETTINGS, exchange: settings }).success).toBe(true);
    expect(financialSettingsSchema.safeParse(DEFAULT_FINANCIAL_SETTINGS).success).toBe(true); // 2.3.0 settings still valid
  });
  it("enabled currencies always include the primary, first", () => {
    expect(enabledCurrencies({ ...defaultExchangeSettings("ARS"), enabledCurrencies: ["EUR", "USD"] }, "ARS")).toEqual(["ARS", "USD", "EUR"]);
  });
});

describe("conversion snapshot stored on a transaction", () => {
  const snapshot = buildConversion({ amount: 100_00, from: "USD", to: "ARS", rate: "1450", mode: "manual", rateSetId: "oficial", source: "manual", rateAt: AT, overridden: false })!;
  const tx = {
    id: "01936a5e-0000-7000-8000-000000000001",
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    rev: 1,
    deviceId: "dev-EJEMPLO",
    type: "expense",
    description: "EJEMPLO-FICTICIO compra en dólares",
    amount: 100_00,
    currency: "USD",
    categoryId: null,
    accountId: "01936a5e-0000-7000-8000-000000000015",
    destinationAccountId: null,
    cardId: null,
    date: "2026-11-24",
    status: "completed",
    notes: null,
    billId: null,
    recurrenceId: null,
  };
  it("keeps original amount, currency, rate, converted, mode, source, time and override flag", () => {
    expect(snapshot).toEqual({ from: "USD", to: "ARS", amount: 100_00, converted: 145_000_00, rate: "1450", mode: "manual", rateSetId: "oficial", source: "manual", rateAt: AT, overridden: false });
    expect(transactionSchema.safeParse({ ...tx, conversion: snapshot }).success).toBe(true);
    expect(transactionSchema.safeParse(tx).success).toBe(true); // optional: 2.3.0 transactions stay valid
  });
  it("refuses an inconsistent snapshot", () => {
    expect(conversionSnapshotSchema.safeParse({ ...snapshot, converted: 145_000_01 }).success).toBe(false);
    expect(conversionSnapshotSchema.safeParse({ ...snapshot, to: "USD" }).success).toBe(false);
    expect(conversionSnapshotSchema.safeParse({ ...snapshot, mode: "custom" }).success).toBe(false); // custom must be an override
    expect(transactionSchema.safeParse({ ...tx, conversion: { ...snapshot, from: "EUR" } }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...tx, amount: 200_00, conversion: snapshot }).success).toBe(false);
    expect(buildConversion({ ...snapshot, amount: 0 })).toBeNull();
    expect(buildConversion({ ...snapshot, to: "USD" })).toBeNull();
  });
});

describe("planConversion — what the transaction form stores", () => {
  const ctx: ExchangeContext = { primary: "ARS", exchange: { ...defaultExchangeSettings("ARS"), enabledCurrencies: ["ARS", "USD", "EUR"], rateSets: [ars, { ...ars, id: "mep", name: "MEP", kind: "mep", manual: { USD: q("1500") } }] } };
  const now = new Date("2026-11-24T18:00:00Z");
  it("current: the active set's rate; none needed for the primary currency", () => {
    const p = planConversion({ amount: 100_00, from: "USD", ctx, choice: "current", customRate: "", now });
    expect(p).toMatchObject({ kind: "ok", snapshot: { rate: "1450", converted: 145_000_00, mode: "manual", rateSetId: "oficial", overridden: false } });
    expect(planConversion({ amount: 100_00, from: "ARS", ctx, choice: "current", customRate: "", now })).toEqual({ kind: "not-needed" });
    const mep = planConversion({ amount: 100_00, from: "USD", ctx: { ...ctx, exchange: { ...ctx.exchange, activeRateSetId: "mep" } }, choice: "current", customRate: "", now });
    expect(mep).toMatchObject({ kind: "ok", snapshot: { rate: "1500", rateSetId: "mep" } });
  });
  it("custom: a typed rate is an override with source user", () => {
    const p = planConversion({ amount: 100_00, from: "USD", ctx, choice: "custom", customRate: "1.475,5", now });
    expect(p).toMatchObject({ kind: "ok", snapshot: { rate: "1475.5", converted: 147_550_00, mode: "custom", source: "user", rateSetId: null, overridden: true } });
    expect(planConversion({ amount: 100_00, from: "USD", ctx, choice: "custom", customRate: "0", now })).toEqual({ kind: "error", error: "rate-zero" });
    expect(planConversion({ amount: 100_00, from: "USD", ctx, choice: "custom", customRate: "", now })).toEqual({ kind: "error", error: "rate-empty" });
  });
  it("stored: an edit keeps the recorded rate and time even after rates changed", () => {
    const stored = buildConversion({ amount: 100_00, from: "USD", to: "ARS", rate: "1200", mode: "manual", rateSetId: "oficial", source: "manual", rateAt: "2026-01-02T10:00:00-03:00", overridden: false })!;
    const p = planConversion({ amount: 120_00, from: "USD", ctx, choice: "stored", customRate: "", stored, now });
    expect(p).toMatchObject({ kind: "ok", snapshot: { rate: "1200", converted: 144_000_00, rateAt: "2026-01-02T10:00:00-03:00" } });
  });
  it("no rate loaded: nothing is invented", () => {
    expect(planConversion({ amount: 100_00, from: "GBP", ctx, choice: "current", customRate: "", now })).toEqual({ kind: "no-rate" });
  });
  it("settings without exchange (2.3.0) get empty defaults", () => {
    const c = exchangeContextOf(DEFAULT_FINANCIAL_SETTINGS);
    expect(c.primary).toBe("ARS");
    expect(planConversion({ amount: 100_00, from: "USD", ctx: c, choice: "current", customRate: "", now })).toEqual({ kind: "no-rate" });
  });
});

describe("consolidate — multi-currency balances in the primary currency", () => {
  it("sums each currency first, converts once, reports missing rates", () => {
    const total = consolidate(
      [
        { amount: 500_000_00, currency: "ARS" },
        { amount: 1_000_00, currency: "USD" },
        { amount: 333, currency: "USD" },
        { amount: 200_00, currency: "EUR" },
        { amount: 50_00, currency: "GBP" },
      ],
      "ARS",
      ars,
      "manual",
    );
    expect(total.byCurrency).toEqual({ ARS: 500_000_00, USD: 1_003_33, EUR: 200_00, GBP: 50_00 });
    // 500.000 + 1.003,33 × 1.450 (= 1.454.828,50) + 200 × 1.600 (= 320.000)
    expect(total.total).toBe(500_000_00 + 1_454_828_50 + 320_000_00);
    expect(total.missing).toEqual(["GBP"]);
    expect(total.estimated).toBe(true);
    expect(Object.keys(total.rates)).toEqual(["USD", "EUR"]);
  });
  it("one currency only: exact, not an estimate", () => {
    const total = consolidate([{ amount: 10, currency: "ARS" }], "ARS", ars, "manual");
    expect(total).toMatchObject({ total: 10, estimated: false, missing: [] });
  });
  it("negative balances keep their sign", () => {
    expect(consolidate([{ amount: -100_00, currency: "USD" }], "ARS", ars, "manual").total).toBe(-145_000_00);
  });
});

describe("money per currency", () => {
  it("formats each currency with its symbol and minor digits", () => {
    expect(formatMoney(123_456, { currency: "EUR" })).toBe("€ 1.234,56");
    expect(formatMoney(1234, { currency: "CLP" })).toBe("CLP$ 1.234");
    expect(formatMoney(1234, { currency: "PYG" })).toBe("₲ 1.234");
    expect(formatMoney(123_456, { currency: "BRL" })).toBe("R$ 1.234,56");
  });
  it("parses by currency: CLP and PYG take no decimals", () => {
    expect(parseMoneyInput("1.234", { currency: "CLP" })).toEqual({ ok: true, value: 1234 });
    expect(parseMoneyInput("1.234,5", { currency: "CLP" })).toEqual({ ok: false, error: "too-many-decimals" });
    expect(parseMoneyInput("€ 1.234,56", { currency: "EUR" })).toEqual({ ok: true, value: 123_456 });
    expect(parseMoneyInput("EUR 10", { currency: "EUR" })).toEqual({ ok: true, value: 1000 });
    expect(parseMoneyInput("CLP$ 1.234", { currency: "CLP" })).toEqual({ ok: true, value: 1234 });
    expect(parseMoneyInput(formatMoney(98_765, { currency: "UYU" }), { currency: "UYU" })).toEqual({ ok: true, value: 98_765 });
  });
});

describe("automatic provider (DolarApi) — optional, never required", () => {
  const settings = (over: Partial<ExchangeSettings> = {}): ExchangeSettings => ({
    ...defaultExchangeSettings("ARS"),
    enabledCurrencies: ["ARS", "USD", "EUR", "GBP"],
    rateSets: [ars, { ...ars, id: "mep", name: "MEP", kind: "mep" }],
    providerEnabled: true,
    ...over,
  });
  const reply = (venta: unknown, ok = true): ReturnType<FetchLike> => Promise.resolve({ ok, json: () => Promise.resolve({ compra: 1, venta, casa: "x", nombre: "x", moneda: "x", fechaActualizacion: "2026-11-24T18:00:00.000Z" }) });

  it("stores provider quotes apart from the manual ones", async () => {
    const fetch = vi.fn<FetchLike>((url) => reply(url.endsWith("/dolares/oficial") ? 1480.5 : 1610));
    const out = await refreshFromProvider(settings(), { fetch });
    expect(fetch).toHaveBeenCalledTimes(2); // USD + EUR; GBP has no source
    expect(out.updated).toEqual(["EUR", "USD"]);
    const set = out.settings.rateSets[0]!;
    expect(set.automatic.USD).toEqual({ rate: "1480.5", source: "dolarapi", updatedAt: "2026-11-24T15:00:00-03:00" });
    expect(set.manual.USD).toEqual(ars.manual.USD); // untouched
    expect(exchangeSettingsSchema.safeParse(out.settings).success).toBe(true);
  });
  it("uses the MEP endpoint for a MEP set and only USD there", async () => {
    const fetch = vi.fn<FetchLike>(() => reply(1500));
    await refreshFromProvider(settings({ activeRateSetId: "mep" }), { fetch });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(["https://dolarapi.com/v1/dolares/bolsa"]);
  });
  it("failure, timeout or bad data: nothing changes, manual rates keep working", async () => {
    for (const fetch of [
      vi.fn<FetchLike>(() => Promise.reject(new Error("offline"))),
      vi.fn<FetchLike>(() => reply(1450, false)),
      vi.fn<FetchLike>(() => reply("1450")),
      vi.fn<FetchLike>(() => reply(-3)),
    ]) {
      const s = settings();
      const out = await refreshFromProvider(s, { fetch });
      expect(out.updated).toEqual([]);
      expect(out.settings).toBe(s);
      expect(resolveRate(out.settings.rateSets[0]!, "USD", "ARS", "automatic")).toMatchObject({ rate: "1450", fellBack: true });
    }
  });
  it("aborts a slow provider", async () => {
    const fetch = vi.fn<FetchLike>((_url, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const out = await refreshFromProvider(settings(), { fetch, timeoutMs: 5 });
    expect(out.failed).toEqual(["EUR", "USD"]);
  });
  it("is never called when disabled, nor for a set whose base is not ARS", async () => {
    const fetch = vi.fn<FetchLike>(() => reply(1));
    await refreshFromProvider(settings({ providerEnabled: false }), { fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(providerSupports({ ...ars, base: "USD" }, "EUR")).toBe(false);
  });
});

describe("Settings draft → settings", () => {
  it("keeps a quote's date when its rate did not change; dates a changed one; refuses bad rates", () => {
    const base = { ...DEFAULT_FINANCIAL_SETTINGS, exchange: { ...defaultExchangeSettings("ARS"), rateSets: [ars] } };
    const draft = { primary: "ARS" as const, enabled: ["ARS", "USD", "EUR"] as const, defaultMode: "manual" as const, activeId: "oficial", providerEnabled: false, sets: [{ set: ars, manualText: { USD: "1.450", EUR: "1.650,5" } }] };
    const r = draftToSettings({ ...draft, enabled: [...draft.enabled] }, base, new Date("2026-11-25T12:00:00Z"));
    expect("settings" in r).toBe(true);
    if (!("settings" in r)) return;
    const set = r.settings.exchange!.rateSets[0]!;
    expect(set.manual.USD).toEqual(ars.manual.USD);
    expect(set.manual.EUR).toEqual({ rate: "1650.5", source: "manual", updatedAt: "2026-11-25T09:00:00-03:00" });
    expect(set.manual.CLP).toBeUndefined(); // not typed → removed, never kept as an invented value
    const bad = draftToSettings({ ...draft, enabled: [...draft.enabled], sets: [{ set: ars, manualText: { USD: "0" } }] }, base, new Date());
    expect(bad).toEqual({ errors: { "oficial:USD": "La cotización tiene que ser mayor que cero." } });
  });
});
