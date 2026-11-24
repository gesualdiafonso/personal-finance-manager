import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the PRODUCTION build (`npm run build` first): the service worker,
 * fonts and manifest only behave as shipped in production.
 * Chromium: installed with `npx playwright install --with-deps chromium` (CI), or an existing
 * Chrome via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-AR",
    // Far from Buenos Aires on purpose: dates must still be Buenos Aires dates.
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    // Compatibility run (Step 09): E2E_ALL_BROWSERS=1 adds Firefox, desktop Safari (WebKit) and
    // iPhone Safari (WebKit). Needs `npx playwright install firefox webkit`.
    ...(process.env.E2E_ALL_BROWSERS
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
          { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
          // Safari on iPhone at the same 390×844 viewport as the Chromium "iphone" project.
          { name: "webkit-iphone", use: { ...devices["iPhone 15"], viewport: { width: 390, height: 844 } } },
        ]
      : []),
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } } },
    {
      name: "iphone",
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
