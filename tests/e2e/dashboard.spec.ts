import { expect, test, type Page } from "@playwright/test";

/** Step 07 — Panel on the production build, desktop and iPhone viewport. Fictitious data only. */
const isPhone = (name: string) => name === "iphone";

async function createAccount(page: Page, name: string, balance: string) {
  await page.goto("/cuentas");
  await expect(page.getByTestId("accounts-loading")).toHaveCount(0);
  const first = page.getByRole("button", { name: "Crear la primera cuenta" });
  if (await first.isVisible()) await first.click();
  else await page.getByRole("button", { name: "Nueva cuenta" }).click();
  const form = page.getByRole("form", { name: "Nueva cuenta" });
  await form.getByLabel("Nombre").fill(name);
  await form.getByLabel("Saldo inicial").fill(balance);
  await form.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(form).toBeHidden();
}

async function newTransaction(page: Page, phone: boolean) {
  if (phone) await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Nueva transacción" }).click();
  else await page.locator("aside").getByRole("link", { name: /Nueva transacción/ }).click();
  const form = page.getByRole("form", { name: "Nueva transacción" });
  await expect(form).toBeVisible();
  return form;
}

async function openPanel(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("dashboard-loading")).toHaveCount(0);
}

test.describe("Panel", () => {
  test("indicators follow the data: transfers and pending excluded; period filter; details; navigation", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await openPanel(page);
    await expect(page.getByText("Agrega la primera cuenta para empezar.")).toBeVisible();

    await createAccount(page, "EJEMPLO-FICTICIO Sueldo", "100.000");
    await createAccount(page, "EJEMPLO-FICTICIO Ahorro", "0");
    let form = await newTransaction(page, phone);
    await form.getByRole("radio", { name: "Ingreso" }).click();
    await form.getByLabel("Importe").fill("50.000");
    await form.getByRole("button", { name: "Sueldo", exact: true }).click();
    await form.getByLabel("Descripción").fill("EJEMPLO-FICTICIO Cobro");
    await form.getByLabel("Cuenta que recibe").selectOption({ label: "EJEMPLO-FICTICIO Sueldo · ARS" });
    await form.getByRole("button", { name: "Guardar ingreso" }).click();
    await expect(form).toBeHidden();
    form = await newTransaction(page, phone);
    await form.getByLabel("Importe").fill("20.000");
    await form.getByRole("button", { name: "Alimentación", exact: true }).click();
    await form.getByLabel("Descripción").fill("EJEMPLO-FICTICIO Super");
    await form.getByLabel("Cuenta", { exact: true }).selectOption({ label: "EJEMPLO-FICTICIO Sueldo · ARS" });
    await form.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(form).toBeHidden();
    form = await newTransaction(page, phone);
    await form.getByRole("radio", { name: "Transferencia" }).click();
    await form.getByLabel("Importe").fill("10.000");
    await form.getByLabel("Descripción").fill("EJEMPLO-FICTICIO A ahorro");
    await form.getByLabel("Desde la cuenta").selectOption({ label: "EJEMPLO-FICTICIO Sueldo · ARS" });
    await form.getByLabel("Hacia la cuenta").selectOption({ label: "EJEMPLO-FICTICIO Ahorro · ARS" });
    await form.getByRole("button", { name: "Guardar transferencia" }).click();
    await expect(form).toBeHidden();
    form = await newTransaction(page, phone);
    await form.getByLabel("Importe").fill("5.000");
    await form.getByRole("button", { name: "Compras", exact: true }).click();
    await form.getByLabel("Descripción").fill("EJEMPLO-FICTICIO Pendiente");
    await form.getByLabel("Cuenta", { exact: true }).selectOption({ label: "EJEMPLO-FICTICIO Sueldo · ARS" });
    await form.getByLabel("Estado").selectOption("pending");
    await form.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(form).toBeHidden();

    await openPanel(page);
    // 100.000 + 50.000 − 20.000; the transfer moves money between accounts; the pending one waits.
    await expect(page.getByTestId("hero-balance")).toHaveText("$ 130.000");
    await expect(page.getByTestId("flow-income")).toHaveText("+$ 50.000,00");
    await expect(page.getByTestId("flow-expenses")).toHaveText("−$ 20.000,00");
    await expect(page.getByTestId("flow-result")).toHaveText("$ 30.000,00");
    await expect(page.getByTestId("flow-pending")).toContainText("$ 5.000 de gastos");
    await expect(page.getByTestId("recent-item")).toHaveCount(4);

    // Detail of a recent transaction, cancelled from the Panel: the indicators follow.
    await page.getByRole("button", { name: "Ver detalle de EJEMPLO-FICTICIO Super" }).click();
    const sheet = page.getByTestId("transaction-detail");
    await sheet.getByRole("button", { name: "Cancelar movimiento" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar movimiento" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("flow-expenses")).toHaveText("$ 0,00");
    await expect(page.getByTestId("hero-balance")).toHaveText("$ 150.000");
    await expect(page.getByTestId("recent-item")).toHaveCount(3);

    // Period filter: the year, then the previous year (no movements), back to today.
    await page.getByRole("button", { name: "Año", exact: true }).click();
    await expect(page.getByTestId("dashboard-title")).toHaveText(/^\d{4}$/);
    const year = Number(await page.getByTestId("dashboard-title").textContent());
    await page.getByRole("button", { name: "Período anterior" }).click();
    await expect(page.getByTestId("dashboard-title")).toHaveText(String(year - 1));
    await expect(page.getByTestId("period-flow")).toContainText("Sin movimientos completados en el período.");
    await page.getByRole("button", { name: "Volver a hoy" }).click();
    await expect(page.getByTestId("dashboard-title")).toHaveText(String(year));
    await page.getByRole("button", { name: "Mes", exact: true }).click();

    // Navigation to the modules.
    await page.getByTestId("dashboard-account").filter({ hasText: "EJEMPLO-FICTICIO Ahorro" }).click();
    await expect(page).toHaveURL(/\/cuentas\/[0-9a-f-]{36}$/);
    await openPanel(page);
    await page.getByRole("link", { name: "Ver presupuestos" }).click();
    await expect(page).toHaveURL(/\/presupuesto#presupuestos$/);
  });

  test("fits the viewport without horizontal scroll", async ({ page }) => {
    await createAccount(page, "EJEMPLO-FICTICIO Cuenta con un nombre bastante largo", "1.234.567,89");
    await openPanel(page);
    await expect(page.getByTestId("hero-balance")).toBeVisible();
    for (const g of ["Semana", "Mes", "Trimestre", "Año"]) {
      await page.getByRole("button", { name: g, exact: true }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
});
