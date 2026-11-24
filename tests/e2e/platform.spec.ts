import { expect, test } from "@playwright/test";

test.describe("theme preference", () => {
  test("persists across reloads and is applied before hydration", async ({ page }) => {
    await page.goto("/configuracion");
    await page.getByRole("radio", { name: "Oscuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("pfm.theme"))).toBe("dark");

    // The attribute must already be "dark" in the very first parsed document.
    await page.reload({ waitUntil: "commit" });
    await page.waitForFunction(() => document.documentElement !== null);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
    await expect(page.getByRole("radio", { name: "Oscuro" })).toHaveAttribute("aria-checked", "true");
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(bg).toBe("rgb(22, 26, 23)"); // #161A17
  });
});

test.describe("local fonts", () => {
  test("load from the app itself, with no request to Google Fonts or any other host", async ({ page, baseURL }) => {
    const external: string[] = [];
    const fontRequests: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (url.origin !== new URL(baseURL!).origin && !url.protocol.startsWith("data")) external.push(r.url());
      if (r.resourceType() === "font") fontRequests.push(url.pathname);
    });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
    expect(loaded.some((f) => /instrument ?sans/i.test(f))).toBe(true);
    expect(loaded.some((f) => /instrument ?serif/i.test(f))).toBe(true);
    expect(fontRequests.length).toBeGreaterThanOrEqual(2);
    expect(fontRequests.every((p) => p.startsWith("/_next/static/media/") && p.endsWith(".woff2"))).toBe(true);
    expect(external).toEqual([]);
  });
});

test.describe("IndexedDB", () => {
  test("initialises the local store at version 3 (Step 06) and reports integrity", async ({ page }) => {
    await page.goto("/configuracion");
    await expect(page.getByTestId("local-store-ready")).toHaveText("Listo · versión 3");
    await expect(page.getByTestId("integrity-ok")).toBeVisible();
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => `${d.name}@${d.version}`));
    expect(dbs).toContain("pfm-local@3");
  });
});

test.describe("PWA groundwork", () => {
  test("serves a valid web app manifest", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m).toMatchObject({ name: "Personal Finance Manager", short_name: "PFM", start_url: "/", display: "standalone", lang: "es-AR" });
    const sizes = (m.icons as { sizes: string; purpose: string }[]).map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of m.icons as { src: string }[]) expect((await request.get(icon.src)).ok()).toBe(true);
  });

  test("service worker installs, precaches the shell and fonts, and serves it offline", async ({ page, context, browserName }) => {
    // Playwright's offline emulation does not reach service-worker fetches in Firefox, so the
    // worker still gets the network there: a tooling limit, not an app behaviour (docs/PWA.md).
    test.skip(browserName === "firefox", "Playwright offline emulation does not apply to service workers in Firefox");
    await page.goto("/");
    const version = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.scriptURL;
    });
    expect(version).toMatch(/\/sw\.js$/);
    await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith("pfm-static-")));
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) urls.push(new URL(req.url).pathname);
      return urls;
    });
    // Step 09: every area shell is precached, so any area opens offline, visited or not.
    expect(cached).toEqual(
      expect.arrayContaining(["/", "/transacciones", "/cuentas-domesticas", "/tarjetas", "/recurrencias", "/cuentas", "/presupuesto", "/informes", "/configuracion", "/offline", "/manifest.webmanifest", "/favicon.ico"]),
    );
    expect(cached.filter((u) => u.endsWith(".woff2")).length).toBeGreaterThanOrEqual(2);

    await context.setOffline(true);
    // The connection line says the data stays on the device (no sync to wait for).
    await expect(page.getByTestId("connection-offline")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("hero-balance")).toBeVisible();
    expect(await page.evaluate(() => [...document.fonts].some((f) => /instrument ?serif/i.test(f.family) && f.status === "loaded"))).toBe(true);

    // An area never visited opens from the precache (Step 09) …
    await page.goto("/informes");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Informes");
    // … and an unknown address falls back to the offline page.
    await page.goto("/no-existe").catch(() => undefined);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sin conexión");
    await context.setOffline(false);
    await page.goto("/");
    await expect(page.getByTestId("connection-offline")).toHaveCount(0);
  });

  test("cache names are versioned and /sw.js is never cached by the browser", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.headers()["cache-control"]).toContain("no-cache");
    const body = await res.text();
    expect(body).toMatch(/const VERSION = "\d+\.\d+\.\d+\+[0-9a-z]+";/);
    expect(body).not.toContain("__PFM_SW_VERSION__");
  });

  test("production headers: CSP keeps every request on this origin, with no violations", async ({ page, request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers()["strict-transport-security"]).toContain("max-age=");
    expect((await request.get("/favicon.ico")).ok()).toBe(true);
    const violations: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
    });
    page.on("pageerror", (e) => violations.push(String(e)));
    for (const path of ["/", "/transacciones", "/informes", "/presupuesto", "/configuracion"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(violations).toEqual([]);
  });

  test("install: offered in Configuración only when the browser allows it", async ({ page }) => {
    await page.goto("/configuracion");
    const section = page.getByTestId("install-settings");
    await expect(section).toBeVisible();
    // Headless browsers never fire beforeinstallprompt on their own: simulate the browser offer.
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>;
      e.prompt = async () => {};
      e.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
      window.dispatchEvent(e);
    });
    await section.getByRole("button", { name: "Instalar PFM" }).click();
    await expect(section).toHaveCount(0); // installed: no install message any more
  });
});
