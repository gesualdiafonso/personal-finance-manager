import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Step 14 — Supabase Auth on the client: CloudAuthProvider, cloud screens, gate and profile.
 * The Server Actions module is replaced by a fake of the SERVER (it would run on the server
 * with HttpOnly cookies); GET /api/auth/session is answered by a stubbed fetch. Everything on
 * the client (state, identity binding over fake-indexeddb, screens) is the real code.
 * Users and passwords are FICTITIOUS (EJEMPLO-FICTICIO).
 */
const router = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  forward: vi.fn(),
}));
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => search.params,
}));

/** The "server": one session at a time, verified users, what each action received. */
const server = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    email: string;
    emailConfirmed: boolean;
    fullName: string;
  },
  down: false,
  calls: [] as { action: string; input: unknown }[],
  profileSync: true,
}));
vi.mock("@/features/auth/cloud-actions", () => {
  const record = (action: string, input: unknown) =>
    server.calls.push({ action, input });
  return {
    cloudSignIn: async (input: { email: string; password: string }) => {
      record("signIn", input);
      if (
        input.email !== "ana@ejemplo-ficticio.test" ||
        input.password !== "frase-ficticia-nube-1"
      )
        return { ok: false, code: "invalid-credentials" };
      server.user = {
        id: "0193b000-0000-4000-8000-00000000000a",
        email: input.email,
        emailConfirmed: true,
        fullName: "Ana Ejemplo",
      };
      return { ok: true, user: server.user };
    },
    cloudSignUp: async (input: unknown) => (
      record("signUp", input),
      { ok: true, needsVerification: true }
    ),
    cloudSignOut: async (scope: unknown) => (
      record("signOut", scope),
      (server.user = null),
      { ok: true }
    ),
    cloudRequestReset: async (input: unknown) => (
      record("requestReset", input),
      { ok: true }
    ),
    cloudResendVerification: async (input: unknown) => (
      record("resend", input),
      { ok: true }
    ),
    cloudChangePassword: async (input: unknown) => (
      record("changePassword", input),
      { ok: true }
    ),
    cloudGetProfile: async () => ({ ok: false, code: "profile-unavailable" }),
    cloudUpdateProfile: async (input: unknown) => (
      record("updateProfile", input),
      server.profileSync
        ? { ok: true, profile: {} }
        : { ok: false, code: "profile-unavailable" }
    ),
  };
});

import { ThemeProvider } from "@/components/shared/theme-provider";
import { AuthGate } from "@/features/auth/auth-gate";
import { useAuth } from "@/features/auth/auth-state";
import {
  CloudAuthProvider,
  IDENTITY_SNAPSHOT_KEY,
  OFFLINE_GRACE_MS,
} from "@/features/auth/cloud-auth-provider";
import {
  CloudLoginScreen,
  CloudRegisterScreen,
  PENDING_EMAIL_KEY,
  RecoverScreen,
} from "@/features/auth/cloud-screens";
import { ProfilePage } from "@/features/auth/profile-page";
import {
  getActiveLocalDbName,
  getLocalDb,
  mutate,
} from "@/hooks/use-local-data";
import { register } from "@/services/auth/auth-service";
import { LOCAL_DB_NAME, localDbNameFor } from "@/services/storage/local-store";

const CLOUD_PASSWORD = "frase-ficticia-nube-1";
const LOCAL_PASSWORD = "EJEMPLO-ficticio-local-2026";
const ANA_ID = "0193b000-0000-4000-8000-00000000000a";

