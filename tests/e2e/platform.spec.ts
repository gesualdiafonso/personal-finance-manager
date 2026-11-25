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
    expect(bg).toBe("rgb(14, 22, 18)"); // #0E1612 Deep Forest
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
    expect(loaded.some((f) => /manrope/i.test(f))).toBe(true);
    expect(loaded.some((f) => /cormorant/i.test(f))).toBe(true);
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
    expect(m).toMatchObject({ name: "AUREON — Personal Financial Intelligence", short_name: "AUREON", start_url: "/", display: "standalone", lang: "es-AR" });
    const sizes = (m.icons as { sizes: string; purpose: string }[]).map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of m.icons as { src: string }[]) expect((await request.get(icon.src)).ok()).toBe(true);
  });

  test("service worker installs, precaches the shell and fonts, and serves it offline", async ({ page, context }) => {
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
    expect(cached).toEqual(expect.arrayContaining(["/", "/offline", "/manifest.webmanifest"]));
    expect(cached.filter((u) => u.endsWith(".woff2")).length).toBeGreaterThanOrEqual(2);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("hero-balance")).toBeVisible();
    expect(await page.evaluate(() => [...document.fonts].some((f) => /cormorant/i.test(f.family) && f.status === "loaded"))).toBe(true);

    // A page never visited falls back to the offline page.
    await page.goto("/informes").catch(() => undefined);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sin conexión");
    await context.setOffline(false);
  });

  test("cache names are versioned and /sw.js is never cached by the browser", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.headers()["cache-control"]).toContain("no-cache");
    const body = await res.text();
    expect(body).toMatch(/const VERSION = "\d+\.\d+\.\d+\+[0-9a-z]+";/);
    expect(body).not.toContain("__PFM_SW_VERSION__");
  });
});
