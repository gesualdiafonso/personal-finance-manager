import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AccountDetailPage } from "@/features/accounts/account-detail-page";
import { CardDetailPage } from "@/features/cards/card-detail-page";
import { getLocalDb } from "@/hooks/use-local-data";
import { importPublication } from "@/services/storage/local-store";
import { samplePublication, sampleId as ID } from "../helpers/sample-data";

async function withSample() {
  const { dataSet, files } = await samplePublication(2);
  await importPublication(await getLocalDb(), dataSet, files);
  return dataSet;
}
async function open(path: string, Page: () => React.JSX.Element) {
  window.history.pushState({}, "", path);
  render(<Page />);
  await waitFor(() => expect(screen.queryByTestId("detail-loading")).not.toBeInTheDocument());
}

describe("Account detail", () => {
  it("shows facts, balances, linked cards and movements from the stored data", async () => {
    await withSample();
    await open(`/cuentas/${ID(1)}`, AccountDetailPage);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("EJEMPLO-FICTICIO Cuenta A");
    expect(screen.getByRole("navigation", { name: "Ruta" })).toHaveTextContent("Cuentas");
    expect(screen.getByTestId("detail-balance")).toHaveTextContent("$ 4.397.690");
    expect(screen.getByTestId("detail-projected")).toHaveTextContent("$ 4.392.690,00"); // − pending 5.000
    expect(screen.getByTestId("detail-initial")).toHaveTextContent("$ 1.000.000,00");
    expect(screen.getByTestId("linked-cards")).toHaveTextContent("EJEMPLO-FICTICIO");
    expect(screen.getAllByTestId("movement-row")).toHaveLength(6);
  });

  it("filters movements by type and status", async () => {
    const u = userEvent.setup();
    await withSample();
    await open(`/cuentas/${ID(1)}`, AccountDetailPage);
    await u.selectOptions(screen.getByLabelText("Tipo"), "transfer");
    expect(screen.getAllByTestId("movement-row")).toHaveLength(1);
    expect(screen.getByTestId("movement-row")).toHaveTextContent("A EJEMPLO-FICTICIO Cuenta B");
    await u.selectOptions(screen.getByLabelText("Tipo"), "all");
    await u.selectOptions(screen.getByLabelText("Estado"), "pending");
    expect(screen.getAllByTestId("movement-row")).toHaveLength(1);
    await u.selectOptions(screen.getByLabelText("Período"), "all");
    expect(screen.getByTestId("movements-count")).toHaveTextContent("1 movimiento");
  });

  it("an account without movements says so; an unknown id says it was not found", async () => {
    const db = await getLocalDb();
    const { createRepositories } = await import("@/services/repositories/repositories");
    const a = await createRepositories({ db }).accounts.create({ name: "EJEMPLO-FICTICIO Nueva", institution: null, accountType: "cash", currency: "USD", initialBalance: 100, openingDate: null, status: "active" });
    await open(`/cuentas/${a.id}`, AccountDetailPage);
    expect(screen.getByTestId("movements")).toHaveTextContent("Todavía no hay movimientos");
    expect(screen.getByTestId("detail-balance")).toHaveTextContent("US$ 1");
  });

  it("unknown id", async () => {
    await open(`/cuentas/${ID(999)}`, AccountDetailPage);
    expect(screen.getByTestId("detail-not-found")).toHaveTextContent("No encontramos esta cuenta");
  });
});

describe("Card detail", () => {
  it("shows the schedule, the limit as a limit, the committed amount and purchases", async () => {
    const ds = await withSample();
    await open(`/tarjetas/${ID(6)}`, CardDetailPage);
    const card = ds.cards[0]!;
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(card.name);
    expect(screen.getByTestId("detail-committed")).toHaveTextContent("$ 18.140");
    const detail = screen.getByTestId("card-detail");
    expect(within(detail).getByText("Es el límite acordado con el emisor, no dinero disponible.")).toBeInTheDocument();
    expect(within(detail).getByTestId("detail-next-due")).not.toHaveTextContent("—");
    expect(screen.getAllByTestId("movement-row")).toHaveLength(1);
    expect(screen.queryByLabelText("Tipo")).not.toBeInTheDocument(); // only purchases on a card
  });
});
