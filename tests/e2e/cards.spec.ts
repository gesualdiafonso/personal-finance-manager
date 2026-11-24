import { expect, test, type Page } from "@playwright/test";

/** Step 03 — Cards management on the production build, desktop and iPhone viewport. Fictitious data only. */
const isPhone = (name: string) => name === "iphone";

async function createAccount(page: Page, name: string, currency: "ARS" | "USD" = "ARS") {
  await page.goto("/cuentas");
  await expect(page.getByTestId("accounts-loading")).toHaveCount(0);
  const first = page.getByRole("button", { name: "Crear la primera cuenta" });
  if (await first.isVisible()) await first.click();
  else await page.getByRole("button", { name: "Nueva cuenta" }).click();
  const form = page.getByRole("form", { name: "Nueva cuenta" });
  await form.getByLabel("Nombre").fill(name);
  await form.getByLabel("Moneda").selectOption(currency);
  await form.getByLabel("Saldo inicial").fill("0");
  await form.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByTestId("accounts-empty")).toHaveCount(0);
}

async function openCreate(page: Page) {
  await expect(page.getByTestId("cards-loading")).toHaveCount(0);
  const first = page.getByRole("button", { name: "Crear la primera tarjeta" });
  if (await first.isVisible()) await first.click();
  else await page.getByRole("button", { name: "Nueva tarjeta" }).click();
  return page.getByRole("form", { name: "Nueva tarjeta" });
}

const entry = (page: Page, phone: boolean, name: string) => page.getByTestId(phone ? "card-item" : "card-row").filter({ hasText: name });

async function openEdit(page: Page, phone: boolean, name: string) {
  const e = entry(page, phone, name);
  if (phone) {
    await e.getByRole("link").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
    await page.getByRole("button", { name: "Editar" }).click();
  } else await e.getByRole("button", { name: /Editar/ }).click();
  return page.getByRole("form", { name: "Editar tarjeta" });
}

async function backToList(page: Page) {
  if (!page.url().endsWith("/tarjetas")) await page.getByRole("navigation", { name: "Ruta" }).getByRole("link", { name: "Tarjetas" }).click();
  await expect(page.getByTestId("cards-loading")).toHaveCount(0);
}

