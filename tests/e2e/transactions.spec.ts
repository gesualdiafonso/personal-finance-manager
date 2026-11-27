import { expect, test, type Page } from "@playwright/test";

/** Step 04 — registering movements on the production build (desktop and iPhone viewport). Fictitious data only. */
const isPhone = (name: string) => name === "iphone";

async function createAccount(page: Page, name: string, balance: string) {
  await page.goto("/cuentas");
  await expect(page.getByTestId("auth-checking")).toHaveCount(0);
  await expect(page.getByTestId("accounts-loading")).toHaveCount(0);
  const first = page.getByRole("button", { name: "Crear la primera cuenta" });
  if (await first.isVisible()) await first.click();
  else await page.getByRole("button", { name: "Nueva cuenta" }).click();
  const form = page.getByRole("form", { name: "Nueva cuenta" });
  await form.getByLabel("Nombre").fill(name);
  await form.getByLabel("Saldo inicial").fill(balance);
  await form.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByTestId("accounts-empty")).toHaveCount(0);
}

/** The global entry point: sidebar button on desktop, "+" in the tab bar on the phone. */
async function openNewTransaction(page: Page, phone: boolean) {
  if (phone) await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Nueva transacción" }).click();
  else await page.locator("aside").getByRole("link", { name: /Nueva transacción/ }).click();
  const form = page.getByRole("form", { name: "Nueva transacción" });
  await expect(form).toBeVisible();
  return form;
}

async function balanceOf(page: Page, phone: boolean, name: string) {
  await page.goto("/cuentas");
  await expect(page.getByTestId("auth-checking")).toHaveCount(0);
  await expect(page.getByTestId("accounts-loading")).toHaveCount(0);
  return page.getByTestId(phone ? "account-item" : "account-row").filter({ hasText: name });
}

