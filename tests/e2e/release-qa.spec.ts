import { expect, test, type Page } from "@playwright/test";

/**
 * Step 10 — release QA smoke over every area, in both themes: semantics, accessible names,
 * keyboard focus, no horizontal overflow (phone, tablet, laptop, desktop), no runtime errors,
 * and the PWA assets. Empty local data only (nothing is created here).
 */
const ROUTES = ["/", "/transacciones", "/cuentas-domesticas", "/tarjetas", "/recurrencias", "/cuentas", "/presupuesto", "/informes", "/configuracion", "/perfil", "/offline"];
const THEMES = ["paper", "dark"] as const;

async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute("aria-label");
      if (aria) return aria;
      const by = el.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        if (el.labels && el.labels.length > 0) return [...el.labels].map((l) => l.textContent ?? "").join(" ");
        return el.getAttribute("title") ?? "";
      }
      const text = (el.textContent ?? "").trim();
      if (text) return text;
      const img = el.querySelector("[role=img][aria-label], img[alt], svg title");
      return img?.getAttribute("aria-label") ?? img?.getAttribute("alt") ?? img?.textContent ?? el.getAttribute("title") ?? "";
    };
    return [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab]")]
      .filter((el) => visible(el) && !el.closest("[aria-hidden=true]") && nameOf(el).trim() === "")
      .map((el) => el.outerHTML.slice(0, 120));
  });
}

for (const theme of THEMES) {
  test(`all areas — semantics, names and layout (${theme})`, async ({ page }, info) => {
    const errors: string[] = [];
    let current = "";
    page.on("pageerror", (e) => errors.push(`${current}: ${e.message.slice(0, 80)}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${current}: ${m.text().slice(0, 80)}`));
    await page.addInitScript((t) => localStorage.setItem("pfm.theme", t), theme);
    const viewports = info.project.name === "desktop" ? [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }] : [null];
    for (const route of ROUTES) {
      current = route;
      const res = await page.goto(route);
      expect(res?.status(), route).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
      await expect(page.locator("h1"), route).toHaveCount(1);
      expect(await unnamedControls(page), route).toEqual([]);
      for (const vp of viewports) {
        if (vp) await page.setViewportSize(vp);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${route} ${vp ? vp.width : info.project.name}`).toBeLessThanOrEqual(0);
      }
      if (info.project.name === "desktop") await page.setViewportSize({ width: 1440, height: 900 });
    }
    expect(errors).toEqual([]);
  });
}

test("keyboard: skip link first, visible focus ring", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("auth-checking")).toHaveCount(0);
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveText("Ir al contenido");
  const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  const next = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.outerHTML.slice(0, 60) ?? "");
  expect(next).not.toBe("");
});

test("PWA and brand assets are served with the right types", async ({ request }) => {
  const checks: [string, RegExp][] = [
    ["/manifest.webmanifest", /application\/manifest\+json|application\/json/],
    ["/sw.js", /javascript/],
    ["/icon.svg", /image\/svg\+xml/],
    ["/icons/icon-192.png", /image\/png/],
    ["/icons/icon-512.png", /image\/png/],
    ["/icons/icon-maskable-512.png", /image\/png/],
    ["/icons/apple-touch-icon.png", /image\/png/],
    ["/brand/aureon-logo.svg", /image\/svg\+xml/],
  ];
  for (const [url, type] of checks) {
    const res = await request.get(url);
    expect(res.ok(), url).toBe(true);
    expect(res.headers()["content-type"], url).toMatch(type);
  }
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ short_name: "AUREON", theme_color: "#17251F", background_color: "#F4F0E7", display: "standalone" });
  const home = await request.get("/");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  const html = await home.text();
  expect(html).toContain('rel="apple-touch-icon"');
  expect(html).toMatch(/<link rel="icon" href="\/icon\.svg/);
});

test.describe("account screens (signed out)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const theme of ["paper", "dark"] as const) {
    test(`/registro and /entrar — ${theme}: one h1, named controls, no overflow, no errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message.slice(0, 80)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 80)));
      await page.addInitScript((t) => localStorage.setItem("pfm.theme", t), theme);
      await page.goto("/registro");
      await expect(page.getByRole("form", { name: "Crear tu cuenta" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await unnamedControls(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      // /entrar stays the login screen even without an account, and explains it.
      await page.goto("/entrar");
      await expect(page.getByRole("form", { name: "Ingresar" })).toBeVisible();
      await expect(page.getByTestId("no-local-account")).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await unnamedControls(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
