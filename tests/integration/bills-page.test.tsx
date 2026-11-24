import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BillsPage } from "@/features/bills/bills-page";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import { toLocalDate, type LocalDate } from "@/lib/formatting/date";
import type { Input } from "@/services/repositories/repositories";

/** Cuentas domésticas through the real interface, repositories and IndexedDB. Fictitious data only. */
const user = () => userEvent.setup();
const today = () => toLocalDate(new Date());
const shift = (days: number): LocalDate => {
  const [y, m, d] = today().split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) as LocalDate;
};

async function openPage() {
  const view = render(<BillsPage />);
  await waitFor(() => expect(screen.queryByTestId("bills-loading")).not.toBeInTheDocument());
  return view;
}

async function addAccount(name: string, currency: "ARS" | "USD" = "ARS") {
  return mutate((r) => r.accounts.create({ name, institution: null, accountType: "checking", currency, initialBalance: 0, openingDate: null, status: "active" }));
}

async function addBill(over: Partial<Input<"bills">> = {}) {
  return mutate((r) =>
    r.bills.create({
      name: "EJEMPLO-FICTICIO Luz",
      description: null,
      categoryId: null,
      amount: 1_000_000,
      currency: "ARS",
      dueDate: today(),
      accountId: null,
      status: "pending",
      notes: null,
      recurrenceId: null,
      occurrenceDate: null,
      ...over,
    }),
  );
}

const rowFor = (name: string) => screen.getAllByTestId("bill-row").find((r) => within(r).queryByText(name))!;

