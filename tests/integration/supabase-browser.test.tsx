import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudStatus } from "@/features/settings/cloud-status";
import { getLocalDb } from "@/hooks/use-local-data";
import { getSupabaseBrowserClient, resetSupabaseBrowserClientForTests } from "@/lib/supabase/client";
import { parseSupabaseConfig } from "@/lib/supabase/config";
import { hasAccount, login, logout, register } from "@/services/auth/auth-service";
import { configuredEnv, FAKE } from "../helpers/supabase-fixtures";

/**
 * Step 12 in the browser: client initialisation, the Configuración panel, and the local login
 * still being the active one (Supabase configured or not). Fictitious values only.
 */
beforeEach(() => resetSupabaseBrowserClientForTests());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("browser client", () => {
  it("initialises once (singleton) with the public configuration", () => {
    const config = parseSupabaseConfig(configuredEnv);
    const a = getSupabaseBrowserClient(config);
    const b = getSupabaseBrowserClient(config);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(typeof a!.auth.signInWithPassword).toBe("function");
  });
  it("is null — the app stays local — when not configured or invalid", () => {
    expect(getSupabaseBrowserClient(parseSupabaseConfig({}))).toBeNull();
    expect(getSupabaseBrowserClient(parseSupabaseConfig({ ...configuredEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE.serviceRoleKey }))).toBeNull();
  });
  it("creating it makes no network request and stores nothing about the local account", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    getSupabaseBrowserClient(parseSupabaseConfig(configuredEnv));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Object.keys(window.localStorage)).not.toContain("aureon.session");
  });
});

describe("existing local authentication is unchanged", () => {
  it("register, logout and login work exactly as before with Supabase configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", FAKE.url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", FAKE.publishableKey);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const db = await getLocalDb();
    const password = "EJEMPLO-ficticio-2026";
    const r = await register(db, { username: "ana.ejemplo", password, confirmation: password, remember: true });
    await logout(db, r.session.id);
    const s = await login(db, { username: "ana.ejemplo", password });
    expect(s.view.profile.username).toBe("ana.ejemplo");
    expect(await hasAccount(db)).toBe(true);
    // PBKDF2 verifier, profile and sessions still in IndexedDB; nothing went to the network.
    expect((await db.getAll("credentials"))[0]?.verifier.algorithm).toBe("PBKDF2-HMAC-SHA-256");
    expect(await db.count("sessions")).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Configuración → Nube (Supabase)", () => {
  it("shows 'No configurada' and the real health result when asked", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "not-configured", message: "x", checkedAt: "2026-11-28T13:00:00Z" }, { status: 503 }));
    const u = userEvent.setup();
    render(<CloudStatus />);
    expect(screen.getByTestId("cloud-config-status")).toHaveTextContent("No configurada");
    expect(fetchSpy).not.toHaveBeenCalled(); // nothing automatic
    await u.click(screen.getByRole("button", { name: "Comprobar conexión" }));
    await waitFor(() => expect(screen.getByTestId("cloud-health-result")).toHaveTextContent("Sin configurar"));
    expect(fetchSpy).toHaveBeenCalledWith("/api/health/supabase", { cache: "no-store" });
  });
  it("shows the project host when configured and reports an unreachable service honestly", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", FAKE.url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", FAKE.publishableKey);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "unreachable", reason: "network", host: "x", message: "x", checkedAt: "x" }, { status: 503 }));
    const u = userEvent.setup();
    render(<CloudStatus />);
    expect(screen.getByTestId("cloud-config-status")).toHaveTextContent("Configurada");
    expect(screen.getByTestId("cloud-status")).toHaveTextContent("ejemploficticio.supabase.example");
    expect(screen.getByTestId("cloud-status")).not.toHaveTextContent(FAKE.publishableKey);
    await u.click(screen.getByRole("button", { name: "Comprobar conexión" }));
    await waitFor(() => expect(screen.getByTestId("cloud-health-result")).toHaveTextContent("No se pudo contactar a Supabase"));
  });
});
