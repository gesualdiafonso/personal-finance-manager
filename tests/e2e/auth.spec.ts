import { expect, test } from "@playwright/test";

/**
 * Local authentication and the global profile, on the production build, from an EMPTY browser
 * (no saved state). Walks the acceptance criteria of the authentication step. The user and the
 * password are FICTITIOUS.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const USER = { username: "ana.ejemplo", password: "EJEMPLO-ficticio-2026" };
const isPhone = (name: string) => name === "iphone";

test("register → profile → logout → login → existing data → profile propagates", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Open AUREON: a protected route without an account goes to registration; nothing financial shows.
  await page.goto("/cuentas");
  await expect(page).toHaveURL(/\/registro\?next=%2Fcuentas$/);
  await expect(page.getByTestId("data-status")).toHaveCount(0);

  // 2. Create username and password.
  const reg = page.getByRole("form", { name: "Crear tu cuenta" });
  await reg.getByLabel("Nombre completo").fill("Ana Ejemplo");
  await reg.getByLabel("Nombre de usuario").fill(USER.username);
  await reg.getByLabel("Contraseña", { exact: true }).fill(USER.password);
  await reg.getByLabel("Repetir contraseña").fill(USER.password);
  await reg.getByLabel("Recordar sesión en este dispositivo").uncheck();
  await reg.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/perfil\?bienvenida=0$/);
  await expect(page.getByTestId("profile-welcome")).toBeVisible();

  // 3. Configure the personal profile.
  const profile = page.getByRole("form", { name: "Mi perfil" });
  await profile.getByLabel("Teléfono").fill("+54 11 0000-0000");
  await profile.getByLabel("País").selectOption("AR");
  await profile.getByLabel("Provincia o región").fill("CABA");
  await profile.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("Perfil guardado")).toBeVisible();

  // Some financial data, to find again after logging back in.
  await page.goto("/cuentas");
  await page.getByRole("button", { name: "Crear la primera cuenta" }).click();
  const acc = page.getByRole("form", { name: "Nueva cuenta" });
  await acc.getByLabel("Nombre").fill("EJEMPLO-FICTICIO Caja");
  await acc.getByLabel("Saldo inicial").fill("12.345");
  await acc.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(acc).toBeHidden();

  // Session persists across a reload (same tab session).
  await page.reload();
  await expect(page.getByText("EJEMPLO-FICTICIO Caja").filter({ visible: true }).first()).toBeVisible();

  // 4. Log out (profile menu).
  await page.getByTestId("profile-menu").filter({ visible: true }).first().click();
  await page.getByTestId("profile-menu-panel").getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/entrar(\?next=%2Fcuentas)?$/);
  await page.goto("/presupuesto");
  await expect(page).toHaveURL(/\/entrar\?next=%2Fpresupuesto$/); // protected after logout

  // Wrong password refused, without revealing which part was wrong.
  const login = page.getByRole("form", { name: "Ingresar" });
  await login.getByLabel("Nombre de usuario").fill(USER.username);
  await login.getByLabel("Contraseña", { exact: true }).fill("incorrecta-123");
  await login.getByRole("button", { name: "Ingresar" }).click();
  await expect(login.getByRole("alert")).toHaveText("Usuario o contraseña incorrectos.");

  // 5. Log back in (show/hide password works) → back to the page asked for.
  await login.getByLabel("Contraseña", { exact: true }).fill(USER.password);
  await login.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(login.getByLabel("Contraseña", { exact: true })).toHaveAttribute("type", "text");
  await login.getByLabel("Recordar sesión en este dispositivo").check();
  await login.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/presupuesto$/);

  // 6. Existing financial information is there.
  await page.goto("/cuentas");
  await expect(page.getByText("EJEMPLO-FICTICIO Caja").filter({ visible: true }).first()).toBeVisible();

  // 7. Edit the profile once → reflected across modules.
  await page.goto("/perfil");
  await page.getByRole("form", { name: "Mi perfil" }).getByLabel("Nombre completo").fill("Ana María Ejemplo");
  await page.getByRole("form", { name: "Mi perfil" }).getByLabel("Moneda secundaria").selectOption("USD");
  await page.getByRole("form", { name: "Mi perfil" }).getByLabel("Formato de fecha").selectOption("yyyy-MM-dd");
  await page.getByRole("form", { name: "Mi perfil" }).getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("Perfil guardado")).toBeVisible();
  if (!isPhone(info.project.name)) await expect(page.locator("aside").getByTestId("profile-menu-name")).toHaveText("Ana María Ejemplo");
  await page.goto("/");
  await expect(page.getByTestId("auth-checking")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-loading")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("Ana · ");
  await page.goto("/configuracion");
  await expect(page.getByTestId("profile-summary")).toContainText("Ana María Ejemplo");
  await expect(page.getByTestId("profile-summary")).toContainText("2026-11-27");
  await page.goto("/informes");
  await expect(page.getByTestId("profile-summary")).toContainText("Ana María Ejemplo");

  // The account lives only in IndexedDB; LocalStorage holds no credential or session.
  const local = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(local).not.toContain(USER.password);
  expect(local).not.toMatch(/session|verifier|salt|hash/i);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("PWA: the login screen is available offline once the app was installed", async ({ page, context }) => {
  await page.goto("/registro");
  await expect(page.getByRole("form", { name: "Crear tu cuenta" })).toBeVisible();
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  // Wait for the shell precache to include the account screens.
  await expect
    .poll(async () => page.evaluate(async () => Boolean(await caches.match("/entrar"))), { timeout: 15_000 })
    .toBe(true);
  await context.setOffline(true);
  await page.goto("/entrar");
  // No account yet on this device → the login screen sends to registration, also offline.
  await expect(page.getByRole("form", { name: "Crear tu cuenta" })).toBeVisible();
  await context.setOffline(false);
});
