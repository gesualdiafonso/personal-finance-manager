import { expect, test, type Page } from "@playwright/test";

/** Step 05 — Cuentas domésticas on the production build, desktop and iPhone viewport. Fictitious data only. */

function buenosAiresDate(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

async function openCreate(page: Page) {
  await expect(page.getByTestId("bills-loading")).toHaveCount(0);
  const first = page.getByRole("button", { name: "Registrar la primera" });
  if (await first.isVisible()) await first.click();
  else await page.getByRole("button", { name: "Nueva cuenta" }).click();
  return page.getByRole("form", { name: "Nueva cuenta doméstica" });
}

async function createBill(page: Page, name: string, amount: string, dueDate: string) {
  const form = await openCreate(page);
  await form.getByLabel("Nombre").fill(name);
  await form.getByLabel("Importe").fill(amount);
  await form.getByLabel("Vencimiento").fill(dueDate);
  await form.getByRole("button", { name: "Guardar cuenta" }).click();
  await expect(form).toBeHidden();
}

const row = (page: Page, name: string) => page.getByTestId("bill-row").filter({ hasText: name });

test.describe("Cuentas domésticas", () => {
  test("create with validation, groups by due date, edit, cancel and persistence after reload", async ({ page }) => {
    await page.goto("/cuentas-domesticas");
    await expect(page.getByTestId("bills-empty")).toBeVisible();

    const form = await openCreate(page);
    await form.getByRole("button", { name: "Guardar cuenta" }).click();
    await expect(form.getByText("Escribe un nombre.")).toBeVisible();
    await expect(form.getByText("Escribe el importe.")).toBeVisible();
    await form.getByRole("button", { name: "Cancelar" }).click();

    await createBill(page, "EJEMPLO-FICTICIO Expensas", "85.000", buenosAiresDate(-1));
    await createBill(page, "EJEMPLO-FICTICIO Luz", "12.345,67", buenosAiresDate(5));
    await expect(page.getByTestId("bills-overdue")).toContainText("EJEMPLO-FICTICIO Expensas");
    await expect(row(page, "EJEMPLO-FICTICIO Expensas")).toContainText("Vencida");
    await expect(page.getByTestId("bills-next7")).toContainText("EJEMPLO-FICTICIO Luz");
    await expect(page.getByTestId("bills-pending-total")).toHaveText("$ 97.345,67");
    await expect(page.getByTestId("bills-counts")).toHaveText("2 pendientes · 1 vencida");

    await row(page, "EJEMPLO-FICTICIO Luz").click();
    const sheet = page.getByTestId("bill-detail");
    await sheet.getByRole("button", { name: "Editar" }).click();
    await sheet.getByLabel("Importe").fill("15.000");
    await sheet.getByRole("button", { name: "Guardar" }).click();
    await expect(sheet.getByTestId("bill-detail-remaining")).toHaveText("$ 15.000,00");
    await sheet.getByRole("button", { name: "Cancelar cuenta" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar cuenta" }).click();
    await expect(page.getByTestId("bill-detail")).toBeHidden();
    await expect(page.getByTestId("bills-cancelled")).toContainText("EJEMPLO-FICTICIO Luz");

    await page.reload();
    await expect(page.getByTestId("bills-loading")).toHaveCount(0);
    await expect(page.getByTestId("bills-overdue")).toContainText("EJEMPLO-FICTICIO Expensas");
    await expect(page.getByTestId("bills-cancelled")).toContainText("EJEMPLO-FICTICIO Luz");
    await expect(page.getByTestId("bills-counts")).toHaveText("1 pendiente · 1 vencida");
  });

  test("fits the viewport without horizontal scroll", async ({ page }) => {
    await page.goto("/cuentas-domesticas");
    await createBill(page, "EJEMPLO-FICTICIO Alquiler con un nombre bastante largo", "1.250.000", buenosAiresDate(12));
    await expect(row(page, "EJEMPLO-FICTICIO Alquiler")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
