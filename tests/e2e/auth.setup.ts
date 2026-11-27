import { expect, test as setup } from "@playwright/test";

/**
 * Registers the FICTITIOUS local account the other E2E specs run with, and saves the browser
 * state — IndexedDB included, where the account and its remembered session live — so every
 * spec starts signed in on an otherwise empty device. The auth spec itself starts empty.
 */
export const AUTH_STATE = "tests/e2e/.auth/state.json";
export const E2E_USER = { username: "e2e.ejemplo", password: "EJEMPLO-e2e-ficticio-2026", fullName: "Usuario Ejemplo E2E" };

setup("register the E2E local account", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/entrar$/); // login always comes first
  await page.getByTestId("no-local-account").getByRole("link", { name: "Crear una cuenta" }).click();
  await expect(page).toHaveURL(/\/registro$/);
  const form = page.getByRole("form", { name: "Crear tu cuenta" });
  await form.getByLabel("Nombre completo").fill(E2E_USER.fullName);
  await form.getByLabel("Nombre de usuario").fill(E2E_USER.username);
  await form.getByLabel("Contraseña", { exact: true }).fill(E2E_USER.password);
  await form.getByLabel("Repetir contraseña").fill(E2E_USER.password);
  await expect(form.getByLabel("Recordar sesión en este dispositivo")).toBeChecked();
  await form.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/perfil\?bienvenida=0$/);
  await expect(page.getByTestId("profile-name")).toHaveText(E2E_USER.fullName);
  await page.context().storageState({ path: AUTH_STATE, indexedDB: true });
});
