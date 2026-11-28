import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createPasswordVerifier } from "../../src/services/auth/password";

/**
 * Step 14 — Supabase Auth on the production build (Supabase configured), against the FAKE Auth
 * server (fictitious users, EJEMPLO-FICTICIO). Server-side route protection, register →
 * verify → session, HttpOnly cookies, login/logout, expired session, recovery → reset, local
 * account migration. Each test starts from an empty browser and an empty fake server.
 */
const AUTH = "http://127.0.0.1:54329";
const PASSWORD = "frase-ficticia-nube-2026";
const LOCAL_PASSWORD = "EJEMPLO-ficticio-local-2026";

async function resetAuth(request: APIRequestContext) {
  await request.post(`${AUTH}/__test/reset`);
}
async function lastMail(request: APIRequestContext, type: "signup" | "recovery") {
  const outbox = (await (await request.get(`${AUTH}/__test/outbox`)).json()) as { type: string; tokenHash: string; redirectTo: string }[];
  const mail = outbox.findLast((m) => m.type === type);
  expect(mail, `no ${type} email`).toBeTruthy();
  return mail!;
}
// Visible splash only: with cacheComponents, Next keeps the previous route mounted but hidden.
const settled = (page: Page) => expect(page.getByTestId("auth-checking").filter({ visible: true })).toHaveCount(0);

async function registerAndVerify(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/registro");
  const form = page.getByRole("form", { name: "Crear tu cuenta" });
  await form.getByLabel("Nombre completo").fill("Ana Ejemplo");
  await form.getByLabel("Correo electrónico").fill(email);
  await form.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await form.getByLabel("Repetir contraseña").fill(PASSWORD);
  await form.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/verificar$/);
  await expect(page.getByTestId("verify-email").getByLabel("Correo electrónico")).toHaveValue(email);
  const mail = await lastMail(request, "signup");
  expect(mail.redirectTo).toMatch(/\/auth\/confirm$/);
  await page.goto(`/auth/confirm?token_hash=${mail.tokenHash}&type=email`);
  await expect(page).toHaveURL(/\/\?verificado=1$/);
  await settled(page);
}

async function logout(page: Page) {
  await page.getByTestId("profile-menu").filter({ visible: true }).first().click();
  await page.getByTestId("profile-menu-panel").getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/entrar/);
}

