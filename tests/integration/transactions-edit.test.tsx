import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { money } from "@/domain/money";
import type { Transaction } from "@/domain/schemas";
import { AccountDetailPage } from "@/features/accounts/account-detail-page";
import { loadAccountsView } from "@/features/accounts/data";
import { TransactionsPage } from "@/features/transactions/transactions-page";
import { getLocalDb } from "@/hooks/use-local-data";
import { createRepositories, unitOfWork } from "@/services/repositories/repositories";
import { checkLocalIntegrity, importPublication } from "@/services/storage/local-store";
import { samplePublication, sampleId as ID } from "../helpers/sample-data";

/**
 * Detail, edit, cancel, delete and consistency through the real page, repositories and
 * IndexedDB (sample publication, fictitious). Balances are always read back from the store.
 */
const user = () => userEvent.setup();

async function setup() {
  const { dataSet, files } = await samplePublication(2);
  await importPublication(await getLocalDb(), dataSet, files);
  const u = user();
  render(<TransactionsPage />);
  await screen.findByTestId("filters");
  await u.selectOptions(screen.getByLabelText("Período"), "all");
  await waitFor(() => expect(screen.getByTestId("results-count")).toHaveTextContent("7 transacciones"));
  return u;
}
async function open(u: ReturnType<typeof user>, description: string) {
  await u.click(screen.getByRole("button", { name: description }));
  return screen.findByTestId("transaction-detail-view");
}
const balance = async (id: string) => {
  const v = await loadAccountsView(await getLocalDb());
  return [...v.active, ...v.archived].find((r) => r.account.id === id)!.balance;
};
const stored = async (id: string) => (await (await getLocalDb()).get("transactions", id)) as Transaction;

describe("Transaction detail", () => {
  it("shows every field; a transfer shows origin, destination, debited and credited", async () => {
    const u = await setup();
    const view = await open(u, "EJEMPLO-FICTICIO Transferencia salida");
    expect(within(view).getByTestId("detail-from")).toHaveTextContent("EJEMPLO-FICTICIO Cuenta A");
    expect(within(view).getByTestId("detail-to")).toHaveTextContent("EJEMPLO-FICTICIO Cuenta B");
    expect(view).toHaveTextContent("Debitado");
    expect(view).toHaveTextContent("Acreditado");
    expect(view).toHaveTextContent("Pesos (ARS)");
    expect(within(view).queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument(); // completed (D4-04)
  });
});

describe("Edit", () => {
  it("a completed expense: shows the balance impact, then recalculates through the repository", async () => {
    const u = await setup();
    await open(u, "EJEMPLO-FICTICIO Compra");
    await u.click(screen.getByRole("button", { name: "Editar" }));
    const form = await screen.findByRole("form", { name: "Editar transacción" });
    expect(within(form).getByRole("radio", { name: "Ingreso" })).toBeDisabled(); // the type never changes
    await u.clear(within(form).getByLabelText("Importe"));
    await u.type(within(form).getByLabelText("Importe"), "50.000");
    await u.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByTestId("edit-impact")).toHaveTextContent("EJEMPLO-FICTICIO Cuenta A");
    expect(within(dialog).getByTestId("edit-impact")).toHaveTextContent("$ 4.397.690,00 → $ 4.390.000,00");
    await u.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(async () => expect(await balance(ID(1))).toEqual(money(439_000_000, "ARS")));
    expect(await stored(ID(11))).toMatchObject({ amount: 5_000_000, rev: 2, type: "expense" });
  });

  it("moving an expense to another account updates both accounts", async () => {
    const u = await setup();
    await open(u, "EJEMPLO-FICTICIO Compra");
    await u.click(screen.getByRole("button", { name: "Editar" }));
    const form = await screen.findByRole("form", { name: "Editar transacción" });
    await u.selectOptions(within(form).getByLabelText("Cuenta"), ID(2));
    await u.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    await u.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(async () => expect(await balance(ID(2))).toEqual(money(1_000_000 - 4_231_000, "ARS")));
    expect(await balance(ID(1))).toEqual(money(439_769_000 + 4_231_000, "ARS"));
  });

  it("a new category and date save without a balance prompt (nothing moves)", async () => {
    const u = await setup();
    await open(u, "EJEMPLO-FICTICIO Compra");
    await u.click(screen.getByRole("button", { name: "Editar" }));
    const form = await screen.findByRole("form", { name: "Editar transacción" });
    await u.clear(within(form).getByLabelText("Fecha"));
    await u.type(within(form).getByLabelText("Fecha"), "2026-11-19");
    await u.click(within(form).getByRole("button", { name: "EJEMPLO-FICTICIO Hogar" }));
    await u.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Cambios guardados.");
    expect(await stored(ID(11))).toMatchObject({ date: "2026-11-19", categoryId: ID(5) });
    expect(await balance(ID(1))).toEqual(money(439_769_000, "ARS"));
  });

  it("a failed write changes nothing and keeps the form", async () => {
    const u = await setup();
    await open(u, "EJEMPLO-FICTICIO Compra");
    await u.click(screen.getByRole("button", { name: "Editar" }));
    const form = await screen.findByRole("form", { name: "Editar transacción" });
    await u.clear(within(form).getByLabelText("Descripción"));
    await u.type(within(form).getByLabelText("Descripción"), "EJEMPLO-FICTICIO Otra");
    (await getLocalDb()).close();
    await u.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("No se pudo guardar");
  });
});

