import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { loadDashboard } from "@/features/dashboard/data";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import { toLocalDate, type LocalDate } from "@/lib/formatting/date";
import type { Input } from "@/services/repositories/repositories";

/** Panel through the real repositories and IndexedDB (Step 07). Fictitious data only. */
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
  const view = render(<DashboardPage />);
  await waitFor(() => expect(screen.queryByTestId("dashboard-loading")).not.toBeInTheDocument());
  return view;
}

describe("Panel page", () => {
  it("shows the approved empty state on first use", async () => {
    await openPage();
    expect(screen.getByTestId("hero-balance")).toHaveTextContent("$ 0");
    expect(screen.getByText("Agrega la primera cuenta para empezar.")).toBeInTheDocument();
    expect(screen.queryByTestId("obligations-strip")).not.toBeInTheDocument();
  });

  it("separates currencies, excludes transfers and cancelled, keeps pending apart, and follows changes", async () => {
    const pesos = await account("EJEMPLO-FICTICIO Pesos", "ARS", 100_000);
    const ahorro = await account("EJEMPLO-FICTICIO Ahorro", "ARS", 0);
    const dolares = await account("EJEMPLO-FICTICIO Dólares", "USD", 50_000);
    await movement(pesos.id, { type: "income", amount: 40_000, description: "EJEMPLO-FICTICIO Cobro" });
    await movement(pesos.id, { amount: 15_000, description: "EJEMPLO-FICTICIO Super" });
    await movement(pesos.id, { type: "transfer", amount: 20_000, destinationAccountId: ahorro.id, description: "EJEMPLO-FICTICIO A ahorro" });
    await movement(pesos.id, { amount: 3_000, status: "pending", description: "EJEMPLO-FICTICIO Pendiente" });
    await movement(dolares.id, { amount: 1_000, currency: "USD", description: "EJEMPLO-FICTICIO Hosting" });
    // Goal contributions are not income (they never reach the flow).
    const goal = await mutate((r) =>
      r.goals.create({ name: "EJEMPLO-FICTICIO Meta", description: null, kind: "other", amount: 1_000_000, initialAmount: 0, currency: "ARS", startDate: today(), targetDate: null, status: "active", completedAt: null, archivedAt: null }),
    );
    await mutate((r) =>
      r.goalContributions.create({ goalId: goal.id, amount: 500_000, currency: "ARS", date: today(), description: null, accountId: pesos.id, transactionId: null, cancelledAt: null }),
    );

    await openPage();
    expect(screen.getByTestId("hero-balance")).toHaveTextContent("$ 1.250");
    expect(screen.getByTestId("hero-balance-USD")).toHaveTextContent("US$ 490");
    const ars = screen.getByTestId("flow-ARS");
    expect(within(ars).getByTestId("flow-income")).toHaveTextContent("+$ 400,00");
    expect(within(ars).getByTestId("flow-expenses")).toHaveTextContent("−$ 150,00");
    expect(within(ars).getByTestId("flow-result")).toHaveTextContent("$ 250,00");
    expect(within(ars).getByTestId("flow-pending")).toHaveTextContent("$ 30 de gastos");
    expect(within(screen.getByTestId("flow-USD")).getByTestId("flow-expenses")).toHaveTextContent("−US$ 10,00");
    expect(screen.getByTestId("dashboard-goal")).toHaveTextContent("$ 5.000");
    expect(screen.getAllByTestId("recent-item")).toHaveLength(5);

    // A change anywhere re-reads the Panel.
    await act(async () => {
      await movement(pesos.id, { amount: 5_000, description: "EJEMPLO-FICTICIO Farmacia" });
    });
    await waitFor(() => expect(within(screen.getByTestId("flow-ARS")).getByTestId("flow-expenses")).toHaveTextContent("−$ 200,00"));
    expect(screen.getByTestId("hero-balance")).toHaveTextContent("$ 1.200");
  });

  it("the period filter recomputes without reading again, and the choice is remembered", async () => {
    const u = userEvent.setup();
    const pesos = await account("EJEMPLO-FICTICIO Pesos", "ARS", 0);
    await movement(pesos.id, { amount: 1_000 });
    await openPage();
    await u.click(screen.getByRole("button", { name: "Año" }));
    expect(screen.getByTestId("dashboard-title")).toHaveTextContent(today().slice(0, 4));
    await u.click(screen.getByRole("button", { name: "Período anterior" }));
    expect(screen.getByTestId("dashboard-title")).toHaveTextContent(String(Number(today().slice(0, 4)) - 1));
    expect(screen.getByTestId("period-flow")).toHaveTextContent("Sin movimientos completados en el período.");
    expect(screen.getByTestId("dashboard-hero")).toHaveTextContent("Saldo al cierre del período");
    expect(window.localStorage.getItem("pfm.dashboard.granularity")).toBe("year");
  });

  it("the loader never writes and derives cards' committed amounts from purchases", async () => {
    const pesos = await account("EJEMPLO-FICTICIO Pesos", "ARS", 0);
    const card = await mutate((r) =>
      r.cards.create({ accountId: pesos.id, name: "EJEMPLO-FICTICIO Visa", cardType: "credit", lastFourDigits: "4242", creditLimit: 100_000, closingDay: 20, dueDay: 5, currency: "ARS", status: "active" }),
    );
    await movement(pesos.id, { amount: 30_000, cardId: card.id });
    const db = await getLocalDb();
    const before = await db.count("outbox");
    const data = await loadDashboard(db);
    expect(await db.count("outbox")).toBe(before);
    expect(data.dashboardCards[0]).toMatchObject({ committed: { amount: 30_000, currency: "ARS" }, available: 70_000 });
    // The purchase is an expense of the period, but not an account movement (D4-08).
    expect(data.accountsSummary.balances[0]).toMatchObject({ amount: 0 });
  });
});