async function login(page: Page, email: string, password: string) {
  const form = page.getByRole("form", { name: "Ingresar" });
  await form.getByLabel("Correo electrónico").fill(email);
  await form.getByLabel("Contraseña", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Ingresar" }).click();
}

test.beforeEach(async ({ request }) => resetAuth(request));

test("the server refuses private pages without a session (no app HTML is served)", async ({ page, request }) => {
  const response = await request.get("/cuentas", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/entrar?next=%2Fcuentas");
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.goto("/presupuesto");
  await expect(page).toHaveURL(/\/entrar\?next=%2Fpresupuesto$/);
  await expect(page.getByRole("form", { name: "Ingresar" })).toBeVisible();
  // The session endpoint answers who is signed in — nobody.
  expect((await request.get("/api/auth/session")).status()).toBe(401);
});

test("register → verify email → signed in; cookies are HttpOnly and invisible to scripts", async ({ page, request, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await registerAndVerify(page, request, "ana.e2e@ejemplo-ficticio.test");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const cookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
  expect(cookies.length).toBeGreaterThan(0);
  for (const c of cookies) {
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("Lax");
  }
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(storage).not.toContain(PASSWORD);
  expect(storage).not.toMatch(/access_token|refresh_token/);

  const session = await page.evaluate(async () => (await fetch("/api/auth/session")).text());
  expect(JSON.parse(session)).toMatchObject({ state: "authenticated", user: { email: "ana.e2e@ejemplo-ficticio.test", emailConfirmed: true } });
  expect(session).not.toMatch(/token|eyJ/);

  await page.goto("/perfil");
  await expect(page.getByTestId("profile-account-email")).toHaveValue("ana.e2e@ejemplo-ficticio.test");
  expect(errors).toEqual([]);
});

test("logout → private pages closed again; invalid then valid login; session persists on reload", async ({ page, request }) => {
  await registerAndVerify(page, request, "ana.e2e@ejemplo-ficticio.test");
  await logout(page);
  await page.goto("/cuentas");
  await expect(page).toHaveURL(/\/entrar\?next=%2Fcuentas$/);

  await login(page, "ana.e2e@ejemplo-ficticio.test", "incorrecta-ficticia");
  await expect(page.getByRole("form", { name: "Ingresar" }).getByRole("alert")).toHaveText("Correo o contraseña incorrectos.");
  await login(page, "ana.e2e@ejemplo-ficticio.test", PASSWORD);
  await expect(page).toHaveURL(/\/cuentas$/);
  await settled(page);
  await page.reload();
  await settled(page);
  await expect(page).toHaveURL(/\/cuentas$/);
});

test("an expired session sends the user to the login page with an explanation", async ({ page, request }) => {
  await registerAndVerify(page, request, "ana.e2e@ejemplo-ficticio.test");
  await request.post(`${AUTH}/__test/expire-all`);
  await page.goto("/transacciones");
  // The proxy adds motivo=expired when it sees the dead cookie; if the client's session check
  // cleared that cookie first, the login page explains it from the provider state instead.
  await expect(page).toHaveURL(/\/entrar\?next=%2Ftransacciones(&motivo=expired)?$/);
  await expect(page.getByTestId("login-reason")).toContainText("Tu sesión terminó o expiró");
});

test("password recovery → reset → the new password works, the old one does not", async ({ page, request }) => {
  await registerAndVerify(page, request, "ana.e2e@ejemplo-ficticio.test");
  await logout(page);
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await expect(page).toHaveURL(/\/recuperar$/);
  const recover = page.getByRole("form", { name: "Recuperar contraseña" });
  await recover.getByLabel("Correo electrónico").fill("ana.e2e@ejemplo-ficticio.test");
  await recover.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByTestId("recover-sent")).toBeVisible();
  const mail = await lastMail(request, "recovery");
  await page.goto(`/auth/confirm?token_hash=${mail.tokenHash}&type=recovery`);
  await expect(page).toHaveURL(/\/restablecer$/);
  const next = "otra-frase-ficticia-2026";
  const reset = page.getByRole("form", { name: "Nueva contraseña" });
  await reset.getByLabel("Nueva contraseña", { exact: true }).fill(next);
  await reset.getByLabel("Repetir nueva contraseña", { exact: true }).fill(next);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page).toHaveURL(/\/\?restablecida=1$/);
  await settled(page);
  await logout(page);
  await login(page, "ana.e2e@ejemplo-ficticio.test", PASSWORD);
  await expect(page.getByRole("form", { name: "Ingresar" }).getByRole("alert")).toHaveText("Correo o contraseña incorrectos.");
  await login(page, "ana.e2e@ejemplo-ficticio.test", next);
  await expect(page).not.toHaveURL(/\/entrar/);
});

test("a reused or invalid email link is refused", async ({ page, request }) => {
  await registerAndVerify(page, request, "ana.e2e@ejemplo-ficticio.test");
  const mail = await lastMail(request, "signup");
  await logout(page);
  await page.goto(`/auth/confirm?token_hash=${mail.tokenHash}&type=email`);
  await expect(page).toHaveURL(/\/entrar\?motivo=enlace-invalido$/);
  await expect(page.getByTestId("login-reason")).toContainText("El enlace no es válido");
});

test("an existing local account is migrated: local password proves ownership, then the app opens", async ({ page, request }) => {
  // A Step 10 local account on this browser (fictitious), written as the app would have.
  await page.goto("/entrar");
  await expect(page.getByRole("form", { name: "Ingresar" })).toBeVisible();
  const verifier = await createPasswordVerifier(LOCAL_PASSWORD);
  await page.evaluate(
    async ({ verifier }) => {
      const now = "2026-11-28T10:00:00-03:00";
      const id = "0193b000-0000-7000-8000-0000000000aa";
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("pfm-local");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const tx = db.transaction(["profiles", "credentials"], "readwrite");
      tx.objectStore("profiles").put({ id, username: "ana.local", fullName: "Ana Local", email: "", phone: "", country: "", region: "", secondaryCurrency: null, language: "es-AR", dateFormat: "dd/MM/yyyy", createdAt: now, updatedAt: now });
      tx.objectStore("credentials").put({ userId: id, verifier, updatedAt: now, failedAttempts: 0, lockedUntil: null });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { verifier },
  );
  await page.reload();
  await expect(page.getByTestId("local-account-hint")).toContainText("ana.local");

  await registerAndVerify(page, request, "ana.migra@ejemplo-ficticio.test");
  const link = page.getByTestId("link-local-data");
  await expect(link).toBeVisible();
  await expect(page.getByTestId("data-status")).toHaveCount(0); // nothing of the app before linking
  await link.getByLabel("Contraseña local").fill(LOCAL_PASSWORD);
  await link.getByRole("checkbox").check();
  await link.getByRole("button", { name: "Vincular mis datos" }).click();
  await expect(link).toBeHidden();
  await page.goto("/perfil");
  await expect(page.getByTestId("profile-name")).toHaveText("Ana Local");
  const credential = await page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const r = indexedDB.open("pfm-local");
        r.onsuccess = () => {
          const g = r.result.transaction("credentials").objectStore("credentials").getAll();
          g.onsuccess = () => resolve(g.result[0]);
        };
      }),
  );
  expect(credential).toMatchObject({ migratedTo: expect.any(String), disabledAt: expect.any(String) });
});

test("the browser bundle has no Auth client and no privileged key: auth runs on the server only", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() === "script") scripts.push(await response.text().catch(() => ""));
  });
  for (const path of ["/entrar", "/registro", "/recuperar", "/restablecer"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(300);
  }
  expect(scripts.length).toBeGreaterThan(0);
  const all = scripts.join("\n");
  expect(all).not.toContain("grant_type=refresh_token"); // @supabase/auth-js token handling
  expect(all).not.toContain("signInWithPassword");
  expect(all).not.toMatch(/sb_secret_[A-Za-z0-9_-]{16,}/);
});
