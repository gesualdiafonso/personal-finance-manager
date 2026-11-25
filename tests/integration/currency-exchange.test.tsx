import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { buildConversion, defaultExchangeSettings, type ExchangeSettings, type RateSet } from "@/domain/fx";
import type { Transaction } from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { AccountsPage } from "@/features/accounts/accounts-page";
import { loadAccountsView } from "@/features/accounts/data";
import { loadDashboard } from "@/features/dashboard/data";
import { CurrencySettings } from "@/features/exchange/currency-settings";
import { NEW_TRANSACTION_EVENT } from "@/features/transactions/new-transaction";
import { TransactionsPage } from "@/features/transactions/transactions-page";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import { AppError } from "@/lib/errors/app-error";
import { dataSetToFiles, validateDataFiles } from "@/services/data/dataset";
import { exportData } from "@/services/exchange/exchange";
import { createRepositories, type Input } from "@/services/repositories/repositories";
import { getFinancialSettings, importPublication, saveFinancialSettings } from "@/services/storage/local-store";
import { samplePublication } from "../helpers/sample-data";

/**
 * Multi-currency through IndexedDB, the repositories and the screens (Step 10 addendum).
 * Every account, movement and quotation is FICTITIOUS (EJEMPLO-FICTICIO).
 */
const AT = "2026-11-24T09:00:00-03:00";
const oficial = (manual: RateSet["manual"]): RateSet => ({ id: "oficial", name: "Oficial", kind: "official", base: "ARS", manual, automatic: {} });
const q = (rate: string, updatedAt = AT) => ({ rate, updatedAt, source: "manual" as const });

async function configure(manual: RateSet["manual"], over: Partial<ExchangeSettings> = {}) {
  const exchange: ExchangeSettings = { ...defaultExchangeSettings("ARS"), enabledCurrencies: ["ARS", "USD", "EUR"], rateSets: [oficial(manual), { id: "mep", name: "MEP", kind: "mep", base: "ARS", manual: {}, automatic: {} }], ...over };
  await saveFinancialSettings(await getLocalDb(), { ...DEFAULT_FINANCIAL_SETTINGS, exchange });
}
const account = (name: string, currency: "ARS" | "USD" | "EUR", initialBalance: number) =>
  mutate((r) => r.accounts.create({ name, institution: null, accountType: "checking", currency, initialBalance, openingDate: null, status: "active" }));
const expense = (accountId: string, amount: number, currency: Input<"transactions">["currency"], over: Partial<Input<"transactions">> = {}): Input<"transactions"> => ({
  type: "expense",
  description: "EJEMPLO-FICTICIO compra",
  amount,
  currency,
  categoryId: null,
  accountId,
  destinationAccountId: null,
  cardId: null,
  date: "2026-11-24" as Input<"transactions">["date"],
  status: "completed",
  notes: null,
  billId: null,
  recurrenceId: null,
  ...over,
});
const stored = async () => ((await (await getLocalDb()).getAll("transactions")) as Transaction[]).filter((t) => t.deletedAt === null);

