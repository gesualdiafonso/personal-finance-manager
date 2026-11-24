import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportsPage } from "@/features/reports/reports-page";
import { loadReports } from "@/features/reports/data";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import { toLocalDate, type LocalDate } from "@/lib/formatting/date";
import type { Input } from "@/services/repositories/repositories";

/** Informes through the real repositories and IndexedDB (Step 08). Fictitious data only. */
const today = () => toLocalDate(new Date()) as LocalDate;

async function account(name: string, currency: "ARS" | "USD", initialBalance: number) {
  return mutate((r) => r.accounts.create({ name, institution: null, accountType: "checking", currency, initialBalance, openingDate: null, status: "active" }));
}
function movement(accountId: string, over: Partial<Input<"transactions">>): Promise<unknown> {
  return mutate((r) =>
    r.transactions.create({
      type: "expense",
      description: "EJEMPLO-FICTICIO",
      amount: 10_000,
      currency: "ARS",
      categoryId: null,
      accountId,
      destinationAccountId: null,
      cardId: null,
      date: today(),
      status: "completed",
      notes: null,
      billId: null,
      recurrenceId: null,
      ...over,
    }),
  );
}

async function openPage() {
  const view = render(<ReportsPage />);
  await waitFor(() => expect(screen.queryByTestId("reports-loading")).not.toBeInTheDocument());
  return view;
}

async function seed() {
  const pesos = await account("EJEMPLO-FICTICIO Pesos", "ARS", 100_000);
  const ahorro = await account("EJEMPLO-FICTICIO Ahorro", "ARS", 0);
  const dolares = await account("EJEMPLO-FICTICIO Dólares", "USD", 50_000);
  const card = await mutate((r) =>
    r.cards.create({ accountId: pesos.id, name: "EJEMPLO-FICTICIO Visa", cardType: "credit", lastFourDigits: "4242", creditLimit: 100_000, closingDay: 20, dueDay: 5, currency: "ARS", status: "active" }),
  );
  await movement(pesos.id, { type: "income", amount: 40_000, description: "EJEMPLO-FICTICIO Cobro" });
  await movement(pesos.id, { amount: 15_000, description: "EJEMPLO-FICTICIO Super" });
  await movement(pesos.id, { amount: 8_000, cardId: card.id, description: "EJEMPLO-FICTICIO Compra con tarjeta" });
  await movement(pesos.id, { type: "transfer", amount: 20_000, destinationAccountId: ahorro.id, description: "EJEMPLO-FICTICIO A ahorro" });
  await movement(pesos.id, { amount: 3_000, status: "pending", description: "EJEMPLO-FICTICIO Pendiente" });
  const cancelled = (await movement(pesos.id, { amount: 99_000, description: "EJEMPLO-FICTICIO Cancelada" })) as { id: string; rev: number };
  await mutate((r) => r.transactions.update(cancelled.id, { status: "cancelled" }, 1));
  await movement(dolares.id, { amount: 1_000, currency: "USD", description: "EJEMPLO-FICTICIO Hosting" });
  const goal = await mutate((r) =>
    r.goals.create({ name: "EJEMPLO-FICTICIO Meta", description: null, kind: "other", amount: 1_000_000, initialAmount: 0, currency: "ARS", startDate: today(), targetDate: null, status: "active", completedAt: null, archivedAt: null }),
  );
  await mutate((r) =>
    r.goalContributions.create({ goalId: goal.id, amount: 500_000, currency: "ARS", date: today(), description: null, accountId: pesos.id, transactionId: null, cancelledAt: null }),
  );
  return { pesos, ahorro, dolares, card };
}

