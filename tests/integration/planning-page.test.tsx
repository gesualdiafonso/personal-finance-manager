import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PlanningPage } from "@/features/planning/planning-page";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import { toLocalDate, type LocalDate } from "@/lib/formatting/date";
import { ensureDefaultCategories } from "@/services/repositories/repositories";

/** Presupuesto through the real interface, repositories and IndexedDB (Step 06). Fictitious data only. */
const user = () => userEvent.setup();
const today = () => toLocalDate(new Date()) as LocalDate;
const FOOD = "0193c8a0-0000-7000-8000-000000000202"; // default "Alimentación"

async function openPage(hash = "") {
  window.history.replaceState(null, "", `/presupuesto${hash}`);
  const view = render(<PlanningPage />);
  await waitFor(() => expect(screen.queryByTestId("planning-loading")).not.toBeInTheDocument());
  return view;
}

async function seedExpense(amount: number) {
  await mutate((_r, db) => ensureDefaultCategories({ db }));
  const account = await mutate((r) =>
    r.accounts.create({ name: "EJEMPLO-FICTICIO Pesos", institution: null, accountType: "checking", currency: "ARS", initialBalance: 0, openingDate: null, status: "active" }),
  );
  await mutate((r) =>
    r.transactions.create({
      type: "expense",
      description: "EJEMPLO-FICTICIO Super",
      amount,
      currency: "ARS",
      categoryId: FOOD,
      accountId: account.id,
      destinationAccountId: null,
      cardId: null,
      date: today(),
      status: "completed",
      notes: null,
      billId: null,
      recurrenceId: null,
    }),
  );
}

describe("Presupuesto page", () => {
  it("shows the empty states of the three sections", async () => {
    const u = user();
    await openPage();
    expect(screen.getByTestId("planning-summary")).toHaveTextContent("Ningún presupuesto en curso.");
    expect(screen.getByTestId("planning-summary")).toHaveTextContent("Ninguna meta activa.");
    await u.click(screen.getByRole("tab", { name: "Presupuestos" }));
    expect(screen.getByTestId("budgets-empty")).toBeInTheDocument();
    expect(window.location.hash).toBe("#presupuestos");
    await u.click(screen.getByRole("tab", { name: "Metas" }));
    expect(screen.getByTestId("goals-empty")).toBeInTheDocument();
  });

  it("creates a category budget, computes its usage from transactions and filters by state", async () => {
    const u = user();
    await seedExpense(9_000_000);
    await openPage("#presupuestos");
    await u.click(screen.getByRole("button", { name: "Crear el primero" }));
    const form = await screen.findByRole("form", { name: "Nuevo presupuesto" });
    await u.type(within(form).getByLabelText("Nombre"), "EJEMPLO-FICTICIO Comida");
    await u.selectOptions(within(form).getByLabelText("Categoría"), FOOD);
    await u.type(within(form).getByLabelText("Límite"), "100.000");
    await u.click(within(form).getByRole("button", { name: "Crear presupuesto" }));
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Presupuesto creado.");
    const row = await screen.findByTestId("budget-row");
    expect(row).toHaveTextContent("$ 90.000,00");
    expect(row).toHaveTextContent("90 %");
    expect(within(row).getByTestId("budget-state")).toHaveTextContent("Atención");
    expect(within(row).getByRole("meter")).toHaveAttribute("aria-valuenow", "90");
    // No results for a filter, with a way back.
    await u.selectOptions(screen.getByLabelText("Mostrar"), "exceeded");
    expect(screen.getByTestId("budgets-no-results")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(screen.getByTestId("budget-row")).toBeInTheDocument();
    const [stored] = await (await getLocalDb()).getAll("budgets");
    expect(stored).toMatchObject({ amount: 10_000_000, categoryId: FOOD, period: "monthly", status: "active" });
    expect(stored!.startDate.endsWith("-01")).toBe(true);
  });

  it("creates a goal, registers a contribution and completes it", async () => {
    const u = user();
    await openPage("#metas");
    await u.click(screen.getByRole("button", { name: "Crear la primera" }));
    const form = await screen.findByRole("form", { name: "Nueva meta" });
    await u.type(within(form).getByLabelText("Nombre"), "EJEMPLO-FICTICIO Viaje");
    await u.selectOptions(within(form).getByLabelText("Tipo"), "travel");
    await u.type(within(form).getByLabelText("Objetivo"), "50.000");
    await u.click(within(form).getByRole("button", { name: "Crear meta" }));
    await u.click(await screen.findByTestId("goal-card"));
    const sheet = await screen.findByTestId("goal-detail");
    expect(within(sheet).getByTestId("goal-detail-percent")).toHaveTextContent("0 %");
    await u.click(within(sheet).getByRole("button", { name: "Registrar aporte" }));
    const contribution = within(sheet).getByRole("form", { name: "Registrar aporte" });
    await u.type(within(contribution).getByLabelText("Importe"), "50.000");
    await u.click(within(contribution).getByRole("button", { name: "Registrar aporte" }));
    await waitFor(() => expect(within(sheet).getByTestId("goal-detail-percent")).toHaveTextContent("100 %"));
    expect(within(sheet).getByTestId("goal-status")).toHaveTextContent("Objetivo alcanzado");
    await u.click(within(sheet).getByRole("button", { name: "Marcar como cumplida" }));
    await waitFor(() => expect(within(sheet).getByTestId("goal-status")).toHaveTextContent("Cumplida"));
    const [goal] = await (await getLocalDb()).getAll("goals");
    expect(goal).toMatchObject({ status: "completed" });
    expect(goal!.completedAt).not.toBeNull();
    expect(await (await getLocalDb()).count("transactions")).toBe(0); // a contribution is not a transaction
  });
});
