import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Account screens, the route gate and the global profile, rendered with the real auth
 * service over fake-indexeddb. Only the Next.js router is replaced (no app router in jsdom).
 * Users and passwords are FICTITIOUS (EJEMPLO-FICTICIO).
 */
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn(), forward: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

import { ProfileMenu } from "@/components/brand/brand-controls";
import { formatDate } from "@/lib/formatting/date";
import type { LocalDate } from "@/lib/formatting/date";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { AuthProvider, TAB_SESSION_KEY } from "@/features/auth/auth-context";
import { AuthGate } from "@/features/auth/auth-gate";
import { LoginScreen, RegisterScreen } from "@/features/auth/auth-screens";
import { ProfilePage } from "@/features/auth/profile-page";
import { ProfileSummary } from "@/features/auth/profile-summary";
import { AccountsPage } from "@/features/accounts/accounts-page";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import { register } from "@/services/auth/auth-service";
import { getFinancialSettings } from "@/services/storage/local-store";

const PASSWORD = "EJEMPLO-ficticio-2026";
const user = { username: "ana.ejemplo", password: PASSWORD, confirmation: PASSWORD, fullName: "Ana Ejemplo", remember: true };

beforeEach(() => {
  Object.values(router).forEach((f) => f.mockReset());
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

function Protected() {
  return <p>CONTENIDO-FINANCIERO</p>;
}

describe("protected routes", () => {
  it("renders nothing financial without a session and always sends to /entrar first", async () => {
    render(
      <AuthProvider>
        <AuthGate>
          <Protected />
        </AuthGate>
      </AuthProvider>,
    );
    expect(screen.getByTestId("auth-checking")).toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(screen.queryByText("CONTENIDO-FINANCIERO")).not.toBeInTheDocument();
  });

  it("sends a device with an account to /entrar and remembers the page asked for", async () => {
    await register(await getLocalDb(), { ...user, remember: false });
    window.history.replaceState(null, "", "/cuentas?x=1");
    render(
      <AuthProvider>
        <AuthGate>
          <Protected />
        </AuthGate>
      </AuthProvider>,
    );
    // The tab session belongs to another (closed) browser session: not valid here.
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar?next=%2Fcuentas%3Fx%3D1"));
    expect(screen.queryByText("CONTENIDO-FINANCIERO")).not.toBeInTheDocument();
  });

  it("shows the content with a remembered session (session persistence)", async () => {
    await register(await getLocalDb(), user);
    render(
      <AuthProvider>
        <AuthGate>
          <Protected />
        </AuthGate>
      </AuthProvider>,
    );
    expect(await screen.findByText("CONTENIDO-FINANCIERO")).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0); // nothing about the account in LocalStorage
  });
});

describe("registration and login screens", () => {
  it("the login screen stays put on a browser without an account and explains why", async () => {
    render(
      <ThemeProvider>
        <AuthProvider>
          <LoginScreen />
        </AuthProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByRole("form", { name: "Ingresar" })).toBeInTheDocument();
    expect(screen.getByTestId("no-local-account")).toHaveTextContent("Este navegador todavía no tiene ninguna cuenta");
    expect(within(screen.getByTestId("no-local-account")).getByRole("link", { name: "Crear una cuenta" })).toHaveAttribute("href", "/registro");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("registers with full name, username, email, password and currency", async () => {
    const u = userEvent.setup();
    render(
      <ThemeProvider>
        <AuthProvider>
          <RegisterScreen />
        </AuthProvider>
      </ThemeProvider>,
    );
    const form = await screen.findByRole("form", { name: "Crear tu cuenta" });
    await u.type(within(form).getByLabelText("Nombre completo"), "Ana Ejemplo");
    await u.type(within(form).getByLabelText("Nombre de usuario"), "Ana.Ejemplo");
    await u.type(within(form).getByLabelText("Correo electrónico (opcional)"), "ana@example.invalid");
    await u.type(within(form).getByLabelText("Contraseña"), PASSWORD);
    await u.type(within(form).getByLabelText("Repetir contraseña"), "otra-diferente");
    await u.click(within(form).getByRole("button", { name: "Crear cuenta" }));
    expect(await within(form).findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    await u.clear(within(form).getByLabelText("Repetir contraseña"));
    await u.type(within(form).getByLabelText("Repetir contraseña"), PASSWORD);
    await u.selectOptions(within(form).getByLabelText("Moneda principal"), "USD");
    await u.click(within(form).getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/perfil?bienvenida=0"));
    const db = await getLocalDb();
    expect((await db.getAll("profiles"))[0]).toMatchObject({ username: "ana.ejemplo", fullName: "Ana Ejemplo", email: "ana@example.invalid" });
    expect((await getFinancialSettings(db))?.baseCurrency).toBe("USD");
  });

  it("logs in with valid credentials, refuses invalid ones, and toggles password visibility", async () => {
    const db = await getLocalDb();
    const r = await register(db, user);
    await db.delete("sessions", r.session.id);
    window.history.replaceState(null, "", "/entrar?next=%2Fpresupuesto");
    const u = userEvent.setup();
    render(
      <ThemeProvider>
        <AuthProvider>
          <LoginScreen />
        </AuthProvider>
      </ThemeProvider>,
    );
    const form = await screen.findByRole("form", { name: "Ingresar" });
    const password = within(form).getByLabelText("Contraseña");
    expect(password).toHaveAttribute("type", "password");
    await u.click(within(form).getByRole("button", { name: "Mostrar contraseña" }));
    expect(password).toHaveAttribute("type", "text");
    await u.click(within(form).getByRole("button", { name: "Ocultar contraseña" }));
    expect(password).toHaveAttribute("type", "password");

    await u.type(within(form).getByLabelText("Nombre de usuario"), "ana.ejemplo");
    await u.type(password, "incorrecta-123");
    await u.click(within(form).getByRole("button", { name: "Ingresar" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos.");
    expect(router.replace).not.toHaveBeenCalled();

    await u.type(password, PASSWORD);
    await u.click(within(form).getByRole("button", { name: "Ingresar" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/presupuesto"));
    // "Recordar sesión" off: a tab session, marked in sessionStorage with an opaque id only.
    const marker = window.sessionStorage.getItem(TAB_SESSION_KEY);
    expect(marker).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(marker).not.toContain(PASSWORD);
  });

  it("never redirects to another origin after login", async () => {
    const db = await getLocalDb();
    const r = await register(db, user);
    await db.delete("sessions", r.session.id);
    window.history.replaceState(null, "", "/entrar?next=%2F%2Fevil.example");
    const u = userEvent.setup();
    render(
      <ThemeProvider>
        <AuthProvider>
          <LoginScreen />
        </AuthProvider>
      </ThemeProvider>,
    );
    const form = await screen.findByRole("form", { name: "Ingresar" });
    await u.type(within(form).getByLabelText("Nombre de usuario"), "ana.ejemplo");
    await u.type(within(form).getByLabelText("Contraseña"), PASSWORD);
    await u.click(within(form).getByRole("button", { name: "Ingresar" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });
});

describe("global profile", () => {
  it("one edit propagates to every module that reads the profile", async () => {
    await register(await getLocalDb(), user);
    await mutate((r) => r.accounts.create({ name: "EJEMPLO-FICTICIO Caja", institution: null, accountType: "cash", currency: "ARS", initialBalance: 5_000_00, openingDate: null, status: "active" }));
    const u = userEvent.setup();
    render(
      <AuthProvider>
        <AuthGate>
          <ProfileMenu pathname="/" />
          <ProfileSummary />
          <ProfilePage />
          <p data-testid="any-date">{formatDate("2026-11-27" as LocalDate, "form")}</p>
        </AuthGate>
      </AuthProvider>,
    );
    expect(await screen.findByTestId("profile-menu-name")).toHaveTextContent("Ana Ejemplo");
    const form = screen.getByRole("form", { name: "Mi perfil" });
    await u.clear(within(form).getByLabelText("Nombre completo"));
    await u.type(within(form).getByLabelText("Nombre completo"), "Ana María Ejemplo");
    await u.selectOptions(within(form).getByLabelText("País"), "AR");
    await u.selectOptions(within(form).getByLabelText("Moneda principal"), "USD");
    await u.selectOptions(within(form).getByLabelText("Moneda secundaria"), "EUR");
    await u.selectOptions(within(form).getByLabelText("Formato de fecha"), "yyyy-MM-dd");
    await u.click(within(form).getByRole("button", { name: "Guardar perfil" }));
    await waitFor(() => expect(screen.getByTestId("profile-menu-name")).toHaveTextContent("Ana María Ejemplo"));
    expect(screen.getByTestId("profile-summary")).toHaveTextContent("Ana María Ejemplo");
    expect(screen.getByTestId("profile-summary")).toHaveTextContent("Dólares (USD)");
    expect(screen.getByTestId("profile-summary")).toHaveTextContent("2026-11-27");
    expect(formatDate("2026-11-27" as LocalDate, "form")).toBe("2026-11-27");
    // One profile record; the currency lives once, in the financial settings.
    const db = await getLocalDb();
    expect(await db.count("profiles")).toBe(1);
    expect((await getFinancialSettings(db))?.baseCurrency).toBe("USD");
    // Financial records untouched.
    expect((await db.getAll("accounts"))[0]).toMatchObject({ name: "EJEMPLO-FICTICIO Caja", currency: "ARS", initialBalance: 5_000_00 });
  });

  it("modules keep working and use the profile's currency (Accounts)", async () => {
    await register(await getLocalDb(), { ...user, preferredCurrency: "USD" });
    const u = userEvent.setup();
    render(
      <AuthProvider>
        <AuthGate>
          <AccountsPage />
        </AuthGate>
      </AuthProvider>,
    );
    await u.click(await screen.findByRole("button", { name: "Crear la primera cuenta" }));
    expect(within(screen.getByRole("form", { name: "Nueva cuenta" })).getByLabelText("Moneda")).toHaveValue("USD");
  });

  it("logout from the profile menu ends the session", async () => {
    const r = await register(await getLocalDb(), user);
    const u = userEvent.setup();
    render(
      <AuthProvider>
        <AuthGate>
          <ProfileMenu pathname="/" />
        </AuthGate>
      </AuthProvider>,
    );
    await u.click(await screen.findByTestId("profile-menu"));
    await u.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(await (await getLocalDb()).get("sessions", r.session.id)).toBeUndefined();
    await act(async () => undefined);
    expect(screen.queryByTestId("profile-menu")).not.toBeInTheDocument();
  });

  it("changes the password from the profile", async () => {
    await register(await getLocalDb(), user);
    const u = userEvent.setup();
    render(
      <AuthProvider>
        <AuthGate>
          <ProfilePage />
        </AuthGate>
      </AuthProvider>,
    );
    const form = await screen.findByRole("form", { name: "Cambiar contraseña" });
    await u.type(within(form).getByLabelText("Contraseña actual"), "incorrecta-123");
    await u.type(within(form).getByLabelText("Nueva contraseña"), "EJEMPLO-nueva-clave-27");
    await u.type(within(form).getByLabelText("Repetir nueva contraseña"), "EJEMPLO-nueva-clave-27");
    await u.click(within(form).getByRole("button", { name: "Cambiar contraseña" }));
    expect(await within(form).findByText("Usuario o contraseña incorrectos.")).toBeInTheDocument();
    await u.clear(within(form).getByLabelText("Contraseña actual"));
    await u.type(within(form).getByLabelText("Contraseña actual"), PASSWORD);
    await u.click(within(form).getByRole("button", { name: "Cambiar contraseña" }));
    expect(await screen.findByText("Contraseña cambiada. Se cerraron las demás sesiones.")).toBeInTheDocument();
  });
});