describe("repository: the conversion is history", () => {
  it("stores the snapshot and never recalculates it when rates change", async () => {
    await configure({ USD: q("1450") });
    const usd = await account("EJEMPLO-FICTICIO Dólares", "USD", 0);
    const conversion = buildConversion({ amount: 100_00, from: "USD", to: "ARS", rate: "1450", mode: "manual", rateSetId: "oficial", source: "manual", rateAt: AT, overridden: false })!;
    const tx = await mutate((r) => r.transactions.create(expense(usd.id, 100_00, "USD", { conversion })));
    expect(tx.amount).toBe(100_00); // the original is never overwritten
    expect(tx.currency).toBe("USD");

    await configure({ USD: q("2000", "2026-11-25T09:00:00-03:00") }); // the rate moves
    const [after] = await stored();
    expect(after!.conversion).toEqual(conversion);
    expect(after!.conversion!.converted).toBe(145_000_00);

    // An edit that keeps the snapshot (e.g. notes) leaves it as it was.
    const edited = await mutate((r) => r.transactions.update(tx.id, { notes: "EJEMPLO-FICTICIO nota" }, tx.rev));
    expect(edited.conversion).toEqual(conversion);
  });

  it("refuses inconsistent or silently dropped conversions", async () => {
    const usd = await account("EJEMPLO-FICTICIO Dólares", "USD", 0);
    const good = buildConversion({ amount: 100_00, from: "USD", to: "ARS", rate: "1450", mode: "manual", rateSetId: "oficial", source: "manual", rateAt: AT, overridden: false })!;
    const repos = createRepositories({ db: await getLocalDb() });
    await expect(repos.transactions.create(expense(usd.id, 100_00, "USD", { conversion: { ...good, converted: 1 } }))).rejects.toBeInstanceOf(AppError);
    await expect(repos.transactions.create(expense(usd.id, 200_00, "USD", { conversion: good }))).rejects.toBeInstanceOf(AppError);
    const tx = await mutate((r) => r.transactions.create(expense(usd.id, 100_00, "USD", { conversion: good })));
    await expect(mutate((r) => r.transactions.update(tx.id, { conversion: undefined }, tx.rev))).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    // A deliberate new estimate (custom rate) replaces it, recorded as an override.
    const custom = buildConversion({ amount: 100_00, from: "USD", to: "ARS", rate: "1500", mode: "custom", rateSetId: null, source: "user", rateAt: AT, overridden: true })!;
    const updated = await mutate((r) => r.transactions.update(tx.id, { conversion: custom }, tx.rev));
    expect(updated.conversion).toMatchObject({ mode: "custom", overridden: true, converted: 150_000_00 });
  });

  it("settings are validated before they are stored", async () => {
    await expect(saveFinancialSettings(await getLocalDb(), { ...DEFAULT_FINANCIAL_SETTINGS, exchange: { ...defaultExchangeSettings(), activeRateSetId: "x" } })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("official data: export, import, older publications", () => {
  it("exports conversions and exchange settings and reads them back as valid 2.4.0 data", async () => {
    await configure({ USD: q("1450") });
    const usd = await account("EJEMPLO-FICTICIO Dólares", "USD", 0);
    const conversion = buildConversion({ amount: 100_00, from: "USD", to: "ARS", rate: "1450", mode: "manual", rateSetId: "oficial", source: "manual", rateAt: AT, overridden: false })!;
    await mutate((r) => r.transactions.create(expense(usd.id, 100_00, "USD", { conversion })));
    const file = await exportData(await getLocalDb());
    expect(file.schemaVersion).toBe("2.4.0");
    expect(file.settings?.exchange?.rateSets[0]?.manual.USD?.rate).toBe("1450");
    const txs = (file.records.transactions ?? []) as Transaction[];
    expect(txs.find((t) => t.currency === "USD")?.conversion).toEqual(conversion);
  });

  it("a publication without exchange settings keeps the device's rate sets", async () => {
    await configure({ USD: q("1450") });
    const { dataSet, files } = await samplePublication(3);
    expect(dataSet.settings.exchange).toBeUndefined();
    await importPublication(await getLocalDb(), dataSet, files);
    expect((await getFinancialSettings(await getLocalDb()))?.exchange?.rateSets[0]?.manual.USD?.rate).toBe("1450");
  });

  it("2.3.0 data (no conversions, no exchange) is valid 2.4.0 data", async () => {
    const { dataSet } = await samplePublication(2);
    const files = dataSetToFiles(dataSet, "2.3.0");
    expect(validateDataFiles(files).issues).toEqual([]);
  });
});

describe("accounts and dashboard: original balances + approximate equivalents", () => {
  it("shows each balance in its own currency and an estimate in the primary one", async () => {
    await configure({ USD: q("1450"), EUR: q("1600") });
    await account("EJEMPLO-FICTICIO Pesos", "ARS", 500_000_00);
    await account("EJEMPLO-FICTICIO Dólares", "USD", 1_000_00);
    await account("EJEMPLO-FICTICIO Euros", "EUR", 200_00);
    const view = await loadAccountsView(await getLocalDb());
    const usd = view.active.find((r) => r.account.currency === "USD")!;
    expect(usd.balance).toEqual({ amount: 1_000_00, currency: "USD" });
    expect(usd.approx).toBe(1_450_000_00);
    expect(view.active.find((r) => r.account.currency === "ARS")!.approx).toBeUndefined();
    expect(view.consolidated).toMatchObject({ currency: "ARS", total: 500_000_00 + 1_450_000_00 + 320_000_00, missing: [], estimated: true });

    const dashboard = await loadDashboard(await getLocalDb(), new Date("2026-11-24T15:00:00Z"));
    expect(dashboard.form.exchange.primary).toBe("ARS");

    render(<AccountsPage />);
    const summary = await screen.findByTestId("consolidated-estimate");
    expect(summary).toHaveTextContent("Total estimado en ARS");
    expect(summary).toHaveTextContent("2.270.000");
    expect(summary).toHaveTextContent("USD 1.450");
    expect(screen.getAllByTestId("approx-money").length).toBeGreaterThan(0);
  });

  it("a currency without a rate is listed apart, never guessed", async () => {
    await configure({ USD: q("1450") });
    await account("EJEMPLO-FICTICIO Pesos", "ARS", 100_00);
    await account("EJEMPLO-FICTICIO Euros", "EUR", 200_00);
    const view = await loadAccountsView(await getLocalDb());
    expect(view.consolidated).toMatchObject({ total: 100_00, missing: ["EUR"], estimated: false });
    expect(view.active.find((r) => r.account.currency === "EUR")!.approx).toBeNull();
  });
});

describe("transaction form: live estimate stored with the movement", () => {
  async function openForm() {
    render(<TransactionsPage />);
    await waitFor(() => expect(screen.queryByTestId("transactions-loading")).not.toBeInTheDocument());
    window.dispatchEvent(new Event(NEW_TRANSACTION_EVENT));
    return screen.findByRole("form", { name: "Nueva transacción" });
  }

  it("uses the active rate, or a custom one typed for the movement", async () => {
    await configure({ USD: q("1450") });
    const usd = await account("EJEMPLO-FICTICIO Dólares", "USD", 0);
    const u = userEvent.setup();
    let form = await openForm();
    await u.selectOptions(within(form).getByLabelText("Cuenta"), usd.id);
    await u.type(within(form).getByLabelText("Importe"), "100");
    expect(within(form).getByTestId("conversion-result")).toHaveTextContent("145.000");
    await u.type(within(form).getByLabelText("Descripción"), "EJEMPLO-FICTICIO compra");
    await u.click(within(form).getByRole("button", { name: /Guardar/ }));
    await waitFor(async () => expect(await stored()).toHaveLength(1));
    expect((await stored())[0]).toMatchObject({ amount: 100_00, currency: "USD", conversion: { converted: 145_000_00, rate: "1450", mode: "manual", overridden: false } });

    form = await openForm();
    await u.selectOptions(within(form).getByLabelText("Cuenta"), usd.id);
    await u.type(within(form).getByLabelText("Importe"), "10");
    await u.selectOptions(within(form).getByLabelText("Cotización a usar"), "custom");
    await u.type(within(form).getByLabelText(/Cotización \(1 USD en ARS\)/), "1.500");
    expect(within(form).getByTestId("conversion-result")).toHaveTextContent("15.000");
    await u.type(within(form).getByLabelText("Descripción"), "EJEMPLO-FICTICIO otra");
    await u.click(within(form).getByRole("button", { name: /Guardar/ }));
    await waitFor(async () => expect(await stored()).toHaveLength(2));
    expect((await stored()).find((t) => t.amount === 10_00)?.conversion).toMatchObject({ rate: "1500", mode: "custom", source: "user", overridden: true, converted: 15_000_00 });
  });

  it("without a loaded rate the movement saves without an estimate", async () => {
    const usd = await account("EJEMPLO-FICTICIO Dólares", "USD", 0);
    const u = userEvent.setup();
    const form = await openForm();
    await u.selectOptions(within(form).getByLabelText("Cuenta"), usd.id);
    await u.type(within(form).getByLabelText("Importe"), "5");
    expect(within(form).getByTestId("conversion-result")).toHaveTextContent("No hay cotización de USD cargada");
    await u.type(within(form).getByLabelText("Descripción"), "EJEMPLO-FICTICIO sin cotización");
    await u.click(within(form).getByRole("button", { name: /Guardar/ }));
    await waitFor(async () => expect(await stored()).toHaveLength(1));
    expect((await stored())[0]!.conversion).toBeUndefined();
  });
});

describe("Settings → Moneda y cambio", () => {
  it("edits rates, persists them and converts live", async () => {
    const u = userEvent.setup();
    render(<CurrencySettings />);
    const section = await screen.findByTestId("currency-settings");
    const usd = await within(section).findByLabelText("1 USD en ARS", { selector: "input[name='quote-oficial-USD']" });
    await u.type(usd, "1.450,50");
    await u.click(within(section).getByRole("button", { name: "Guardar configuración" }));
    await waitFor(async () => expect((await getFinancialSettings(await getLocalDb()))?.exchange?.rateSets[0]?.manual.USD?.rate).toBe("1450.5"));

    const converter = await within(section).findByTestId("fx-converter");
    await waitFor(() => expect(within(converter).getByLabelText("Cotización")).toHaveValue("1.450,5"));
    const amount = within(converter).getByLabelText("Monto (USD)");
    await u.clear(amount);
    await u.type(amount, "100");
    expect(within(converter).getByTestId("fx-converter-result")).toHaveTextContent("145.050");
    expect(within(converter).getByTestId("fx-converter-result")).toHaveTextContent("Estimado (Manual)");
    const rate = within(converter).getByLabelText("Cotización");
    await u.clear(rate);
    await u.type(rate, "1.000");
    expect(within(converter).getByTestId("fx-converter-result")).toHaveTextContent("100.000");
    expect(within(converter).getByTestId("fx-converter-result")).toHaveTextContent("Personalizada");
    await u.click(within(converter).getByRole("button", { name: "Invertir monedas" }));
    expect(within(converter).getByLabelText("Monto (ARS)")).toBeInTheDocument();
  });

  it("refuses an invalid rate without saving", async () => {
    const u = userEvent.setup();
    render(<CurrencySettings />);
    const section = await screen.findByTestId("currency-settings");
    await u.type(await within(section).findByLabelText("1 USD en ARS", { selector: "input[name='quote-oficial-USD']" }), "0");
    await u.click(within(section).getByRole("button", { name: "Guardar configuración" }));
    expect(await within(section).findByText("La cotización tiene que ser mayor que cero.")).toBeInTheDocument();
    expect((await getFinancialSettings(await getLocalDb()))?.exchange).toBeUndefined();
  });
});
