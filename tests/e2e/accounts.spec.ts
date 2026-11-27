import { expect, test, type Page } from "@playwright/test";

/**
 * Step 03 — Accounts management, on the production build, desktop (1440×900, table) and
 * iPhone viewport (390×844, list + bottom sheet). Every value is fictitious. Each test starts
 * with an empty IndexedDB (new browser context per test).
 */
const isPhone = (name: string) => name === "iphone";

async function openCreate(page: Page) {
  await expect(page.getByTestId("auth-checking")).toHaveCount(0);
  await expect(page.getByTestId("accounts-loading")).toHaveCount(0);
  const first = page.getByRole("button", { name: "Crear la primera cuenta" });
  if (await first.isVisible()) await first.click();
  else await page.getByRole("button", { name: "Nueva cuenta" }).click();
  return page.getByRole("form", { name: "Nueva cuenta" });
}

async function createAccount(page: Page, name: string, balance: string, currency: "ARS" | "USD" = "ARS") {
  const form = await openCreate(page);
  await form.getByLabel("Nombre").fill(name);
  await form.getByLabel("Moneda").selectOption(currency);
  await form.getByLabel("Saldo inicial").fill(balance);
  await form.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(form).toBeHidden();
  // The list re-reads IndexedDB after the write: wait until the empty state is gone.
  await expect(page.getByTestId("accounts-empty")).toHaveCount(0);
}

function accountEntry(page: Page, phone: boolean, name: string) {
  return page.getByTestId(phone ? "account-item" : "account-row").filter({ hasText: name });
}

async function openEdit(page: Page, phone: boolean, name: string) {
  const entry = accountEntry(page, phone, name);
  if (phone) {
    // Phone: the row opens the detail page; editing starts from there.
    await entry.getByRole("link").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await page.getByRole("button", { name: "Editar" }).click();
  } else await entry.getByRole("button", { name: /Editar/ }).click();
  return page.getByRole("form", { name: "Editar cuenta" });
}

async function backToList(page: Page, phone: boolean) {
  if (phone && !page.url().endsWith("/cuentas")) await page.getByRole("navigation", { name: "Ruta" }).getByRole("link", { name: "Cuentas" }).click();
  await expect(page.getByTestId("auth-checking")).toHaveCount(0);
  await expect(page.getByTestId("accounts-loading")).toHaveCount(0);
}