describe("Cancel and delete", () => {
  it("cancelling a completed movement keeps the record, reverts its effect, is audited and final", async () => {
    const u = await setup();
    const view = await open(u, "EJEMPLO-FICTICIO Compra");
    await u.click(within(view).getByRole("button", { name: "Cancelar movimiento" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("No se puede deshacer");
    await u.click(within(dialog).getByRole("button", { name: "Cancelar movimiento" }));
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Movimiento cancelado.");
    expect(await stored(ID(11))).toMatchObject({ status: "cancelled", deletedAt: null, rev: 2 });
    expect(await balance(ID(1))).toEqual(money(439_769_000 + 4_231_000, "ARS"));
    const ops = (await (await getLocalDb()).getAll("outbox")).filter((o) => o.recordId === ID(11));
    expect(ops).toMatchObject([{ op: "update", baseRev: 1 }]);

    // Final: reopened, it offers only notes and delete; the repository refuses other changes.
    const again = await open(u, "EJEMPLO-FICTICIO Compra");
    expect(within(again).queryByRole("button", { name: "Cancelar movimiento" })).not.toBeInTheDocument();
    expect(within(again).getByRole("button", { name: "Editar notas" })).toBeInTheDocument();
    const repos = createRepositories({ db: await getLocalDb() });
    await expect(repos.transactions.update(ID(11), { amount: 1 }, 2)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await expect(repos.transactions.update(ID(11), { notes: "EJEMPLO-FICTICIO nota" }, 2)).resolves.toMatchObject({ rev: 3 });
  });

  it("a second cancel with the same version is refused (no repeated reversal)", async () => {
    await samplePublication(2).then(async ({ dataSet, files }) => importPublication(await getLocalDb(), dataSet, files));
    const repos = createRepositories({ db: await getLocalDb() });
    await repos.transactions.update(ID(11), { status: "cancelled" }, 1);
    await expect(repos.transactions.update(ID(11), { status: "cancelled" }, 1)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await balance(ID(1))).toEqual(money(439_769_000 + 4_231_000, "ARS"));
  });

  it("deletes a pending movement after confirmation; a completed one is refused by the repository", async () => {
    const u = await setup();
    const view = await open(u, "EJEMPLO-FICTICIO Pago pendiente");
    await u.click(within(view).getByRole("button", { name: "Eliminar" }));
    await u.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(screen.getByTestId("results-count")).toHaveTextContent("6 transacciones"));
    expect((await stored(ID(18))).deletedAt).not.toBeNull(); // tombstone
    const repos = createRepositories({ db: await getLocalDb() });
    await expect(repos.transactions.delete(ID(10), 1)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await expect(repos.transactions.update(ID(10), { type: "expense" } as never, 1)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
  });
});

describe("Consistency", () => {
  it("a transfer is one record: a failure in the same unit of work leaves nothing applied", async () => {
    const db = await getLocalDb();
    const repos = createRepositories({ db });
    const a = await repos.accounts.create({ name: "EJEMPLO-FICTICIO A", institution: null, accountType: "cash", currency: "ARS", initialBalance: 10_000, openingDate: null, status: "active" });
    const b = await repos.accounts.create({ name: "EJEMPLO-FICTICIO B", institution: null, accountType: "cash", currency: "ARS", initialBalance: 0, openingDate: null, status: "active" });
    const transfer = { type: "transfer" as const, description: "EJEMPLO-FICTICIO", amount: 5_000, currency: "ARS" as const, categoryId: null, accountId: a.id, destinationAccountId: b.id, cardId: null, date: "2026-11-24" as never, status: "completed" as const, notes: null, billId: null, recurrenceId: null };
    await expect(
      unitOfWork({ db }, async (r) => {
        await r.transactions.create(transfer);
        await r.transactions.create({ ...transfer, destinationAccountId: ID(999) }); // fails
      }),
    ).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    expect(await db.count("transactions")).toBe(0);
    expect(await balance(a.id)).toEqual(money(10_000, "ARS"));
    expect(await balance(b.id)).toEqual(money(0, "ARS"));
    const t = await repos.transactions.create(transfer);
    expect(await db.count("transactions")).toBe(1);
    expect([await balance(a.id), await balance(b.id)]).toEqual([money(5_000, "ARS"), money(5_000, "ARS")]);
    await expect(repos.transactions.create({ ...transfer, id: t.id })).rejects.toMatchObject({ code: "DUPLICATE_ID" });
    await expect(repos.transactions.create(transfer)).rejects.toMatchObject({ code: "POSSIBLE_DUPLICATE" });
  });

  it("the account detail shows the reconciled breakdown, and the integrity check verifies it", async () => {
    const { dataSet, files } = await samplePublication(2);
    await importPublication(await getLocalDb(), dataSet, files);
    window.history.pushState({}, "", `/cuentas/${ID(1)}`);
    render(<AccountDetailPage />);
    const section = await screen.findByTestId("reconciliation");
    expect(within(section).getByTestId("reconciliation-result")).toHaveTextContent("$ 4.397.690,00");
    expect(within(section).getByTestId("reconciliation-status")).toHaveTextContent("Verificado");
    expect(section).toHaveTextContent("1 pendiente, 1 cancelado y 1 compra con tarjeta de crédito");
    expect(await checkLocalIntegrity(await getLocalDb())).toEqual({ ok: true, problems: [] });
  });
});
