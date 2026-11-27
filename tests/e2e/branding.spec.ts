import { expect, test } from "@playwright/test";

/** AUREON identity: logo assets, theme switch (system first, persisted, no flash), profile access. */
const LOGOS = [
  "aureon-logo.svg",
  "aureon-logo-light.svg",
  "aureon-logo-dark.svg",
  "aureon-logo-gold.svg",
  "aureon-logo-mono.svg",
  "aureon-monogram.svg",
  "aureon-monogram-light.svg",
  "aureon-monogram-dark.svg",
  "aureon-monogram-mono.svg",
];

test.describe("AUREON branding", () => {
  test("serves the SVG logo set and the app icon", async ({ request }) => {
    for (const file of LOGOS) {
      const res = await request.get(`/brand/${file}`);
      expect(res.ok(), file).toBe(true);
      expect(await res.text()).toContain('aria-label="AUREON"');
    }
    expect((await request.get("/icon.svg")).ok()).toBe(true);
  });

  test("first visit follows the system theme; the switch persists without a flash", async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("pfm.theme"))).toBeNull();

    const toggle = page.getByTestId("theme-toggle").locator("visible=true").first();
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
    expect(await page.evaluate(() => localStorage.getItem("pfm.theme"))).toBe("paper");

    // Applied in the first parsed document, before hydration.
    await page.reload({ waitUntil: "commit" });
    await page.waitForFunction(() => document.documentElement !== null);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("paper");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(bg).toBe("rgb(244, 240, 231)"); // Ivory Paper #F4F0E7
    await context.close();
  });

  test("profile access and brand statement in Configuración", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("profile-menu").locator("visible=true").first().click();
    await page.getByTestId("profile-menu-panel").getByRole("link", { name: "Configuración" }).click();
    await expect(page).toHaveURL(/\/configuracion$/);
    await expect(page.getByTestId("about-brand")).toContainText("Wealth is built with intention.");
    await expect(page.getByTestId("about-brand")).toContainText("Clarity in every financial decision.");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
