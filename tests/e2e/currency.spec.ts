import { expect, test, type Page } from "@playwright/test";

/**
 * Step 10 addendum — multi-currency on the production build (desktop and iPhone viewport).
 * Quotations are FICTITIOUS and typed by hand: the provider is never called here.
 */
const isPhone = (name: string) => name === "iphone";

async function createAccount(page: Page, name: string, currency: string, balance: string) {
  await page.goto("/cuentas");
  await expect(page.getByTestId("accounts-loading")).toHaveCount(0);
  const first = page.getByRole("button", { name: "Crear la primera cuenta" });
  if (await first.isVisible()) await first.click();
  else await page.getByRole("button", { name: "Nueva cuenta" }).click();
  const form = page.getByRole("form", { name: "Nueva cuenta" });
  await form.getByLabel("Nombre").fill(name);
  await form.getByLabel("Moneda").selectOption(currency);
  await form.getByLabel("Saldo inicial").fill(balance);
  await form.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(form).toBeHidden();
}

test("Moneda y cambio: rates, converter, estimate stored with the movement, consolidated balance", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let providerCalls = 0;
  await page.route("https://dolarapi.com/**", (route) => {
    providerCalls++;
    return route.abort();
  });

  await page.goto("/configuracion");
  const section = page.getByTestId("currency-settings");
  await expect(section.getByRole("heading", { name: "Moneda y cambio" })).toBeVisible();
  await section.getByRole("button", { name: "EUR", exact: true }).click();
  await section.locator("input[name='quote-oficial-USD']").fill("1.450");
  await section.locator("input[name='quote-oficial-EUR']").fill("1.600");
  await section.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(page.getByText("Configuración de moneda guardada")).toBeVisible();

  const converter = section.getByTestId("fx-converter");
  await expect(converter.getByLabel("Cotización")).toHaveValue("1.450");
  await converter.getByLabel("Monto (USD)").fill("100");
  await expect(converter.getByTestId("fx-converter-result")).toContainText("145.000");
  await converter.getByLabel("Cotización").fill("1.000");
  await expect(converter.getByTestId("fx-converter-result")).toContainText("100.000");
  await expect(converter.getByTestId("fx-converter-result")).toContainText("Personalizada");

  // Settings survive a reload (IndexedDB).
  await page.reload();
  await expect(page.getByTestId("currency-settings").locator("input[name='quote-oficial-USD']")).toHaveValue("1.450");

  await createAccount(page, "EJEMPLO-FICTICIO Pesos", "ARS", "500.000");
  await createAccount(page, "EJEMPLO-FICTICIO Dólares", "USD", "1.000");
  await createAccount(page, "EJEMPLO-FICTICIO Euros", "EUR", "200");
  const estimate = page.getByTestId("consolidated-estimate");
  await expect(estimate).toContainText("Total estimado en ARS");
  await expect(estimate).toContainText("2.270.000");
  await expect(page.getByTestId("approx-money").filter({ visible: true }).first()).toContainText("1.450.000");

  // A movement in USD stores its estimate; later rate changes do not recalculate it.
  if (isPhone(info.project.name)) await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Nueva transacción" }).click();
  else await page.locator("aside").getByRole("link", { name: /Nueva transacción/ }).click();
  const form = page.getByRole("form", { name: "Nueva transacción" });
  await form.getByLabel("Cuenta", { exact: true }).selectOption({ label: "EJEMPLO-FICTICIO Dólares · USD" });
  await form.getByLabel("Importe").fill("100");
  await expect(form.getByTestId("conversion-result")).toContainText("145.000");
  await form.getByLabel("Descripción").fill("EJEMPLO-FICTICIO compra");
  await form.getByRole("button", { name: "Guardar gasto" }).click();
  await expect(form).toBeHidden();

  await page.goto("/configuracion");
  await page.getByTestId("currency-settings").locator("input[name='quote-oficial-USD']").fill("2.000");
  await page.getByTestId("currency-settings").getByRole("button", { name: "Guardar configuración" }).click();
  await expect(page.getByText("Configuración de moneda guardada")).toBeVisible();

  await page.goto("/transacciones");
  await page.getByText("EJEMPLO-FICTICIO compra").filter({ visible: true }).first().click();
  await expect(page.getByTestId("detail-conversion")).toContainText("145.000");
  await expect(page.getByTestId("detail-rate")).toContainText("1.450");

  await page.goto("/");
  await expect(page.getByTestId("dashboard-loading")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-hero").getByTestId("consolidated-estimate")).toContainText("Total estimado en ARS");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(providerCalls).toBe(0); // opt-in only
  expect(errors).toEqual([]);
});
