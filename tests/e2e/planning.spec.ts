import { expect, test, type Page } from "@playwright/test";

/** Step 06 — Presupuesto (budgets and goals) on the production build, desktop and iPhone viewport. Fictitious data only. */
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
}

async function createExpense(page: Page, phone: boolean, amount: string, category: string, description: string) {
  if (phone) await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Nueva transacción" }).click();
  else await page.locator("aside").getByRole("link", { name: /Nueva transacción/ }).click();
  const form = page.getByRole("form", { name: "Nueva transacción" });
  await expect(form).toBeVisible();
  await form.getByLabel("Importe").fill(amount);
  await form.getByRole("button", { name: category, exact: true }).click();
  await form.getByLabel("Descripción").fill(description);
  await form.getByRole("button", { name: "Guardar gasto" }).click();
  await expect(form).toBeHidden();
}

async function openPlanning(page: Page, hash = "") {
  await page.goto(`/presupuesto${hash}`);
  await expect(page.getByTestId("auth-checking")).toHaveCount(0);
  await expect(page.getByTestId("planning-loading")).toHaveCount(0);
}

test.describe("Presupuesto", () => {
  test("budget: create, view, edit and see its expenses; goal: create, contribute, progress, complete; persists", async ({ page }, info) => {
    const phone = isPhone(info.project.name);
    await createAccount(page, "EJEMPLO-FICTICIO Sueldo", "500.000");
    await createExpense(page, phone, "40.000", "Alimentación", "EJEMPLO-FICTICIO Super");
    await createExpense(page, phone, "5.000", "Compras", "EJEMPLO-FICTICIO Regalo");

    // 1. Create a budget (empty state first, with validation).
    await openPlanning(page, "#presupuestos");
    await expect(page.getByTestId("budgets-empty")).toBeVisible();
    await page.getByRole("button", { name: "Crear el primero" }).click();
    let form = page.getByRole("form", { name: "Nuevo presupuesto" });
    await form.getByRole("button", { name: "Crear presupuesto" }).click();
    await expect(form.getByText("Escribe un nombre.")).toBeVisible();
    await expect(form.getByText("Escribe el límite.")).toBeVisible();
    await form.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Comida");
    await form.getByLabel("Categoría").selectOption({ label: "Alimentación" });
    await form.getByLabel("Límite").fill("50.000");
    await expect(form.getByTestId("budget-range")).toContainText("Del 01/");
    await form.getByRole("button", { name: "Crear presupuesto" }).click();
    await expect(form).toBeHidden();

    // 2. View it: spent 40.000 of 50.000 (the other category is not counted).
    const row = page.getByTestId("budget-row").filter({ hasText: "EJEMPLO-FICTICIO Comida" });
    await expect(row).toContainText("$ 40.000,00");
    await expect(row).toContainText("80 %");
    await expect(row.getByTestId("budget-state")).toHaveText("Dentro del presupuesto");

    // 3. Edit: a lower limit puts it over budget.
    await row.click();
    const sheet = page.getByTestId("budget-detail");
    await expect(sheet.getByTestId("budget-detail-spent")).toContainText("$ 40.000,00");
    // 4. The expenses it counts.
    await expect(sheet.getByTestId("budget-expenses")).toContainText("EJEMPLO-FICTICIO Super");
    await expect(sheet.getByTestId("budget-expenses")).not.toContainText("EJEMPLO-FICTICIO Regalo");
    await sheet.getByRole("button", { name: "Editar" }).click();
    await sheet.getByLabel("Límite").fill("30.000");
    await sheet.getByRole("button", { name: "Guardar" }).click();
    await expect(sheet.getByTestId("budget-detail-remaining")).toContainText("$ 10.000,00");
    await expect(sheet.getByTestId("budget-state")).toHaveText("Excedido");
    await sheet.getByRole("button", { name: "Cerrar" }).click();

    // 5. Create a goal.
    await page.getByRole("tab", { name: "Metas" }).click();
    await page.getByRole("button", { name: "Crear la primera" }).click();
    form = page.getByRole("form", { name: "Nueva meta" });
    await form.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Computadora");
    await form.getByLabel("Tipo").selectOption({ label: "Compra" });
    await form.getByLabel("Objetivo").fill("100.000");
    await form.getByLabel("Ya ahorrado").fill("20.000");
    await form.getByRole("button", { name: "Crear meta" }).click();
    await expect(form).toBeHidden();

    // 6. Contribute and 7. see the progress.
    await page.getByTestId("goal-card").filter({ hasText: "EJEMPLO-FICTICIO Computadora" }).click();
    const goal = page.getByTestId("goal-detail");
    await expect(goal.getByTestId("goal-detail-percent")).toHaveText("20 %");
    await expect(goal.getByRole("button", { name: "Marcar como cumplida" })).toHaveCount(0);
    await goal.getByRole("button", { name: "Registrar aporte" }).click();
    const contribution = goal.getByRole("form", { name: "Registrar aporte" });
    await contribution.getByLabel("Importe").fill("80.000");
    await contribution.getByLabel("Cuenta de origen").selectOption({ label: "EJEMPLO-FICTICIO Sueldo" });
    await contribution.getByRole("button", { name: "Registrar aporte" }).click();
    await expect(goal.getByTestId("goal-detail-percent")).toHaveText("100 %");
    await expect(goal.getByTestId("goal-contributions")).toContainText("Desde EJEMPLO-FICTICIO Sueldo");
    await expect(goal.getByTestId("goal-status")).toHaveText("Objetivo alcanzado");

    // 8. Complete it (the user decides; it is never automatic).
    await goal.getByRole("button", { name: "Marcar como cumplida" }).click();
    await expect(goal.getByTestId("goal-status")).toHaveText("Cumplida");
    await goal.getByRole("button", { name: "Cerrar" }).click();

    // The contribution did not change the account balance (it is not an expense).
    await page.goto("/cuentas");
    await expect(page.getByTestId("auth-checking")).toHaveCount(0);
    await expect(page.getByTestId("accounts-loading")).toHaveCount(0);
    await expect(page.getByTestId(phone ? "account-item" : "account-row").filter({ hasText: "EJEMPLO-FICTICIO Sueldo" })).toContainText("$ 455.000");

    // 9. Persistence after reload, summary per currency.
    await openPlanning(page);
    await page.reload();
    await expect(page.getByTestId("auth-checking")).toHaveCount(0);
    await expect(page.getByTestId("planning-loading")).toHaveCount(0);
    await expect(page.getByTestId("budget-counts")).toHaveText("1 activo · 1 excedido");
    await expect(page.getByTestId("budget-total-ARS")).toContainText("$ 40.000");
    await expect(page.getByTestId("top-categories-ARS")).toContainText("Alimentación");
    await expect(page.getByTestId("goal-counts")).toHaveText("0 activas · 1 cumplida");
    await page.getByRole("tab", { name: "Metas" }).click();
    await expect(page.getByTestId("goals-completed")).toContainText("EJEMPLO-FICTICIO Computadora");
  });

  test("fits the viewport without horizontal scroll (10. mobile)", async ({ page }) => {
    await openPlanning(page, "#presupuestos");
    await page.getByRole("button", { name: "Crear el primero" }).click();
    const form = page.getByRole("form", { name: "Nuevo presupuesto" });
    await form.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Un presupuesto general con un nombre largo");
    await form.getByLabel("Límite").fill("1.250.000");
    await form.getByLabel("Período").selectOption({ label: "Trimestral" });
    await form.getByRole("button", { name: "Crear presupuesto" }).click();
    await expect(form).toBeHidden();
    await expect(page.getByTestId("budget-row")).toBeVisible();
    for (const tab of ["Resumen", "Presupuestos", "Metas"]) {
      await page.getByRole("tab", { name: tab }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
});