test.describe("Transactions — registration", () => {
  test("income, expense and transfer update the accounts; errors are shown; persists", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await createAccount(page, "EJEMPLO-FICTICIO Sueldo", "1.000");
    await createAccount(page, "EJEMPLO-FICTICIO Ahorro", "0");

    // From another page the global button goes to /transacciones and opens the sheet.
    let form = await openNewTransaction(page, phone);
    await expect(page).toHaveURL(/\/transacciones$/);
    await form.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(form.getByText("Escribe el importe.")).toBeVisible();
    await expect(form.getByText("Escribe una descripción.")).toBeVisible();

    await form.getByRole("radio", { name: "Ingreso" }).click();
    await form.getByLabel("Importe").fill("500,50");
    await form.getByRole("button", { name: "Sueldo" }).click();
    await form.getByLabel("Descripción").fill("EJEMPLO-FICTICIO Cobro");
    await form.getByLabel("Cuenta que recibe").selectOption({ label: "EJEMPLO-FICTICIO Sueldo · ARS" });
    await form.getByRole("button", { name: "Guardar ingreso" }).click();
    await expect(form).toBeHidden();
    await expect(page.getByText("Ingreso guardado.")).toBeVisible();

    form = await openNewTransaction(page, phone);
    await form.getByLabel("Importe").fill("200");
    await form.getByRole("button", { name: "Alimentación" }).click();
    await form.getByLabel("Descripción").fill("EJEMPLO-FICTICIO Super");
    await form.getByLabel("Cuenta").selectOption({ label: "EJEMPLO-FICTICIO Sueldo · ARS" });
    await form.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(form).toBeHidden();

    form = await openNewTransaction(page, phone);
    await form.getByRole("radio", { name: "Transferencia" }).click();
    await form.getByLabel("Importe").fill("300");
    await form.getByLabel("Descripción").fill("EJEMPLO-FICTICIO Ahorro mensual");
    await form.getByLabel("Desde la cuenta").selectOption({ label: "EJEMPLO-FICTICIO Sueldo · ARS" });
    await form.getByLabel("Hacia la cuenta").selectOption({ label: "EJEMPLO-FICTICIO Ahorro · ARS" });
    await form.getByRole("button", { name: "Guardar transferencia" }).click();
    await expect(form).toBeHidden();
    await expect(page.getByTestId("results-count")).toHaveText("3 transacciones");

    // 1.000 + 500,50 − 200 − 300 = 1.000,50 ; Ahorro: 0 + 300
    await expect(await balanceOf(page, phone, "EJEMPLO-FICTICIO Sueldo")).toContainText("1.000,50");
    await expect(await balanceOf(page, phone, "EJEMPLO-FICTICIO Ahorro")).toContainText("300");

    await page.goto("/transacciones");
    await page.reload();
    await expect(page.getByTestId(phone ? "ledger-item" : "ledger-row")).toHaveCount(3);
  });

  test("keyboard N opens the sheet on desktop; the sheet fits the viewport on the phone", async ({ page }, info) => {
    await createAccount(page, "EJEMPLO-FICTICIO Cuenta", "0");
    if (isPhone(info.project.name)) {
      const form = await openNewTransaction(page, true);
      const box = await page.getByTestId("transaction-sheet").boundingBox();
      expect(box?.width).toBe(390);
      await expect(form.getByLabel("Importe")).toBeFocused();
    } else {
      await page.keyboard.press("n");
      await expect(page.getByRole("form", { name: "Nueva transacción" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("form", { name: "Nueva transacción" })).toBeHidden();
      await page.keyboard.press("n"); // already on /transacciones: opens again without navigating
      await expect(page.getByRole("form", { name: "Nueva transacción" })).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("list: search, type/period/account filters combined, clear, totals, reload", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await createAccount(page, "EJEMPLO-FICTICIO Sueldo", "0");
    await createAccount(page, "EJEMPLO-FICTICIO Efectivo", "0");
    const baTodayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()).split("-").map(Number) as [number, number, number];
    const [y, m] = baTodayParts;
    const prevMonth = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-15`;
    const add = async (o: { type?: string; amount: string; description: string; account: string; date?: string }) => {
      const form = await openNewTransaction(page, phone);
      if (o.type) await form.getByRole("radio", { name: o.type }).click();
      await form.getByLabel("Importe").fill(o.amount);
      await form.getByLabel("Descripción").fill(o.description);
      await form.getByLabel(o.type === "Ingreso" ? "Cuenta que recibe" : "Cuenta").selectOption({ label: `${o.account} · ARS` });
      if (o.date) await form.getByLabel("Fecha").fill(o.date);
      await form.getByRole("button", { name: /Guardar/ }).click();
      await expect(form).toBeHidden();
    };
    await add({ type: "Ingreso", amount: "1.000", description: "EJEMPLO-FICTICIO Sueldo noviembre", account: "EJEMPLO-FICTICIO Sueldo" });
    await add({ amount: "100", description: "EJEMPLO-FICTICIO Panadería", account: "EJEMPLO-FICTICIO Efectivo" });
    await add({ amount: "250", description: "EJEMPLO-FICTICIO Farmacia", account: "EJEMPLO-FICTICIO Sueldo" });
    await add({ amount: "999", description: "EJEMPLO-FICTICIO Mes pasado", account: "EJEMPLO-FICTICIO Sueldo", date: prevMonth });

    const count = page.getByTestId("results-count");
    await expect(count).toHaveText("3 transacciones"); // this month only
    const ars = page.getByTestId("summary-ARS");
    await expect(ars).toContainText("+$ 1.000");
    await expect(ars).toContainText("−$ 350");

    await page.getByLabel("Buscar", { exact: true }).fill("panaderia");
    await expect(count).toHaveText("1 transacción");
    await page.getByLabel("Buscar", { exact: true }).fill("");
    await expect(count).toHaveText("3 transacciones");

    if (phone) await page.getByRole("button", { name: /Más filtros/ }).click();
    await page.getByLabel("Tipo", { exact: true }).selectOption("expense");
    await expect(count).toHaveText("2 transacciones");
    await page.getByLabel("Cuenta", { exact: true }).selectOption({ label: "EJEMPLO-FICTICIO Sueldo" });
    await expect(count).toHaveText("1 transacción");
    await page.getByLabel("Período", { exact: true }).selectOption("prevMonth");
    await expect(count).toHaveText("1 transacción");
    await expect(page.getByTestId(phone ? "ledger-item" : "ledger-row")).toContainText("EJEMPLO-FICTICIO Mes pasado");
    await page.getByLabel("Período", { exact: true }).selectOption("all");
    await expect(count).toHaveText("2 transacciones");

    await page.getByRole("button", { name: "Quitar filtros" }).first().click();
    await expect(count).toHaveText("3 transacciones");

    await page.reload();
    await expect(page.getByTestId("results-count")).toHaveText("3 transacciones");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("detail, edit with balance impact, cancel and delete", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await createAccount(page, "EJEMPLO-FICTICIO Caja", "1.000");
    const add = async (amount: string, description: string, status?: string) => {
      const form = await openNewTransaction(page, phone);
      await form.getByLabel("Importe").fill(amount);
      await form.getByLabel("Descripción").fill(description);
      if (status) await form.getByLabel("Estado").selectOption(status);
      await form.getByRole("button", { name: "Guardar gasto" }).click();
      await expect(form).toBeHidden();
    };
    await add("100", "EJEMPLO-FICTICIO Kiosco");
    await add("50", "EJEMPLO-FICTICIO Pendiente", "pending");
    const row = (text: string) => page.getByTestId(phone ? "ledger-item" : "ledger-row").filter({ hasText: text });
    const openDetail = async (text: string) => {
      if (phone) await row(text).click();
      else await row(text).getByRole("button", { name: text }).click();
      const view = page.getByTestId("transaction-detail-view");
      await expect(view).toBeVisible();
      return view;
    };

    let view = await openDetail("EJEMPLO-FICTICIO Kiosco");
    await expect(view.getByTestId("detail-amount")).toContainText("−$ 100");
    await view.getByRole("button", { name: "Editar" }).click();
    const form = page.getByRole("form", { name: "Editar transacción" });
    await form.getByLabel("Importe").fill("300");
    await form.getByRole("button", { name: "Guardar cambios" }).click();
    const impact = page.getByRole("alertdialog");
    await expect(impact.getByTestId("edit-impact")).toContainText("$ 900,00 → $ 700,00");
    await impact.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Cambios guardados.")).toBeVisible();
    await expect(page.getByTestId("summary-ARS")).toContainText("−$ 300");

    view = await openDetail("EJEMPLO-FICTICIO Kiosco");
    await view.getByRole("button", { name: "Cancelar movimiento" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar movimiento" }).click();
    await expect(page.getByText("Movimiento cancelado.")).toBeVisible();
    await expect(row("EJEMPLO-FICTICIO Kiosco")).toContainText("Cancelado");
    await expect(page.getByTestId("transactions-summary")).toContainText("Sin ingresos ni gastos");

    view = await openDetail("EJEMPLO-FICTICIO Pendiente");
    await view.getByRole("button", { name: "Eliminar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText("Movimiento eliminado.")).toBeVisible();
    await expect(page.getByTestId("results-count")).toHaveText("1 transacción");

    await page.reload();
    await expect(page.getByTestId("results-count")).toHaveText("1 transacción");
    await expect(await balanceOf(page, phone, "EJEMPLO-FICTICIO Caja")).toContainText("1.000");
  });
});