test.describe("Cards", () => {
  test("needs an account first", async ({ page }) => {
    await page.goto("/tarjetas");
    await expect(page.getByTestId("cards-empty")).toContainText("Primero crea una cuenta");
    await page.getByRole("link", { name: "Ir a Cuentas" }).click();
    await expect(page).toHaveURL(/\/cuentas$/);
  });

  test("create with validation errors, edit, archive and persistence after reload", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await createAccount(page, "EJEMPLO-FICTICIO Pagos");
    await page.goto("/tarjetas");

    let form = await openCreate(page);
    await form.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Visa");
    await form.getByLabel("Últimos 4 dígitos").fill("12");
    await form.getByLabel("Día de cierre").fill("40");
    await form.getByRole("button", { name: "Crear tarjeta" }).click();
    await expect(form.getByText("Escribe exactamente 4 dígitos o deja el campo vacío.")).toBeVisible();
    await expect(form.getByText("Escribe un día entre 1 y 31.").first()).toBeVisible();

    await form.getByLabel("Últimos 4 dígitos").fill("4417");
    await form.getByLabel("Límite de crédito").fill("500.000");
    await form.getByLabel("Día de cierre").fill("20");
    await form.getByLabel("Día de vencimiento").fill("5");
    await expect(form.getByTestId("card-currency")).toHaveText("Pesos (ARS)");
    await form.getByRole("button", { name: "Crear tarjeta" }).click();
    await expect(form).toBeHidden();
    await expect(page.getByTestId("feedback")).toHaveText("Tarjeta creada.");
    await expect(entry(page, phone, "EJEMPLO-FICTICIO Visa")).toContainText("··4417");
    await expect(page.getByTestId("cards-limit")).toContainText("$ 500.000");
    await expect(page.getByTestId("cards-limit")).toContainText("no dinero disponible");

    form = await openEdit(page, phone, "EJEMPLO-FICTICIO Visa");
    await form.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Visa Oro");
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(form).toBeHidden();
    await backToList(page);
    await expect(entry(page, phone, "EJEMPLO-FICTICIO Visa Oro")).toBeVisible();

    form = await openEdit(page, phone, "EJEMPLO-FICTICIO Visa Oro");
    await form.getByLabel("Estado").selectOption("inactive");
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(form).toBeHidden();
    await backToList(page);
    await expect(page.getByTestId("cards-archived")).toContainText("EJEMPLO-FICTICIO Visa Oro");

    await page.reload();
    await expect(page.getByTestId("cards-archived")).toContainText("EJEMPLO-FICTICIO Visa Oro");
    await expect(page.getByTestId("cards-facts")).toContainText("0 activas · 1 archivada");
  });

  test("debit and prepaid: no credit fields, own sections; delete with confirmation", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await createAccount(page, "EJEMPLO-FICTICIO Dólares", "USD");
    await page.goto("/tarjetas");
    for (const [name, type] of [
      ["EJEMPLO-FICTICIO Débito", "debit"],
      ["EJEMPLO-FICTICIO Prepaga", "prepaid"],
    ] as const) {
      const form = await openCreate(page);
      await form.getByLabel("Nombre").fill(name);
      await form.getByLabel("Tipo").selectOption(type);
      await expect(form.getByTestId("credit-fields")).toHaveCount(0);
      await expect(form.getByTestId("card-currency")).toHaveText("Dólares (USD)");
      await form.getByRole("button", { name: "Crear tarjeta" }).click();
      await expect(form).toBeHidden();
      await expect(page.getByTestId("cards-empty")).toHaveCount(0);
    }
    await expect(page.getByTestId("cards-debit")).toContainText("EJEMPLO-FICTICIO Débito");
    await expect(page.getByTestId("cards-prepaid")).toContainText("EJEMPLO-FICTICIO Prepaga");

    const form = await openEdit(page, phone, "EJEMPLO-FICTICIO Prepaga");
    await form.getByRole("button", { name: "Eliminar tarjeta" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText("Tarjeta eliminada.")).toBeVisible();
    await page.goto("/tarjetas");
    await expect(page.getByTestId("cards-loading")).toHaveCount(0);
    await expect(page.getByTestId("cards-prepaid")).toHaveCount(0);
  });

  test("no horizontal overflow; the phone keeps the Obligaciones switcher", async ({ page }, info) => {
    await createAccount(page, "EJEMPLO-FICTICIO Pagos");
    await page.goto("/tarjetas");
    const form = await openCreate(page);
    await form.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Tarjeta con nombre largo");
    await form.getByLabel("Día de cierre").fill("31");
    await form.getByLabel("Día de vencimiento").fill("10");
    await form.getByRole("button", { name: "Crear tarjeta" }).click();
    await expect(form).toBeHidden();
    if (isPhone(info.project.name)) await expect(page.getByRole("navigation", { name: "Obligaciones" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("card detail: schedule, limit labelled as a limit, link to the paying account", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await createAccount(page, "EJEMPLO-FICTICIO Pagos");
    await page.goto("/tarjetas");
    const form = await openCreate(page);
    await form.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Visa");
    await form.getByLabel("Últimos 4 dígitos").fill("4417");
    await form.getByLabel("Límite de crédito").fill("300.000");
    await form.getByLabel("Día de cierre").fill("31");
    await form.getByLabel("Día de vencimiento").fill("10");
    await form.getByRole("button", { name: "Crear tarjeta" }).click();
    await expect(form).toBeHidden();
    await entry(page, phone, "EJEMPLO-FICTICIO Visa").getByRole("link").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("EJEMPLO-FICTICIO Visa ··4417");
    await expect(page.getByTestId("detail-limit").locator("dd")).toHaveText("$ 300.000");
    await expect(page.getByTestId("card-detail")).toContainText("no dinero disponible");
    await expect(page.getByTestId("detail-next-closing").locator("dd")).not.toHaveText("—");
    await expect(page.getByTestId("movements")).toContainText("Todavía no hay movimientos");
    await page.getByRole("link", { name: "EJEMPLO-FICTICIO Pagos" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("EJEMPLO-FICTICIO Pagos");
    await expect(page.getByTestId("linked-cards")).toContainText("EJEMPLO-FICTICIO Visa");
  });
});
