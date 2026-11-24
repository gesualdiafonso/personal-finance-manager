import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TransactionsPage } from "@/features/transactions/transactions-page";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import { toLocalDate } from "@/lib/formatting/date";
import { unitOfWork } from "@/services/repositories/repositories";
import { importPublication } from "@/services/storage/local-store";
import { samplePublication, sampleId as ID } from "../helpers/sample-data";

/** The Transactions list over real IndexedDB data (sample publication, fictitious). */
const user = () => userEvent.setup();

async function openPage() {
  const view = render(<TransactionsPage />);
  await waitFor(() => expect(screen.queryByTestId("transactions-loading")).not.toBeInTheDocument());
  await screen.findByTestId("filters");
  return view;
}
async function withSample() {
  const { dataSet, files } = await samplePublication(2);
  await importPublication(await getLocalDb(), dataSet, files);
}
const rows = () => screen.queryAllByTestId("ledger-row");
const count = () => screen.getByTestId("results-count").textContent;
async function allHistory(u: ReturnType<typeof user>) {
  await u.selectOptions(screen.getByLabelText("Período"), "all");
  await waitFor(() => expect(count()).toBe("7 transacciones"));
}

describe("Transactions list", () => {
  it("reads only the selected period (this month by default)", async () => {
    const today = toLocalDate(new Date());
    const account = await mutate((r) => r.accounts.create({ name: "EJEMPLO-FICTICIO A", institution: null, accountType: "cash", currency: "ARS", initialBalance: 0, openingDate: null, status: "active" }));
    const base = { type: "expense" as const, currency: "ARS" as const, categoryId: null, accountId: account.id, destinationAccountId: null, cardId: null, status: "completed" as const, notes: null, billId: null, recurrenceId: null, amount: 100 };
    await mutate((r) => r.transactions.create({ ...base, description: "EJEMPLO-FICTICIO Hoy", date: today as never }));
    await mutate((r) => r.transactions.create({ ...base, description: "EJEMPLO-FICTICIO Viejo", date: "2020-01-15" as never }));
    const u = user();
    await openPage();
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("EJEMPLO-FICTICIO Hoy");
    await u.selectOptions(screen.getByLabelText("Período"), "all");
    await waitFor(() => expect(rows()).toHaveLength(2));
    await u.selectOptions(screen.getByLabelText("Período"), "custom");
    await u.type(screen.getByLabelText("Desde"), "2020-01-01");
    await u.type(screen.getByLabelText("Hasta"), "2020-01-31");
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("EJEMPLO-FICTICIO Viejo");
  });

  it("groups by day with the day's net and shows the Ledger columns", async () => {
    const u = user();
    await withSample();
    await openPage();
    await allHistory(u);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Fecha", "Descripción", "Cuenta", "Estado", "Valor"]);
    expect(screen.getAllByTestId("ledger-day").length).toBeGreaterThan(1);
    const transfer = rows().find((r) => within(r).queryByText(/Transferencia salida/))!;
    expect(transfer).toHaveTextContent("EJEMPLO-FICTICIO Cuenta A → EJEMPLO-FICTICIO Cuenta B");
    const credit = rows().find((r) => within(r).queryByText(/Compra con tarjeta/))!;
    expect(credit).toHaveTextContent("Tarjeta de crédito");
  });

  it("summary per currency matches what is listed, and follows the filters", async () => {
    const u = user();
    await withSample();
    await openPage();
    await allHistory(u);
    const ars = screen.getByTestId("summary-ARS");
    expect(within(ars).getByLabelText("+$ 3.450.000")).toBeInTheDocument(); // income
    expect(within(ars).getByLabelText("−$ 60.450")).toBeInTheDocument(); // 42.310 + 18.140, transfer excluded
    expect(screen.getByTestId("summary-USD")).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText("Moneda"), "USD");
    await waitFor(() => expect(count()).toBe("1 transacción"));
    expect(screen.queryByTestId("summary-ARS")).not.toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText("Moneda"), "all");
    await u.selectOptions(screen.getByLabelText("Estado"), "pending");
    await waitFor(() => expect(count()).toBe("1 transacción"));
    expect(within(screen.getByTestId("summary-ARS")).getAllByLabelText("−$ 5.000")).toHaveLength(2); // expenses and net
    expect(screen.getByTestId("transactions-summary")).toHaveTextContent("Movimientos pendientes");
  });

  it("search waits for typing to stop, ignores accents and combines with filters", async () => {
    const u = user();
    await withSample();
    await openPage();
    await allHistory(u);
    await u.type(screen.getByLabelText("Buscar"), "verduleria");
    await waitFor(() => expect(count()).toBe("1 transacción"));
    await u.clear(screen.getByLabelText("Buscar"));
    await u.type(screen.getByLabelText("Buscar"), "compra");
    await waitFor(() => expect(count()).toBe("3 transacciones"));
    await u.selectOptions(screen.getByLabelText("Estado"), "completed");
    await waitFor(() => expect(count()).toBe("2 transacciones"));
    await u.selectOptions(screen.getByLabelText("Tarjeta"), ID(6));
    await waitFor(() => expect(count()).toBe("1 transacción"));
    await u.selectOptions(screen.getByLabelText("Tipo"), "income");
    await waitFor(() => expect(screen.getByTestId("transactions-no-results")).toBeInTheDocument());
    await u.click(screen.getAllByRole("button", { name: "Quitar filtros" })[0]!);
    expect(screen.getByLabelText("Buscar")).toHaveValue("");
    expect(screen.getByLabelText("Período")).toHaveValue("month");
  });

  it("filters by account (both sides of a transfer) and by parent category", async () => {
    const u = user();
    await withSample();
    await openPage();
    await allHistory(u);
    await u.selectOptions(screen.getByLabelText("Cuenta"), ID(2));
    await waitFor(() => expect(count()).toBe("1 transacción"));
    await u.selectOptions(screen.getByLabelText("Cuenta"), "");
    await u.selectOptions(screen.getByLabelText("Categoría"), ID(3));
    await waitFor(() => expect(count()).toBe("3 transacciones"));
  });

  it("sorts without changing the stored data", async () => {
    const u = user();
    await withSample();
    await openPage();
    await allHistory(u);
    const before = JSON.stringify(await (await getLocalDb()).getAll("transactions"));
    await u.selectOptions(screen.getByLabelText("Ordenar"), "amountDesc");
    await waitFor(() => expect(rows()[0]).toHaveTextContent("EJEMPLO-FICTICIO Ingreso"));
    expect(screen.queryAllByTestId("ledger-day")).toHaveLength(0); // no day groups when not sorted by date
    await u.selectOptions(screen.getByLabelText("Ordenar"), "dateAsc");
    await waitFor(() => expect(rows()[0]).toHaveTextContent("EJEMPLO-FICTICIO Ingreso")); // 5 nov, the oldest
    expect(JSON.stringify(await (await getLocalDb()).getAll("transactions"))).toBe(before);
  });

  it("renders 100 rows and adds more on demand", async () => {
    const u = user();
    const account = await mutate((r) => r.accounts.create({ name: "EJEMPLO-FICTICIO A", institution: null, accountType: "cash", currency: "ARS", initialBalance: 0, openingDate: null, status: "active" }));
    const today = toLocalDate(new Date());
    await unitOfWork({ db: await getLocalDb() }, async (r) => {
      for (let i = 0; i < 130; i++) {
        await r.transactions.create({ type: "expense", description: `EJEMPLO-FICTICIO ${i}`, amount: 100 + i, currency: "ARS", categoryId: null, accountId: account.id, destinationAccountId: null, cardId: null, date: today as never, status: "completed", notes: null, billId: null, recurrenceId: null });
      }
    });
    await openPage();
    await waitFor(() => expect(rows()).toHaveLength(100));
    expect(count()).toBe("130 transacciones");
    await u.click(screen.getByRole("button", { name: "Mostrar más (30 restantes)" }));
    expect(rows()).toHaveLength(130);
  });
});