const realFetch = globalThis.fetch;
beforeEach(() => {
  Object.values(router).forEach((f) => f.mockReset());
  search.params = new URLSearchParams();
  server.user = null;
  server.down = false;
  server.calls.length = 0;
  server.profileSync = true;
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) !== "/api/auth/session")
      throw new Error(`unexpected fetch ${String(input)}`);
    if (server.down) throw new TypeError("Failed to fetch");
    return server.user
      ? Response.json({ state: "authenticated", user: server.user })
      : Response.json({ state: "anonymous" }, { status: 401 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function Protected() {
  return <p>CONTENIDO-FINANCIERO</p>;
}
function Probe() {
  const { status, offline } = useAuth();
  return (
    <span data-testid="probe">{`${status}${offline ? ":offline" : ""}`}</span>
  );
}
function app(children = <Protected />) {
  return render(
    <ThemeProvider>
      <CloudAuthProvider>
        <Probe />
        <AuthGate>{children}</AuthGate>
      </CloudAuthProvider>
    </ThemeProvider>,
  );
}
const signIn = () => {
  server.user = {
    id: ANA_ID,
    email: "ana@ejemplo-ficticio.test",
    emailConfirmed: true,
    fullName: "Ana Ejemplo",
  };
};

describe("unauthenticated access and login", () => {
  it("without a session nothing financial renders and the gate sends to /entrar", async () => {
    window.history.replaceState(null, "", "/cuentas");
    app();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/entrar?next=%2Fcuentas"),
    );
    expect(screen.queryByText("CONTENIDO-FINANCIERO")).not.toBeInTheDocument();
  });

  it("valid login: Server Action, then the identity is bound to its local database and the app opens", async () => {
    render(
      <ThemeProvider>
        <CloudAuthProvider>
          <Probe />
          <CloudLoginScreen />
        </CloudAuthProvider>
      </ThemeProvider>,
    );
    await screen.findByRole("form", { name: "Ingresar" });
    await userEvent.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@ejemplo-ficticio.test",
    );
    await userEvent.type(screen.getByLabelText("Contraseña"), CLOUD_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("signed-in"),
    );
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(getActiveLocalDbName()).toBe(LOCAL_DB_NAME); // empty browser: linked directly
    expect(server.calls[0]).toEqual({
      action: "signIn",
      input: { email: "ana@ejemplo-ficticio.test", password: CLOUD_PASSWORD },
    });
  });

  it("invalid login: neutral message, password cleared, still signed out", async () => {
    render(
      <ThemeProvider>
        <CloudAuthProvider>
          <Probe />
          <CloudLoginScreen />
        </CloudAuthProvider>
      </ThemeProvider>,
    );
    await screen.findByRole("form", { name: "Ingresar" });
    await userEvent.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@ejemplo-ficticio.test",
    );
    await userEvent.type(
      screen.getByLabelText("Contraseña"),
      "incorrecta-ficticia",
    );
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Correo o contraseña incorrectos.",
    );
    expect(screen.getByLabelText("Contraseña")).toHaveValue("");
    expect(screen.getByTestId("probe")).toHaveTextContent("signed-out");
  });

  it("explains why the user is on the login page (expired session, invalid link, verified email)", async () => {
    search.params = new URLSearchParams("motivo=expired&verificado=1");
    render(
      <ThemeProvider>
        <CloudAuthProvider>
          <CloudLoginScreen />
        </CloudAuthProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByTestId("login-reason")).toHaveTextContent(
      "Tu sesión terminó o expiró",
    );
    expect(screen.getByTestId("email-verified")).toHaveTextContent(
      "Correo verificado",
    );
  });
});

describe("persistent and expired sessions", () => {
  it("a valid server session opens the app on load (persistence lives in the HttpOnly cookie)", async () => {
    signIn();
    app();
    expect(await screen.findByText("CONTENIDO-FINANCIERO")).toBeInTheDocument();
  });

  it("when the server says the session ended, the app closes and the login explains it", async () => {
    signIn();
    window.history.replaceState(null, "", "/presupuesto");
    app();
    await screen.findByText("CONTENIDO-FINANCIERO");
    server.user = null; // expired / revoked on the server
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        "/entrar?next=%2Fpresupuesto&motivo=expired",
      ),
    );
    expect(screen.queryByText("CONTENIDO-FINANCIERO")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(IDENTITY_SNAPSHOT_KEY)).toBeNull();
  });

  it("offline: a recent verified snapshot keeps the PWA usable, with a visible notice", async () => {
    signIn();
    const first = app();
    await screen.findByText("CONTENIDO-FINANCIERO");
    first.unmount();
    server.down = true;
    app();
    expect(await screen.findByText("CONTENIDO-FINANCIERO")).toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("signed-in:offline");
    expect(screen.getByTestId("offline-session")).toBeInTheDocument();
  });

  it("offline with a snapshot older than 14 days (or none): signed out", async () => {
    window.localStorage.setItem(
      IDENTITY_SNAPSHOT_KEY,
      JSON.stringify({
        id: ANA_ID,
        email: "ana@ejemplo-ficticio.test",
        emailConfirmed: true,
        fullName: "",
        validatedAt: Date.now() - OFFLINE_GRACE_MS - 1000,
      }),
    );
    server.down = true;
    app();
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent(
        "signed-out:offline",
      ),
    );
    expect(screen.queryByText("CONTENIDO-FINANCIERO")).not.toBeInTheDocument();
  });

  it("logout ends the server session and keeps the local data", async () => {
    signIn();
    function Logout() {
      const { signOut } = useAuth();
      return <button onClick={() => void signOut()}>salir</button>;
    }
    app(<Logout />);
    await mutateAfterBound("EJEMPLO-FICTICIO Persistente");
    await userEvent.click(await screen.findByRole("button", { name: "salir" }));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("signed-out"),
    );
    expect(
      server.calls.some((c) => c.action === "signOut" && c.input === "local"),
    ).toBe(true);
    expect(
      (await (await getLocalDb()).getAll("accounts")).map((a) => a.name),
    ).toContain("EJEMPLO-FICTICIO Persistente");
  });
});

