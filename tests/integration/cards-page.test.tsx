import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CardsPage } from "@/features/cards/cards-page";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import { createRepositories } from "@/services/repositories/repositories";
import { importPublication } from "@/services/storage/local-store";
import { samplePublication, sampleId as ID } from "../helpers/sample-data";

/** Cards management through the real interface, repositories and IndexedDB. Fictitious data only. */
const user = () => userEvent.setup();

async function openPage() {
  const view = render(<CardsPage />);
  await waitFor(() => expect(screen.queryByTestId("cards-loading")).not.toBeInTheDocument());
  return view;
}

async function addAccount(name: string, currency: "ARS" | "USD" = "ARS") {
  return mutate((r) => r.accounts.create({ name, institution: null, accountType: "checking", currency, initialBalance: 0, openingDate: null, status: "active" }));
}

async function fillCard(u: ReturnType<typeof user>, f: { name: string; type?: string; account?: string; last4?: string; limit?: string; closing?: string; due?: string }) {
  const trigger = screen.queryByRole("button", { name: "Crear la primera tarjeta" }) ?? screen.getByRole("button", { name: "Nueva tarjeta" });
  await u.click(trigger);
  const form = await screen.findByRole("form", { name: "Nueva tarjeta" });
  await u.type(within(form).getByLabelText("Nombre"), f.name);
  if (f.type) await u.selectOptions(within(form).getByLabelText("Tipo"), f.type);
  if (f.account) await u.selectOptions(within(form).getByLabelText("Cuenta de pago"), f.account);
  if (f.last4) await u.type(within(form).getByLabelText("Últimos 4 dígitos"), f.last4);
  if (f.limit) await u.type(within(form).getByLabelText("Límite de crédito"), f.limit);
  if (f.closing) await u.type(within(form).getByLabelText("Día de cierre"), f.closing);
  if (f.due) await u.type(within(form).getByLabelText("Día de vencimiento"), f.due);
  await u.click(within(form).getByRole("button", { name: "Crear tarjeta" }));
  return form;
}

const rowFor = (name: string) => screen.getAllByTestId("card-row").find((r) => within(r).queryByText(name))!;