test.describe("Accounts", () => {
  test("empty state, create, validation errors and persistence after reload", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await page.goto("/cuentas");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cuentas");
    await expect(page.getByTestId("accounts-empty")).toBeVisible();

    const form = await openCreate(page);
    await form.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(form.getByText("Escribe un nombre para la cuenta.")).toBeVisible();
    await expect(form.getByText("Escribe el saldo inicial (puede ser 0).")).toBeVisible();
    await form.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Sueldo");
    await form.getByLabel("Saldo inicial").fill("12,345");
    await form.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(form.getByText("Usa como máximo 2 decimales.")).toBeVisible();
    await form.getByLabel("Saldo inicial").fill("150.000,50");
    await form.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(form).toBeHidden();
    await expect(page.getByTestId("feedback")).toHaveText("Cuenta creada.");

    const entry = accountEntry(page, phone, "EJEMPLO-FICTICIO Sueldo");
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("Solo en este dispositivo");
    await expect(page.getByTestId("hero-balance")).toHaveText("$ 150.000,50");

    await page.reload();
    await expect(accountEntry(page, phone, "EJEMPLO-FICTICIO Sueldo")).toBeVisible();
    await expect(page.getByTestId("hero-balance")).toHaveText("$ 150.000,50");
  });

  test("currencies are never added together", async ({ page }) => {
    await page.goto("/cuentas");
    await createAccount(page, "EJEMPLO-FICTICIO Pesos", "1.000");
    await createAccount(page, "EJEMPLO-FICTICIO Dólares", "250", "USD");
    const summary = page.getByTestId("accounts-summary");
    await expect(summary.getByTestId("hero-balance")).toHaveText("$ 1.000");
    await expect(summary).toContainText("US$ 250");
    await expect(summary).not.toContainText("1.250");
  });

  test("edit, archive and delete with confirmation", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await page.goto("/cuentas");
    await createAccount(page, "EJEMPLO-FICTICIO Vieja", "0");

    let form = await openEdit(page, phone, "EJEMPLO-FICTICIO Vieja");
    await expect(form.getByLabel("Saldo inicial")).toHaveCount(0);
    await form.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Nueva");
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(form).toBeHidden();
    await backToList(page, phone);
    await expect(accountEntry(page, phone, "EJEMPLO-FICTICIO Nueva")).toBeVisible();

    form = await openEdit(page, phone, "EJEMPLO-FICTICIO Nueva");
    await form.getByLabel("Estado").selectOption("archived");
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(form).toBeHidden();
    await backToList(page, phone);
    await expect(page.getByText("Archivadas (1)")).toBeVisible();
    await expect(page.getByTestId("accounts-facts")).toContainText("0 activas");

    form = await openEdit(page, phone, "EJEMPLO-FICTICIO Nueva");
    await form.getByRole("button", { name: "Eliminar cuenta" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("¿Eliminar esta cuenta?");
    await confirm.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText("Cuenta eliminada.")).toBeVisible(); // previous pages stay mounted hidden (Activity)
    if (phone) await expect(page.getByTestId("detail-not-found")).toBeVisible();
    await page.goto("/cuentas");
    await expect(page.getByTestId("accounts-empty")).toBeVisible();
  });

  test("layout: table on desktop, list and full-height sheet on the phone, no horizontal overflow", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await page.goto("/cuentas");
    await createAccount(page, "EJEMPLO-FICTICIO Cuenta con un nombre bastante largo", "1.234.567,89");
    if (phone) {
      await expect(page.getByTestId("account-item")).toBeVisible();
      await expect(page.locator("table")).toBeHidden();
      await openCreate(page);
      const sheet = page.getByTestId("account-sheet");
      const box = await sheet.boundingBox();
      expect(box?.width).toBe(390);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    } else {
      await expect(page.getByRole("columnheader", { name: "Saldo actual" })).toBeVisible();
      await openCreate(page);
      const box = await page.getByTestId("account-sheet").boundingBox();
      expect(box?.width).toBe(440);
      expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(1440);
      await page.keyboard.press("Escape");
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("detail page: facts, linked cards, movements; opens offline for any account", async ({ page, context }, info) => {
    const phone = isPhone(info.project.name);
    await page.goto("/cuentas");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => (await caches.keys()).length > 0 && Boolean(await caches.match("/cuentas/_")));
    await createAccount(page, "EJEMPLO-FICTICIO Detalle", "2.500,75");
    await createAccount(page, "EJEMPLO-FICTICIO Nunca abierta", "10", "USD");

    const entry = accountEntry(page, phone, "EJEMPLO-FICTICIO Detalle");
    await entry.getByRole("link", { name: phone ? undefined : "EJEMPLO-FICTICIO Detalle" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("EJEMPLO-FICTICIO Detalle");
    await expect(page.getByTestId("detail-balance")).toHaveText("$ 2.500,75");
    await expect(page.getByTestId("detail-initial")).toContainText("$ 2.500,75");
    await expect(page.getByTestId("linked-cards")).toContainText("Ninguna tarjeta usa esta cuenta.");
    await expect(page.getByTestId("movements")).toContainText("Todavía no hay movimientos");

    // Offline: an account whose page was never opened still opens from the cached shell.
    const id = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((ok, ko) => {
        const r = indexedDB.open("pfm-local");
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
      });
      const all = await new Promise<{ id: string; name: string }[]>((ok) => {
        const r = db.transaction("accounts").objectStore("accounts").getAll();
        r.onsuccess = () => ok(r.result);
      });
      db.close();
      return all.find((a) => a.name.endsWith("Nunca abierta"))!.id;
    });
    await context.setOffline(true);
    await page.goto(`/cuentas/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("EJEMPLO-FICTICIO Nunca abierta");
    await expect(page.getByTestId("detail-balance")).toHaveText("US$ 10");
    await context.setOffline(false);
  });
});