async function mutateAfterBound(name: string) {
  await waitFor(() =>
    expect(screen.getByTestId("probe")).toHaveTextContent("signed-in"),
  );
  await mutate((r) =>
    r.accounts.create({
      name,
      institution: null,
      accountType: "cash",
      currency: "ARS",
      initialBalance: 1,
      openingDate: null,
      status: "active",
    }),
  );
}

describe("local-account migration (assisted)", () => {
  it("an existing local account is linked only after proving ownership with the local password", async () => {
    await register(await getLocalDb(), {
      username: "ana.local",
      password: LOCAL_PASSWORD,
      confirmation: LOCAL_PASSWORD,
      fullName: "Ana Local",
      remember: true,
    });
    await mutate((r) =>
      r.accounts.create({
        name: "EJEMPLO-FICTICIO Caja local",
        institution: null,
        accountType: "cash",
        currency: "ARS",
        initialBalance: 100,
        openingDate: null,
        status: "active",
      }),
    );
    signIn();
    app();
    expect(await screen.findByTestId("link-local-data")).toBeInTheDocument();
    expect(screen.queryByText("CONTENIDO-FINANCIERO")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Usuario local")).toHaveValue("ana.local");

    await userEvent.type(
      screen.getByLabelText("Contraseña local"),
      "incorrecta-ficticia",
    );
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(
      screen.getByRole("button", { name: "Vincular mis datos" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Usuario o contraseña incorrectos.",
    );

    await userEvent.type(
      screen.getByLabelText("Contraseña local"),
      LOCAL_PASSWORD,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Vincular mis datos" }),
    );
    expect(await screen.findByText("CONTENIDO-FINANCIERO")).toBeInTheDocument();
    const db = await getLocalDb();
    expect((await db.getAll("accounts")).map((a) => a.name)).toEqual([
      "EJEMPLO-FICTICIO Caja local",
    ]);
    expect((await db.getAll("credentials"))[0]).toMatchObject({
      migratedTo: ANA_ID,
      disabledAt: expect.any(String),
    });
  });

  it("'start without these data' opens an empty database for the identity; the local data stay untouched", async () => {
    await register(await getLocalDb(), {
      username: "otra.persona",
      password: LOCAL_PASSWORD,
      confirmation: LOCAL_PASSWORD,
      fullName: "",
      remember: true,
    });
    signIn();
    app();
    await userEvent.click(
      await screen.findByRole("button", { name: "Empezar sin estos datos" }),
    );
    expect(await screen.findByText("CONTENIDO-FINANCIERO")).toBeInTheDocument();
    expect(getActiveLocalDbName()).toBe(localDbNameFor(ANA_ID));
  });
});

describe("registration, verification and recovery screens", () => {
  it("register → 'check your inbox' (the address stays in this tab, not in the URL)", async () => {
    render(
      <ThemeProvider>
        <CloudAuthProvider>
          <CloudRegisterScreen />
        </CloudAuthProvider>
      </ThemeProvider>,
    );
    await screen.findByRole("form", { name: "Crear tu cuenta" });
    await userEvent.type(
      screen.getByLabelText("Correo electrónico"),
      "nueva@ejemplo-ficticio.test",
    );
    await userEvent.type(screen.getByLabelText("Contraseña"), "corta");
    await userEvent.type(screen.getByLabelText("Repetir contraseña"), "corta");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(
      await screen.findByText(/Al menos 10 caracteres/, {
        selector: "p.text-alert-text",
      }),
    ).toBeInTheDocument();
    expect(server.calls).toEqual([]); // validated before calling the server

    await userEvent.clear(screen.getByLabelText("Contraseña"));
    await userEvent.clear(screen.getByLabelText("Repetir contraseña"));
    await userEvent.type(screen.getByLabelText("Contraseña"), CLOUD_PASSWORD);
    await userEvent.type(
      screen.getByLabelText("Repetir contraseña"),
      CLOUD_PASSWORD,
    );
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/verificar"),
    );
    expect(window.sessionStorage.getItem(PENDING_EMAIL_KEY)).toBe(
      "nueva@ejemplo-ficticio.test",
    );
  });

  it("recovery always shows the same confirmation", async () => {
    render(
      <ThemeProvider>
        <CloudAuthProvider>
          <RecoverScreen />
        </CloudAuthProvider>
      </ThemeProvider>,
    );
    await userEvent.type(
      await screen.findByLabelText("Correo electrónico"),
      "nadie@ejemplo-ficticio.test",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar enlace" }),
    );
    expect(await screen.findByTestId("recover-sent")).toHaveTextContent(
      "Si existe una cuenta con ese correo",
    );
  });
});

describe("profile integration", () => {
  it("shows the account email read-only and saves preferences locally + editable fields to the cloud profile", async () => {
    signIn();
    app(<ProfilePage />);
    expect(await screen.findByTestId("profile-account-email")).toHaveValue(
      "ana@ejemplo-ficticio.test",
    );
    expect(screen.getByTestId("profile-account-email")).toHaveAttribute(
      "readonly",
    );
    await userEvent.clear(screen.getByLabelText("Nombre completo"));
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Ana Nube");
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar perfil" }),
    );
    expect(await screen.findByTestId("cloud-profile-sync")).toHaveTextContent(
      "también en la nube",
    );
    const update = server.calls.find((c) => c.action === "updateProfile")!;
    expect(update.input).toEqual({
      fullName: "Ana Nube",
      phone: "",
      country: "",
      region: "",
    }); // no email, no secrets
  });

  it("without the cloud policies (SQL 09) the profile is still saved on the device", async () => {
    server.profileSync = false;
    signIn();
    app(<ProfilePage />);
    await screen.findByTestId("profile-account-email");
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar perfil" }),
    );
    expect(await screen.findByTestId("cloud-profile-sync")).toHaveTextContent(
      "en este dispositivo",
    );
  });
});