describe("Cuentas domésticas page", () => {
  it("shows the empty state and creates the first bill as pending", async () => {
    const u = user();
    await openPage();
    expect(screen.getByTestId("bills-empty")).toHaveTextContent("Todavía no hay cuentas domésticas");
    await u.click(screen.getByRole("button", { name: "Registrar la primera" }));
    const form = await screen.findByRole("form", { name: "Nueva cuenta doméstica" });
    await u.type(within(form).getByLabelText("Nombre"), "EJEMPLO-FICTICIO Expensas");
    await u.type(within(form).getByLabelText("Importe"), "85.000,50");
    await u.clear(within(form).getByLabelText("Vencimiento"));
    await u.type(within(form).getByLabelText("Vencimiento"), shift(3));
    await u.click(within(form).getByRole("button", { name: "Guardar cuenta" }));
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Cuenta doméstica registrada.");
    await waitFor(() => expect(screen.getByTestId("bills-next7")).toHaveTextContent("EJEMPLO-FICTICIO Expensas"));
    expect(rowFor("EJEMPLO-FICTICIO Expensas")).toHaveTextContent("Pendiente");
    expect(rowFor("EJEMPLO-FICTICIO Expensas")).toHaveTextContent("en 3 días");
    const [stored] = await (await getLocalDb()).getAll("bills");
    expect(stored).toMatchObject({ status: "pending", amount: 8_500_050, currency: "ARS", dueDate: shift(3) });
  });

  it("validates in Spanish and keeps what was typed", async () => {
    const u = user();
    await openPage();
    await u.click(screen.getByRole("button", { name: "Registrar la primera" }));
    const form = await screen.findByRole("form", { name: "Nueva cuenta doméstica" });
    await u.type(within(form).getByLabelText("Importe"), "0");
    await u.click(within(form).getByRole("button", { name: "Guardar cuenta" }));
    expect(within(form).getByText("Escribe un nombre.")).toBeInTheDocument();
    expect(within(form).getByText("El importe tiene que ser mayor que 0.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Importe")).toHaveValue("0");
    expect(await (await getLocalDb()).count("bills")).toBe(0);
  });

  it("only offers accounts of the bill's currency", async () => {
    const u = user();
    await addAccount("EJEMPLO-FICTICIO Pesos");
    await addAccount("EJEMPLO-FICTICIO Dólares", "USD");
    await openPage();
    await u.click(screen.getByRole("button", { name: "Registrar la primera" }));
    const form = await screen.findByRole("form", { name: "Nueva cuenta doméstica" });
    const account = within(form).getByLabelText("Cuenta para pagarla");
    expect(within(account).queryByText("EJEMPLO-FICTICIO Dólares")).not.toBeInTheDocument();
    await u.selectOptions(account, within(account).getByText("EJEMPLO-FICTICIO Pesos"));
    await u.selectOptions(within(form).getByLabelText("Moneda"), "USD");
    expect(account).toHaveValue(""); // the peso account is dropped
    expect(within(account).getByText("EJEMPLO-FICTICIO Dólares")).toBeInTheDocument();
  });

  it("groups by due date with derived overdue status and per-currency indicators", async () => {
    await addBill({ name: "EJEMPLO-FICTICIO Vencida", dueDate: shift(-2), amount: 300_000 });
    await addBill({ name: "EJEMPLO-FICTICIO Hoy", dueDate: today(), amount: 200_000 });
    await addBill({ name: "EJEMPLO-FICTICIO Lejana", dueDate: shift(45), amount: 100_000 });
    await addBill({ name: "EJEMPLO-FICTICIO Dólar", dueDate: shift(10), amount: 5_000, currency: "USD" });
    await openPage();
    expect(screen.getByTestId("bills-overdue")).toHaveTextContent("EJEMPLO-FICTICIO Vencida");
    expect(rowFor("EJEMPLO-FICTICIO Vencida")).toHaveTextContent("Vencida");
    expect(rowFor("EJEMPLO-FICTICIO Vencida")).toHaveTextContent("venció hace 2 días");
    expect(screen.getByTestId("bills-today")).toHaveTextContent("EJEMPLO-FICTICIO Hoy");
    expect(rowFor("EJEMPLO-FICTICIO Hoy")).toHaveTextContent("Vence hoy");
    expect(screen.getByTestId("bills-next30")).toHaveTextContent("EJEMPLO-FICTICIO Dólar");
    expect(screen.getByTestId("bills-later")).toHaveTextContent("EJEMPLO-FICTICIO Lejana");
    expect(screen.getByTestId("bills-pending-total")).toHaveTextContent("$ 6.000");
    expect(screen.getByTestId("bills-indicators")).toHaveTextContent("US$ 50");
    expect(screen.getByTestId("bills-overdue-total")).toHaveTextContent("$ 3.000");
    expect(screen.getByTestId("bills-counts")).toHaveTextContent("4 pendientes · 1 vencida");
  });

  it("edits a pending bill from its detail", async () => {
    const u = user();
    await addBill();
    await openPage();
    await u.click(rowFor("EJEMPLO-FICTICIO Luz"));
    const sheet = await screen.findByTestId("bill-detail");
    expect(within(sheet).getByTestId("bill-detail-paid")).toHaveTextContent("$ 0,00");
    expect(within(sheet).getByText("Registrada a mano")).toBeInTheDocument();
    await u.click(within(sheet).getByRole("button", { name: "Editar" }));
    const form = within(sheet).getByRole("form", { name: "Editar cuenta doméstica" });
    await u.clear(within(form).getByLabelText("Importe"));
    await u.type(within(form).getByLabelText("Importe"), "12.500");
    await u.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(within(sheet).getByTestId("bill-detail-remaining")).toHaveTextContent("$ 12.500,00"));
    const [stored] = await (await getLocalDb()).getAll("bills");
    expect(stored).toMatchObject({ amount: 1_250_000, rev: 2 });
  });

  it("cancels with confirmation; a cancelled bill only edits its notes", async () => {
    const u = user();
    await addBill();
    await openPage();
    await u.click(rowFor("EJEMPLO-FICTICIO Luz"));
    const sheet = await screen.findByTestId("bill-detail");
    await u.click(within(sheet).getByRole("button", { name: "Cancelar cuenta" }));
    const dialog = await screen.findByRole("alertdialog", { name: "¿Cancelar esta cuenta doméstica?" });
    await u.click(within(dialog).getByRole("button", { name: "Cancelar cuenta" }));
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Cuenta doméstica cancelada.");
    await waitFor(() => expect(screen.getByTestId("bills-cancelled")).toHaveTextContent("EJEMPLO-FICTICIO Luz"));
    expect(screen.getByTestId("bills-counts")).toHaveTextContent("Nada pendiente.");
    await u.click(rowFor("EJEMPLO-FICTICIO Luz"));
    const again = await screen.findByTestId("bill-detail");
    expect(within(again).queryByRole("button", { name: "Cancelar cuenta" })).not.toBeInTheDocument();
    await u.click(within(again).getByRole("button", { name: "Editar notas" }));
    const form = within(again).getByRole("form");
    expect(within(form).queryByLabelText("Importe")).not.toBeInTheDocument();
    await u.type(within(form).getByLabelText("Notas"), "EJEMPLO-FICTICIO duplicada");
    await u.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(async () => expect((await (await getLocalDb()).getAll("bills"))[0]).toMatchObject({ status: "cancelled", notes: "EJEMPLO-FICTICIO duplicada" }));
  });

  it("deletes a bill registered by mistake", async () => {
    const u = user();
    await addBill();
    await openPage();
    await u.click(rowFor("EJEMPLO-FICTICIO Luz"));
    const sheet = await screen.findByTestId("bill-detail");
    await u.click(within(sheet).getByRole("button", { name: "Eliminar" }));
    const dialog = await screen.findByRole("alertdialog", { name: "¿Eliminar esta cuenta doméstica?" });
    await u.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Cuenta doméstica eliminada.");
    await waitFor(() => expect(screen.getByTestId("bills-empty")).toBeInTheDocument());
    const [stored] = await (await getLocalDb()).getAll("bills");
    expect(stored!.deletedAt).not.toBeNull(); // tombstone
  });
});
