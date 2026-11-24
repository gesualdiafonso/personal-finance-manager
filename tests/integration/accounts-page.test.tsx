import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AccountsPage } from "@/features/accounts/accounts-page";
import { getLocalDb } from "@/hooks/use-local-data";
import { importPublication } from "@/services/storage/local-store";
import { samplePublication, sampleId as ID } from "../helpers/sample-data";

/**
 * Accounts management through the real interface, the real repositories and IndexedDB
 * (fake-indexeddb). No mocks of the persistence layer. All data is fictitious.
 */
const user = () => userEvent.setup();

async function openPage() {
  const view = render(<AccountsPage />);
  await waitFor(() => expect(screen.queryByTestId("accounts-loading")).not.toBeInTheDocument());
  return view;
}

async function createAccount(
  u: ReturnType<typeof user>,
  fields: { name: string; type?: string; currency?: "ARS" | "USD"; balance: string; institution?: string },
  expectSaved = true,
) {
  const trigger = screen.queryByRole("button", { name: "Crear la primera cuenta" }) ?? screen.getByRole("button", { name: "Nueva cuenta" });
  await u.click(trigger);
  const form = await screen.findByRole("form", { name: "Nueva cuenta" });
  await u.type(within(form).getByLabelText("Nombre"), fields.name);
  if (fields.institution) await u.type(within(form).getByLabelText("Institución"), fields.institution);
  if (fields.type) await u.selectOptions(within(form).getByLabelText("Tipo de cuenta"), fields.type);
  if (fields.currency) await u.selectOptions(within(form).getByLabelText("Moneda"), fields.currency);
  await u.type(within(form).getByLabelText("Saldo inicial"), fields.balance);
  await u.click(within(form).getByRole("button", { name: "Crear cuenta" }));
  if (expectSaved) {
    await waitFor(() => expect(screen.queryByRole("form", { name: "Nueva cuenta" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByTestId("account-row").some((r) => within(r).queryByText(fields.name))).toBe(true));
  }
}

const rowFor = (name: string) => screen.getAllByTestId("account-row").find((r) => within(r).queryByText(name))!;

describe("Accounts page", () => {
  it("shows the empty state with a clear first action", async () => {
    await openPage();
    expect(screen.getByTestId("accounts-empty")).toHaveTextContent("Todavía no hay cuentas");
    expect(screen.getByRole("button", { name: "Crear la primera cuenta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva cuenta" })).not.toBeInTheDocument(); // one primary (P-17)
  });

  it("creates an account through the repository and lists it", async () => {
    const u = user();
    await openPage();
    await createAccount(u, { name: "EJEMPLO-FICTICIO Sueldo", institution: "EJEMPLO-FICTICIO Banco", balance: "150.000,50" });
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Cuenta creada.");
    const row = rowFor("EJEMPLO-FICTICIO Sueldo");
    expect(row).toHaveTextContent("Solo en este dispositivo");
    expect(row).toHaveTextContent("Activa");
    expect(within(row).getByLabelText("$ 150.000,50")).toBeInTheDocument();
    const db = await getLocalDb();
    const [stored] = await db.getAll("accounts");
    expect(stored).toMatchObject({ initialBalance: 15_000_050, currency: "ARS", rev: 1 });
    expect((await db.getAll("outbox")).map((o) => o.op)).toEqual(["create"]);
  });

  it("shows field errors, keeps the sheet open and stores nothing", async () => {
    const u = user();
    await openPage();
    await createAccount(u, { name: " ", balance: "12,345" }, false);
    const form = screen.getByRole("form", { name: "Nueva cuenta" });
    expect(within(form).getByText("Escribe un nombre para la cuenta.")).toBeInTheDocument();
    expect(within(form).getByText("Usa como máximo 2 decimales.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
    expect(await (await getLocalDb()).count("accounts")).toBe(0);
  });

  it("keeps the form open with its values when saving fails", async () => {
    const u = user();
    await openPage();
    (await getLocalDb()).close(); // the next write fails at the IndexedDB level
    await createAccount(u, { name: "EJEMPLO-FICTICIO Falla", balance: "10" }, false);
    const form = screen.getByRole("form", { name: "Nueva cuenta" });
    expect(await within(form).findByRole("alert")).toHaveTextContent("No se pudo guardar");
    expect(within(form).getByLabelText("Nombre")).toHaveValue("EJEMPLO-FICTICIO Falla");
  });

  it("never adds currencies together: ARS hero, USD shown apart", async () => {
    const u = user();
    await openPage();
    await createAccount(u, { name: "EJEMPLO-FICTICIO Pesos", balance: "1.000" });
    await createAccount(u, { name: "EJEMPLO-FICTICIO Dólares", currency: "USD", type: "savings", balance: "250" });
    await waitFor(() => expect(screen.getAllByTestId("account-row")).toHaveLength(2));
    const summary = screen.getByTestId("accounts-summary");
    expect(within(summary).getByTestId("hero-balance")).toHaveTextContent("$ 1.000");
    expect(within(summary).getByLabelText("US$ 250")).toBeInTheDocument();
    expect(within(summary).queryByText(/1\.250/)).not.toBeInTheDocument();
    expect(screen.getByTestId("accounts-facts")).toHaveTextContent("2 activas · 2 bancarias · 0 en efectivo · 0 archivadas");
  });

  it("edits, archives and reactivates; archived accounts stay listed", async () => {
    const u = user();
    await openPage();
    await createAccount(u, { name: "EJEMPLO-FICTICIO Vieja", balance: "0" });
    await u.click(within(await waitFor(() => rowFor("EJEMPLO-FICTICIO Vieja"))).getByRole("button", { name: /Editar/ }));
    const form = await screen.findByRole("form", { name: "Editar cuenta" });
    expect(within(form).queryByLabelText("Saldo inicial")).not.toBeInTheDocument(); // D3-04
    await u.clear(within(form).getByLabelText("Nombre"));
    await u.type(within(form).getByLabelText("Nombre"), "EJEMPLO-FICTICIO Nueva");
    await u.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(rowFor("EJEMPLO-FICTICIO Nueva")).toBeTruthy());

    await u.click(within(rowFor("EJEMPLO-FICTICIO Nueva")).getByRole("button", { name: "Archivar" }));
    const archived = await screen.findByTestId("accounts-archived");
    expect(archived).toHaveTextContent("EJEMPLO-FICTICIO Nueva");
    expect(screen.getByText("Archivadas (1)")).toBeInTheDocument();
    expect(screen.getByTestId("accounts-facts")).toHaveTextContent("0 activas");
    await u.click(within(archived).getByRole("button", { name: "Reactivar" }));
    await waitFor(() => expect(screen.queryByTestId("accounts-archived")).not.toBeInTheDocument());
  });

  it("deletes an account without references only after confirmation", async () => {
    const u = user();
    await openPage();
    await createAccount(u, { name: "EJEMPLO-FICTICIO Borrar", balance: "0" });
    await u.click(within(await waitFor(() => rowFor("EJEMPLO-FICTICIO Borrar"))).getByRole("button", { name: /Editar/ }));
    await u.click(await screen.findByRole("button", { name: "Eliminar cuenta" }));
    const dialog = await screen.findByRole("alertdialog");
    await u.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByTestId("accounts-empty")).toBeInTheDocument();
    const [tomb] = await (await getLocalDb()).getAll("accounts");
    expect(tomb!.deletedAt).not.toBeNull(); // tombstone, never a silent removal
  });

  it("offers only archiving for an account with references, and locks its currency", async () => {
    const u = user();
    const { dataSet, files } = await samplePublication(2);
    await importPublication(await getLocalDb(), dataSet, files);
    await openPage();
    await u.click(within(rowFor("EJEMPLO-FICTICIO Cuenta A")).getByRole("button", { name: /Editar/ }));
    const form = await screen.findByRole("form", { name: "Editar cuenta" });
    expect(within(form).queryByRole("button", { name: "Eliminar cuenta" })).not.toBeInTheDocument();
    expect(within(form).getByText(/No se puede eliminar: \d+ registros la usan/)).toBeInTheDocument();
    expect(within(form).getByLabelText("Moneda")).toBeDisabled();
  });

  it("corrects the initial balance through the explicit, confirmed flow (D3-04)", async () => {
    const u = user();
    const { dataSet, files } = await samplePublication(2);
    await importPublication(await getLocalDb(), dataSet, files);
    await openPage();
    await u.click(within(rowFor("EJEMPLO-FICTICIO Cuenta B")).getByRole("button", { name: /Editar/ }));
    await u.click(await screen.findByRole("button", { name: "Corregir saldo inicial" }));
    const dialog = await screen.findByRole("alertdialog");
    await u.type(within(dialog).getByLabelText("Nuevo saldo inicial"), "500");
    expect(within(dialog).getByTestId("balance-after")).toHaveTextContent("$ 10.500,00"); // 10.000 transfer in + 500
    await u.click(within(dialog).getByRole("button", { name: "Confirmar corrección" }));
    expect(await screen.findByTestId("feedback")).toHaveTextContent("Saldo inicial corregido.");
    const db = await getLocalDb();
    expect((await db.get("accounts", ID(2)))!.initialBalance).toBe(50_000);
    const [op] = await db.getAll("outbox");
    expect(op).toMatchObject({ op: "update", entity: "accounts", recordId: ID(2), baseRev: 1 });
    expect((await db.getAll("transactions")).length).toBe(7); // movements untouched
  });

  it("persists across a reload of the page", async () => {
    const u = user();
    const first = await openPage();
    await createAccount(u, { name: "EJEMPLO-FICTICIO Persiste", balance: "1" });
    await waitFor(() => expect(rowFor("EJEMPLO-FICTICIO Persiste")).toBeTruthy());
    first.unmount();
    await openPage();
    expect(rowFor("EJEMPLO-FICTICIO Persiste")).toBeTruthy();
  });

  it("shows an error state when IndexedDB is unavailable", async () => {
    // @ts-expect-error — simulate a browser without IndexedDB
    globalThis.indexedDB = undefined;
    await openPage();
    expect(screen.getByRole("alert")).toHaveTextContent("El almacenamiento local no está disponible");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