describe("no credentials on the device", () => {
  it("after login, linking and logout no password or token is in localStorage, sessionStorage or IndexedDB", async () => {
    await register(await getLocalDb(), {
      username: "ana.local",
      password: LOCAL_PASSWORD,
      confirmation: LOCAL_PASSWORD,
      fullName: "",
      remember: true,
    });
    signIn();
    app();
    await userEvent.type(
      await screen.findByLabelText("Contraseña local"),
      LOCAL_PASSWORD,
    );
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(
      screen.getByRole("button", { name: "Vincular mis datos" }),
    );
    await screen.findByText("CONTENIDO-FINANCIERO");
    const storages =
      JSON.stringify({ ...window.localStorage }) +
      JSON.stringify({ ...window.sessionStorage });
    const db = await getLocalDb();
    const idb = JSON.stringify(
      await Promise.all(
        (
          ["device", "profiles", "credentials", "sessions", "settings"] as const
        ).map((s) => db.getAll(s)),
      ),
    );
    for (const secret of [CLOUD_PASSWORD, LOCAL_PASSWORD]) {
      expect(storages).not.toContain(secret);
      expect(idb).not.toContain(secret);
    }
    expect(storages + idb).not.toMatch(/access_token|refresh_token|eyJhbGci/);
    // The snapshot holds identity only.
    expect(
      Object.keys(
        JSON.parse(window.localStorage.getItem(IDENTITY_SNAPSHOT_KEY)!),
      ).sort(),
    ).toEqual(["email", "emailConfirmed", "fullName", "id", "validatedAt"]);
  });
});