describe("Informes page", () => {
  it("empty state on first use says what to do next", async () => {
    await openPage();
    expect(screen.getByTestId("reports-empty")).toHaveTextContent("Todavía no hay datos para analizar.");
    expect(screen.queryByTestId("report-export")).not.toBeInTheDocument();
  });

  it("income and expenses: completed only, currencies apart, no transfers, cancelled or goal contributions; card purchase counted once", async () => {
    await seed();
    await openPage();
    const statement = within(screen.getByTestId("income-expenses"));
    const table = within(statement.getByRole("table"));
    // 40.000 income; 15.000 + 8.000 (credit purchase, once) expenses; the 500.000 contribution is not income.
    expect(table.getByRole("row", { name: /^Ingresos/ })).toHaveTextContent("+$ 400");
    expect(table.getByRole("row", { name: /^Gastos/ })).toHaveTextContent("−$ 230");
    expect(table.getByRole("row", { name: /^Resultado/ })).toHaveTextContent("$ 170");
    expect(screen.getByTestId("pending-note")).toHaveTextContent("$ 30 de gastos");
    expect(screen.getByTestId("income-expenses")).not.toHaveTextContent("990");

    // USD is a separate report, never added.
    await userEvent.click(within(screen.getByTestId("report-currency")).getByRole("button", { name: "USD" }));
    expect(within(within(screen.getByTestId("income-expenses")).getByRole("table")).getByRole("row", { name: /^Gastos/ })).toHaveTextContent("−US$ 10");
  });

  it("each section renders from the same data: cash flow, categories, accounts, cards, budgets and goals", async () => {
    const u = userEvent.setup();
    const { pesos } = await seed();
    await openPage();

    await u.click(screen.getByRole("tab", { name: "Flujo de caja" }));
    // Out of the accounts: only the 15.000 (the credit purchase stays on the card); the internal transfer cancels out.
    expect(screen.getByTestId("cf-inflow")).toHaveTextContent("+$ 400");
    expect(screen.getByTestId("cf-outflow")).toHaveTextContent("−$ 150");
    expect(screen.getByTestId("cf-closing")).toHaveTextContent("$ 1.250");
    expect(screen.getByTestId("expected")).toHaveTextContent("Gastos pendientes");

    await u.click(screen.getByRole("tab", { name: "Categorías" }));
    expect(screen.getByTestId("categories-expense")).toHaveTextContent("Sin categoría");
    expect(within(screen.getByTestId("categories-expense")).getByTestId("category-share")).toHaveTextContent("100,0 % del total");

    await u.click(screen.getByRole("tab", { name: "Cuentas" }));
    const accounts = screen.getAllByTestId("account-report");
    const main = accounts.find((a) => a.textContent?.includes("EJEMPLO-FICTICIO Pesos"))!;
    expect(within(main).getByTestId("account-expenses")).toHaveTextContent("−$ 150");
    expect(within(main).getByTestId("account-credit")).toHaveTextContent("$ 80");

    await u.click(screen.getByRole("tab", { name: "Tarjetas" }));
    expect(screen.getByTestId("card-purchases")).toHaveTextContent("$ 80");
    expect(screen.getByTestId("card-committed")).toHaveTextContent("$ 80");
    expect(screen.getByTestId("card-utilization")).toHaveTextContent("8 %");
    expect(screen.getByTestId("payments-note")).toHaveTextContent("OD-8");

    await u.click(screen.getByRole("tab", { name: "Presupuestos" }));
    expect(screen.getByTestId("section-budgets")).toHaveTextContent("Ningún presupuesto en este período.");

    await u.click(screen.getByRole("tab", { name: "Metas" }));
    expect(screen.getByTestId("goal-contributed")).toHaveTextContent("$ 5.000");
    expect(screen.getByTestId("goal-pace")).toHaveTextContent("Datos insuficientes");

    // Account filter narrows the report to that account.
    await u.selectOptions(screen.getByLabelText("Cuenta"), pesos.id);
    await u.click(screen.getByRole("tab", { name: "Flujo de caja" }));
    expect(screen.getByTestId("cf-closing")).toHaveTextContent("$ 1.050");
  });

  it("filters: type, category and a past period with nothing to show; data changes re-read", async () => {
    const u = userEvent.setup();
    const { pesos } = await seed();
    await openPage();
    await u.selectOptions(screen.getByLabelText("Tipo"), "transfer");
    expect(screen.getByTestId("income-expenses")).toHaveTextContent("Las transferencias no son ingresos ni gastos");
    await u.click(screen.getByRole("button", { name: "Quitar filtros" }));
    await u.click(screen.getByRole("button", { name: "Año" }));
    await u.click(screen.getByRole("button", { name: "Período anterior" }));
    expect(screen.getByTestId("report-title")).toHaveTextContent(String(Number(today().slice(0, 4)) - 1));
    expect(screen.getByTestId("income-expenses")).toHaveTextContent("Sin movimientos en este período con estos filtros.");
    await u.click(screen.getByRole("button", { name: "Volver a hoy" }));
    await act(async () => {
      await movement(pesos.id, { amount: 5_000, description: "EJEMPLO-FICTICIO Farmacia" });
    });
    await waitFor(() =>
      expect(within(within(screen.getByTestId("income-expenses")).getByRole("table")).getByRole("row", { name: /^Gastos/ })).toHaveTextContent("−$ 280"),
    );
  });

  it("exports CSV and JSON locally (BOM, filters, currencies) with the plaintext warning, and prints every section", async () => {
    const u = userEvent.setup();
    await seed();
    await openPage();
    expect(screen.getByTestId("export-warning")).toHaveTextContent("no están cifrados");
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:local";
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await u.click(screen.getByRole("button", { name: "CSV de transacciones" }));
    await u.click(screen.getByRole("button", { name: "CSV del informe" }));
    await u.click(screen.getByRole("button", { name: "JSON" }));
    expect(create).toHaveBeenCalledTimes(3);
    expect(click).toHaveBeenCalledTimes(3);
    const [txCsv, summary, json] = await Promise.all(blobs.map((b) => b.text()));
    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    expect(txCsv).toContain("EJEMPLO-FICTICIO Super");
    expect(txCsv).not.toContain("EJEMPLO-FICTICIO Cancelada");
    expect(summary).toContain("Ingresos y gastos;USD;Gastos;;10,00;1000");
    const doc = JSON.parse(json!);
    expect(doc).toMatchObject({ format: "pfm.report", encrypted: false, currencies: ["ARS", "USD"], filters: { type: "all" } });
    expect(blobs[2]!.type).toContain("application/json");
    expect(fetchSpy).not.toHaveBeenCalled(); // nothing leaves the device
    expect(await screen.findByText(/Archivo generado: pfm-informe-.*-informe\.json/)).toBeInTheDocument();

    let printed: string[] = [];
    const print = vi.fn(() => {
      printed = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
      expect(screen.getByTestId("print-all")).toBeInTheDocument();
    });
    Object.defineProperty(window, "print", { configurable: true, value: print });
    await u.click(screen.getByRole("button", { name: "Imprimir o guardar PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(printed).toEqual(expect.arrayContaining(["Ingresos y gastos", "Flujo de caja", "Categorías", "Cuentas", "Tarjetas", "Presupuestos", "Metas"]));
    expect(screen.getByTestId("print-header")).toHaveTextContent("No está cifrado");
    expect(screen.queryByTestId("print-all")).not.toBeInTheDocument();
  });

  it("the loader never writes", async () => {
    await seed();
    const db = await getLocalDb();
    const before = await db.count("outbox");
    const data = await loadReports(db);
    expect(await db.count("outbox")).toBe(before);
    expect(data.empty).toBe(false);
    expect(data.contributions).toHaveLength(1);
  });
});
