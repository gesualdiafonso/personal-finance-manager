import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** Step 08 — Informes on the production build, desktop and iPhone viewport. Fictitious data only. */
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

async function openReports(page: Page) {
  await page.goto("/informes");
  await expect(page.getByTestId("reports-loading")).toHaveCount(0);
}

const rowOf = (page: Page, name: RegExp) => page.getByTestId("statement").getByRole("row", { name });
const statementValue = async (page: Page, phone: boolean, label: string) =>
  phone
    ? page.getByTestId("statement").getByRole("listitem").filter({ hasText: label }).first()
    : rowOf(page, new RegExp(`^${label}`));

test.describe("Informes", () => {
  test("income, expenses, sections and exports from the local data", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await openReports(page);
    await expect(page.getByTestId("reports-empty")).toBeVisible();

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

    await openReports(page);
    await expect(page.getByTestId("report-controls")).toBeVisible();
    // The transfer is neither income nor expense.
    await expect(await statementValue(page, phone, "Ingresos")).toContainText("+$ 50.000");
    await expect(await statementValue(page, phone, "Gastos")).toContainText("−$ 20.000");
    await expect(await statementValue(page, phone, "Resultado")).toContainText("$ 30.000");
    await expect(page.getByTestId("monthly-chart")).toBeVisible();
    await expect(page.getByTestId("top-categories")).toContainText("Alimentación");

    // Cash flow: internal transfer cancels out; balance 130.000.
    await page.getByRole("tab", { name: "Flujo de caja" }).click();
    await expect(page.getByTestId("cf-closing")).toContainText("$ 130.000");
    await expect(page.getByTestId("cashflow-chart")).toBeVisible();
    await page.getByRole("tab", { name: "Categorías" }).click();
    await expect(page.getByTestId("categories-expense")).toContainText("100,0 % del total");
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await expect(page.getByTestId("account-report")).toHaveCount(2);

    // Account filter: only the savings account → a transfer in, no income or expense.
    if (phone) await page.getByRole("button", { name: "Más filtros" }).click(); // folded on the phone
    await page.getByLabel("Cuenta", { exact: true }).selectOption({ label: "EJEMPLO-FICTICIO Ahorro · ARS" });
    await expect(page.getByTestId("account-report")).toHaveCount(1);
    await expect(page.getByTestId("account-closing")).toContainText("$ 10.000");
    await page.getByRole("button", { name: "Quitar filtros" }).click();

    // Exports are local downloads, with the plaintext warning on screen.
    await expect(page.getByTestId("export-warning")).toContainText("no están cifrados");
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV de transacciones" }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^pfm-informe-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}-transacciones\.csv$/);
    const text = readFileSync((await csv.path())!, "utf8");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain("EJEMPLO-FICTICIO Super");
    const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "JSON" }).click()]);
    const doc = JSON.parse(readFileSync((await json.path())!, "utf8"));
    expect(doc).toMatchObject({ format: "pfm.report", encrypted: false, timeZone: "America/Argentina/Buenos_Aires" });

    // Print / PDF: no navigation, the print header, every section.
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect(page.getByTestId("print-header")).toBeVisible();
    await expect(page.getByTestId("print-all")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeHidden();
    await expect(page.getByTestId("report-export")).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen" });
    await expect(page.getByTestId("print-all")).toHaveCount(0);
  });

  test("fits the viewport without horizontal scroll in every section and period", async ({ page }) => {
    await createAccount(page, "EJEMPLO-FICTICIO Cuenta con un nombre bastante largo", "1.234.567,89");
    await openReports(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const g of ["Semana", "Mes", "Trimestre", "Año", "Personalizado"]) {
      await page.getByRole("button", { name: g, exact: true }).click();
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
    for (const tab of ["Flujo de caja", "Categorías", "Cuentas", "Tarjetas", "Presupuestos", "Metas"]) {
      await page.getByRole("tab", { name: tab }).click();
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
  });
});
