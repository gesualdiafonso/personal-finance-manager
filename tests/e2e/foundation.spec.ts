import { expect, test } from "@playwright/test";

const AREAS = [
  ["/", "Panel"],
  ["/transacciones", "Transacciones"],
  ["/cuentas-domesticas", "Cuentas domésticas"],
  ["/tarjetas", "Tarjetas"],
  ["/recurrencias", "Recurrencias"],
  ["/cuentas", "Cuentas"],
  ["/presupuesto", "Presupuesto"],
  ["/informes", "Informes"],
  ["/configuracion", "Configuración"],
] as const;

function buenosAiresToday(): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

test.describe("application foundation", () => {
  test("starts and renders the Dashboard empty state in Spanish", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByTestId("hero-balance")).toHaveText("$ 0");
    await expect(page.getByText("Agrega la primera cuenta para empezar.")).toBeVisible();
  });

  test("shows today in Buenos Aires even when the device is in Tokyo", async ({ page }) => {
    await page.goto("/");
    const label = page.locator("header .type-label");
    await expect(label).toHaveText(buenosAiresToday(), { ignoreCase: true });
    expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("Asia/Tokyo");
  });

  for (const [path, title] of AREAS) {
    test(`area ${path} has its own route and title`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      if (path !== "/") await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    });
  }
});

test.describe("navigation", () => {
  test("desktop: sidebar lists the nine areas, text only", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.goto("/");
    const sidebar = page.locator("aside").filter({ hasText: "Nueva transacción" });
    await expect(sidebar).toBeVisible();
    for (const [, title] of AREAS) await expect(sidebar.getByRole("link", { name: title, exact: true })).toBeVisible();
    await expect(sidebar.locator("svg")).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Panel", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("data-status")).toContainText("Sin datos publicados");
  });

  test("iPhone: tab bar, Obligaciones reopens the last area, Más lists all nine", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone");
    await page.goto("/");
    const tabbar = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(tabbar.getByRole("link", { name: "Inicio" })).toBeVisible();
    await page.goto("/tarjetas");
    await expect(page.getByRole("navigation", { name: "Obligaciones" }).getByRole("link", { name: "Tarjetas" })).toHaveAttribute("aria-current", "page");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Obligaciones" })).toHaveAttribute("href", "/tarjetas");
    await page.getByRole("button", { name: "Más" }).click();
    const sheet = page.getByRole("dialog", { name: "Más" });
    for (const [, title] of AREAS) await expect(sheet.getByRole("link", { name: title, exact: true })).toBeVisible();
  });
});
