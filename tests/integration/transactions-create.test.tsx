import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "@/domain/default-categories";
import { money } from "@/domain/money";
import { incomeAndExpenses } from "@/domain/rules/balances";
import type { Transaction } from "@/domain/schemas";
import { loadAccountsView } from "@/features/accounts/data";
import { NEW_TRANSACTION_EVENT } from "@/features/transactions/new-transaction";
import { TransactionsPage } from "@/features/transactions/transactions-page";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import { createRepositories, ensureDefaultCategories } from "@/services/repositories/repositories";

/**
 * Registering movements through the real form, repositories and IndexedDB (fake-indexeddb).
 * Balances are always read back through the Step 02/03 derivation. Fictitious data only.
 */
const user = () => userEvent.setup();

async function account(name: string, initial: number, currency: "ARS" | "USD" = "ARS", status: "active" | "archived" = "active") {
  return mutate((r) => r.accounts.create({ name, institution: null, accountType: "checking", currency, initialBalance: initial, openingDate: null, status }));
}
async function openPage() {
  const view = render(<TransactionsPage />);
  await waitFor(() => expect(screen.queryByTestId("transactions-loading")).not.toBeInTheDocument());
  return view;
}
/**
 * Opens the sheet through the global "Nueva transacción" event (the sidebar/N path): it does
 * not race with the page re-reading the store after a save (a button can be replaced between
 * being found and being clicked). The buttons themselves are tested separately.
 */
async function openSheet() {
  window.dispatchEvent(new Event(NEW_TRANSACTION_EVENT));
  return screen.findByRole("form", { name: "Nueva transacción" });
}
async function fill(u: ReturnType<typeof user>, form: HTMLElement, f: { type?: string; amount: string; description: string; category?: string; account?: string; destination?: string; card?: string; status?: string }) {
  if (f.type) await u.click(within(form).getByRole("radio", { name: f.type }));
  await u.type(within(form).getByLabelText("Importe"), f.amount);
  if (f.category) await u.click(within(form).getByRole("button", { name: f.category }));
  await u.type(within(form).getByLabelText("Descripción"), f.description);
  if (f.card) await u.selectOptions(within(form).getByLabelText("Tarjeta"), f.card);
  if (f.account) await u.selectOptions(within(form).getByLabelText(/Cuenta que recibe|^Cuenta$|Desde la cuenta/), f.account);
  if (f.destination) await u.selectOptions(within(form).getByLabelText("Hacia la cuenta"), f.destination);
  if (f.status) await u.selectOptions(within(form).getByLabelText("Estado"), f.status);
}
const balances = async () => {
  const view = await loadAccountsView(await getLocalDb());
  return new Map([...view.active, ...view.archived].map((r) => [r.account.name, r.balance]));
};
const transactions = async () => ((await (await getLocalDb()).getAll("transactions")) as Transaction[]).filter((t) => t.deletedAt === null);

