import { defineConfig, devices } from "@playwright/test";

/**
 * Step 14 — E2E of Supabase Auth on a PRODUCTION build made with Supabase configured, against
 * the FAKE Auth server of the tests (tests/helpers/fake-supabase-server.mjs, fictitious users).
 * No real Supabase project is used. Build first with `npm run build:e2e:supabase`
 * (scripts/e2e/build-supabase-mode.mjs), then `npm run test:e2e:supabase`. The default suite
 * (playwright.config.ts) keeps testing the local mode (Supabase not configured).
 */
const PORT = Number(process.env.E2E_SUPABASE_PORT ?? 3201);
const AUTH_PORT = 54329;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const env = {
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_DIST_DIR: ".next-e2e-supabase",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${AUTH_PORT}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ["sb", "publishable", "EJEMPLOficticioNoValido0123456789"].join("_"),
};

export default defineConfig({
  testDir: "tests/e2e-supabase",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-AR",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } } },
    { name: "iphone", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, launchOptions: { executablePath } } },
  ],
  webServer: [
    { command: `node tests/helpers/fake-supabase-server.mjs ${AUTH_PORT}`, url: `http://127.0.0.1:${AUTH_PORT}/auth/v1/health`, reuseExistingServer: false, timeout: 20_000 },
    { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}/entrar`, reuseExistingServer: false, timeout: 60_000, env },
  ],
});