describe("Cards page", () => {
  it("asks for an account first when there is none", async () => {
    await openPage();
    expect(screen.getByTestId("cards-empty")).toHaveTextContent("Primero crea una cuenta");
    expect(screen.getByRole("link", { name: "Ir a Cuentas" })).toHaveAttribute("href", "/cuentas");
  });

  it("creates a credit card linked to its account, with the account's currency", async () => {
    const u = user();
    const account = await addAccount("EJEMPLO-FICTICIO Pagos");
    await openPage();
    await fillCard(u, { name: "EJEMPLO-FICTICIO Visa", account: account.id, last4: "4417", limit: "500.000", closing: "20", due: "5" });
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Tarjeta creada.");
    await waitFor(() => expect(rowFor("EJEMPLO-FICTICIO Visa")).toBeTruthy());
    const row = rowFor("EJEMPLO-FICTICIO Visa");
    expect(row).toHaveTextContent("··4417");
    expect(row).toHaveTextContent("EJEMPLO-FICTICIO Pagos · ARS");
    expect(row).toHaveTextContent("día 20");
    expect(screen.getByTestId("cards-credit")).toBeInTheDocument();
    const [stored] = await (await getLocalDb()).getAll("cards");
    expect(stored).toMatchObject({ cardType: "credit", currency: "ARS", accountId: account.id, creditLimit: 50_000_000, lastFourDigits: "4417" });
    expect(Object.keys(stored!)).not.toEqual(expect.arrayContaining(["cvv", "pin", "number"]));
  });

  it("debit and prepaid hide the credit fields and go to their own sections", async () => {
    const u = user();
    const account = await addAccount("EJEMPLO-FICTICIO Pagos");
    await openPage();
    await u.click(screen.getByRole("button", { name: "Crear la primera tarjeta" }));
    const form = await screen.findByRole("form", { name: "Nueva tarjeta" });
    expect(within(form).getByTestId("credit-fields")).toBeInTheDocument();
    await u.selectOptions(within(form).getByLabelText("Tipo"), "debit");
    expect(within(form).queryByTestId("credit-fields")).not.toBeInTheDocument();
    await u.click(within(form).getByRole("button", { name: "Cancelar" }));

    await fillCard(u, { name: "EJEMPLO-FICTICIO Débito", type: "debit", account: account.id });
    await waitFor(() => expect(screen.getByTestId("cards-debit")).toHaveTextContent("EJEMPLO-FICTICIO Débito"));
    await fillCard(u, { name: "EJEMPLO-FICTICIO Prepaga", type: "prepaid", account: account.id });
    await waitFor(() => expect(screen.getByTestId("cards-prepaid")).toHaveTextContent("EJEMPLO-FICTICIO Prepaga"));
    expect(screen.queryByTestId("cards-limit")).not.toBeInTheDocument(); // no credit limit to show
  });

  it("shows field errors and stores nothing", async () => {
    const u = user();
    await addAccount("EJEMPLO-FICTICIO Pagos");
    await openPage();
    const form = await fillCard(u, { name: "Tarjeta 4111 1111 1111 1111", last4: "12", closing: "40" });
    expect(within(form).getByText("No escribas el número de la tarjeta.")).toBeInTheDocument();
    expect(within(form).getByText("Escribe exactamente 4 dígitos o deja el campo vacío.")).toBeInTheDocument();
    expect(within(form).getAllByText("Escribe un día entre 1 y 31.")).toHaveLength(2);
    expect(await (await getLocalDb()).count("cards")).toBe(0);
  });

  it("edits, archives and keeps archived cards visible", async () => {
    const u = user();
    const account = await addAccount("EJEMPLO-FICTICIO Pagos");
    await openPage();
    await fillCard(u, { name: "EJEMPLO-FICTICIO Master", account: account.id, closing: "1", due: "10" });
    await waitFor(() => expect(rowFor("EJEMPLO-FICTICIO Master")).toBeTruthy());
    await u.click(within(rowFor("EJEMPLO-FICTICIO Master")).getByRole("button", { name: /Editar/ }));
    const form = await screen.findByRole("form", { name: "Editar tarjeta" });
    await u.clear(within(form).getByLabelText("Día de vencimiento"));
    await u.type(within(form).getByLabelText("Día de vencimiento"), "15");
    await u.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(rowFor("EJEMPLO-FICTICIO Master")).toHaveTextContent("día 15"));

    await u.click(within(rowFor("EJEMPLO-FICTICIO Master")).getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(screen.getByTestId("cards-archived")).toHaveTextContent("EJEMPLO-FICTICIO Master"));
    expect(screen.getByTestId("cards-facts")).toHaveTextContent("0 activas · 1 archivada");
  });

  it("a card with movements: no delete, account locked; the summary never treats the limit as money", async () => {
    const u = user();
    const { dataSet, files } = await samplePublication(2);
    await importPublication(await getLocalDb(), dataSet, files);
    await openPage();
    const summary = screen.getByTestId("cards-summary");
    expect(within(summary).getByTestId("hero-committed")).toHaveTextContent("$ 18.140");
    expect(screen.queryByText(/crédito disponible|^disponible/i)).toBeNull();
    expect(within(summary).getByTestId("cards-limit")).toHaveTextContent("no dinero disponible");
    const card = dataSet.cards[0]!;
    await u.click(within(rowFor(card.name)).getByRole("button", { name: /Editar/ }));
    const form = await screen.findByRole("form", { name: "Editar tarjeta" });
    expect(within(form).queryByRole("button", { name: "Eliminar tarjeta" })).not.toBeInTheDocument();
    expect(within(form).getByLabelText("Cuenta de pago")).toBeDisabled();
  });

  it("persists across a reload", async () => {
    const u = user();
    const account = await addAccount("EJEMPLO-FICTICIO Pagos");
    const first = await openPage();
    await fillCard(u, { name: "EJEMPLO-FICTICIO Persiste", type: "debit", account: account.id });
    await waitFor(() => expect(rowFor("EJEMPLO-FICTICIO Persiste")).toBeTruthy());
    first.unmount();
    await openPage();
    expect(rowFor("EJEMPLO-FICTICIO Persiste")).toBeTruthy();
  });
});

describe("Card repository rules (Step 03)", () => {
  it("refuses a missing account and a currency other than the account's", async () => {
    const db = await getLocalDb();
    const repos = createRepositories({ db });
    const account = await addAccount("EJEMPLO-FICTICIO Pagos");
    const base = { name: "EJEMPLO-FICTICIO", cardType: "debit" as const, lastFourDigits: null, creditLimit: null, closingDay: null, dueDay: null, status: "active" as const };
    await expect(repos.cards.create({ ...base, accountId: ID(999), currency: "ARS" })).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    await expect(repos.cards.create({ ...base, accountId: account.id, currency: "USD" })).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
    await expect(repos.cards.create({ ...base, accountId: account.id, currency: "ARS", cvv: "123" } as never)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses to move a card with movements to another account", async () => {
    const db = await getLocalDb();
    const { dataSet, files } = await samplePublication(2);
    await importPublication(db, dataSet, files);
    const repos = createRepositories({ db });
    const card = dataSet.cards[0]!;
    await expect(repos.cards.update(card.id, { accountId: ID(2) }, card.rev)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
  });
});