describe("New transaction", () => {
  it("asks for an account first", async () => {
    await openPage();
    expect(screen.getByTestId("transactions-empty")).toHaveTextContent("Primero crea una cuenta");
  });

  it("seeds the initial categories once, and never over existing ones (D4-09)", async () => {
    await account("EJEMPLO-FICTICIO A", 0);
    await openPage();
    await waitFor(async () => expect(await (await getLocalDb()).count("categories")).toBe(DEFAULT_CATEGORIES.length));
    expect(await ensureDefaultCategories({ db: await getLocalDb() })).toBe(0);
    const outbox = await (await getLocalDb()).getAll("outbox");
    expect(outbox.filter((o) => o.entity === "categories")).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it("does not seed when the device already has categories", async () => {
    const db = await getLocalDb();
    await createRepositories({ db }).categories.create({ name: "EJEMPLO-FICTICIO Mía", type: "expense", parentId: null, icon: null, color: null, isDefault: false, isActive: true });
    expect(await ensureDefaultCategories({ db })).toBe(0);
    expect(await db.count("categories")).toBe(1);
  });

  it("income: increases its account and counts as income", async () => {
    const u = user();
    await account("EJEMPLO-FICTICIO A", 100_000);
    await openPage();
    await waitFor(async () => expect(await (await getLocalDb()).count("categories")).toBeGreaterThan(0));
    await u.click(await screen.findByRole("button", { name: "Registrar la primera" })); // the empty state's action
    const form = await screen.findByRole("form", { name: "Nueva transacción" });
    await fill(u, form, { type: "Ingreso", amount: "1.500,25", description: "EJEMPLO-FICTICIO Sueldo", category: "Sueldo" });
    await u.click(within(form).getByRole("button", { name: "Guardar ingreso" }));
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Ingreso guardado.");
    expect((await balances()).get("EJEMPLO-FICTICIO A")).toEqual(money(250_025, "ARS"));
    const [tx] = await transactions();
    expect(tx).toMatchObject({ type: "income", amount: 150_025, currency: "ARS", status: "completed" });
    expect(incomeAndExpenses([tx!], { from: "2000-01-01", to: "2100-01-01" }).income.get("ARS")).toEqual(money(150_025, "ARS"));
    await waitFor(() => expect(screen.getByTestId("results-count")).toHaveTextContent("1 transacción"));
  });

  it("expense: decreases its account; pending only in the projected balance", async () => {
    const u = user();
    await account("EJEMPLO-FICTICIO A", 100_000);
    await openPage();
    let form = await openSheet();
    await fill(u, form, { amount: "200", description: "EJEMPLO-FICTICIO Super", category: "Alimentación" });
    await u.click(within(form).getByRole("button", { name: "Guardar gasto" }));
    await waitFor(async () => expect((await balances()).get("EJEMPLO-FICTICIO A")).toEqual(money(80_000, "ARS")));
    form = await openSheet();
    await fill(u, form, { amount: "300", description: "EJEMPLO-FICTICIO Luz", status: "pending" });
    await u.click(within(form).getByRole("button", { name: "Guardar gasto" }));
    await waitFor(async () => expect(await transactions()).toHaveLength(2));
    expect((await balances()).get("EJEMPLO-FICTICIO A")).toEqual(money(80_000, "ARS")); // pending: not in the current balance
  });

  it("transfer: one record, both accounts change, never income or expense", async () => {
    const u = user();
    const a = await account("EJEMPLO-FICTICIO A", 100_000);
    const b = await account("EJEMPLO-FICTICIO B", 0);
    await openPage();
    const form = await openSheet();
    await fill(u, form, { type: "Transferencia", amount: "400", description: "EJEMPLO-FICTICIO Ahorro", account: a.id, destination: b.id });
    expect(within(form).queryByText("Categoría")).not.toBeInTheDocument();
    await u.click(within(form).getByRole("button", { name: "Guardar transferencia" }));
    await waitFor(async () => expect(await transactions()).toHaveLength(1));
    const all = await balances();
    expect(all.get("EJEMPLO-FICTICIO A")).toEqual(money(60_000, "ARS"));
    expect(all.get("EJEMPLO-FICTICIO B")).toEqual(money(40_000, "ARS"));
    const totals = incomeAndExpenses(await transactions(), { from: "2000-01-01", to: "2100-01-01" });
    expect(totals.income.size + totals.expenses.size).toBe(0);
  });

  it("refuses a cross-currency transfer with a clear message and stores nothing", async () => {
    const u = user();
    const a = await account("EJEMPLO-FICTICIO A", 100_000);
    const usd = await account("EJEMPLO-FICTICIO USD", 0, "USD");
    await openPage();
    const form = await openSheet();
    await fill(u, form, { type: "Transferencia", amount: "1", description: "EJEMPLO-FICTICIO", account: a.id, destination: usd.id });
    await u.click(within(form).getByRole("button", { name: "Guardar transferencia" }));
    expect(within(form).getByText(/monedas distintas/)).toBeInTheDocument();
    expect(await transactions()).toHaveLength(0);
  });

  it("card purchases: debit leaves the account now, credit stays committed (D4-08)", async () => {
    const u = user();
    const a = await account("EJEMPLO-FICTICIO A", 100_000);
    const base = { accountId: a.id, lastFourDigits: null, currency: "ARS" as const, status: "active" as const };
    await mutate((r) => r.cards.create({ ...base, name: "EJEMPLO-FICTICIO Débito", cardType: "debit", creditLimit: null, closingDay: null, dueDay: null }));
    await mutate((r) => r.cards.create({ ...base, name: "EJEMPLO-FICTICIO Visa", cardType: "credit", creditLimit: null, closingDay: 20, dueDay: 5 }));
    await openPage();
    for (const [card, amount] of [
      ["EJEMPLO-FICTICIO Débito", "100"],
      ["EJEMPLO-FICTICIO Visa", "250"],
    ] as const) {
      const form = await openSheet();
      const option = within(form).getByRole("option", { name: new RegExp(card) }) as HTMLOptionElement;
      await fill(u, form, { amount, description: `EJEMPLO-FICTICIO ${amount}`, card: option.value });
      expect(within(form).getByLabelText("Cuenta")).toBeDisabled(); // the card's paying account
      await u.click(within(form).getByRole("button", { name: "Guardar gasto" }));
      await waitFor(() => expect(screen.queryByRole("form", { name: "Nueva transacción" })).not.toBeInTheDocument());
    }
    expect((await balances()).get("EJEMPLO-FICTICIO A")).toEqual(money(90_000, "ARS")); // only the debit purchase
  });

  it("asks before saving a probable duplicate", async () => {
    const u = user();
    await account("EJEMPLO-FICTICIO A", 0);
    await openPage();
    for (let i = 0; i < 2; i++) {
      const form = await openSheet();
      await fill(u, form, { amount: "10", description: "EJEMPLO-FICTICIO Café" });
      await u.click(within(form).getByRole("button", { name: "Guardar gasto" }));
      if (i === 0) {
        await waitFor(() => expect(screen.queryByRole("form", { name: "Nueva transacción" })).not.toBeInTheDocument());
        await screen.findByTestId("results-count");
      }
    }
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Parece repetida");
    expect(await transactions()).toHaveLength(1);
    await u.click(within(dialog).getByRole("button", { name: "Guardar igual" }));
    await waitFor(async () => expect(await transactions()).toHaveLength(2));
  });

  it("a double click saves once; a failed write keeps the form and stores nothing", async () => {
    const u = user();
    await account("EJEMPLO-FICTICIO A", 0);
    await openPage();
    let form = await openSheet();
    await fill(u, form, { amount: "10", description: "EJEMPLO-FICTICIO Uno" });
    await u.dblClick(within(form).getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Nueva transacción" })).not.toBeInTheDocument());
    expect(await transactions()).toHaveLength(1);
    await screen.findByTestId("results-count"); // the list re-read the store

    form = await openSheet();
    await fill(u, form, { amount: "20", description: "EJEMPLO-FICTICIO Dos" });
    (await getLocalDb()).close();
    await u.click(within(form).getByRole("button", { name: "Guardar gasto" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("No se pudo guardar");
    expect(within(form).getByLabelText("Descripción")).toHaveValue("EJEMPLO-FICTICIO Dos");
  });

  it("opens from anywhere: the global event and the #nueva address", async () => {
    await account("EJEMPLO-FICTICIO A", 0);
    window.history.pushState({}, "", "/transacciones#nueva");
    const view = await openPage();
    expect(await screen.findByRole("form", { name: "Nueva transacción" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    view.unmount();
    await openPage();
    window.dispatchEvent(new Event(NEW_TRANSACTION_EVENT));
    expect(await screen.findByRole("form", { name: "Nueva transacción" })).toBeInTheDocument();
  });

  it("archived accounts are not offered and are refused by the repository (D4-07)", async () => {
    await account("EJEMPLO-FICTICIO Activa", 0);
    const old = await account("EJEMPLO-FICTICIO Vieja", 0, "ARS", "archived");
    await openPage();
    const form = await openSheet();
    expect(within(form).queryByRole("option", { name: /Vieja/ })).not.toBeInTheDocument();
    const db = await getLocalDb();
    await expect(
      createRepositories({ db }).transactions.create({ type: "income", description: "EJEMPLO-FICTICIO", amount: 1, currency: "ARS", categoryId: null, accountId: old.id, destinationAccountId: null, cardId: null, date: "2026-11-24" as never, status: "completed", notes: null, billId: null, recurrenceId: null }),
    ).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
  });

  it("persists after reload", async () => {
    const u = user();
    await account("EJEMPLO-FICTICIO A", 0);
    const first = await openPage();
    const form = await openSheet();
    await fill(u, form, { type: "Ingreso", amount: "5", description: "EJEMPLO-FICTICIO Persiste" });
    await u.click(within(form).getByRole("button", { name: "Guardar ingreso" }));
    await waitFor(() => expect(screen.getAllByTestId("ledger-row")).toHaveLength(1));
    first.unmount();
    await openPage();
    expect(await screen.findByTestId("ledger-row")).toHaveTextContent("EJEMPLO-FICTICIO Persiste");
  });
});

describe("Existing movements on archived accounts stay valid (D4-07)", () => {
  it("can still be edited after the account is archived", async () => {
    const db = await getLocalDb();
    const repos = createRepositories({ db });
    const a = await account("EJEMPLO-FICTICIO A", 0);
    const tx = await repos.transactions.create({ type: "income", description: "EJEMPLO-FICTICIO", amount: 1, currency: "ARS", categoryId: null, accountId: a.id, destinationAccountId: null, cardId: null, date: "2026-11-24" as never, status: "completed", notes: null, billId: null, recurrenceId: null });
    await repos.accounts.update(a.id, { status: "archived" }, a.rev);
    await expect(repos.transactions.update(tx.id, { notes: "EJEMPLO-FICTICIO nota" }, tx.rev)).resolves.toMatchObject({ rev: 2 });
  });
});
