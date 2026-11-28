// @vitest-environment node
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startFakeSupabase } from "../helpers/fake-supabase-server.mjs";
import { FAKE } from "../helpers/supabase-fixtures";

/**
 * Step 14 — Supabase Auth on the server, end to end through the REAL @supabase/supabase-js and
 * @supabase/ssr against a fake GoTrue (tests/helpers/fake-supabase-server.mjs, fictitious
 * users). Covers: register, email verification, login (valid/invalid), logout, persistent and
 * expired sessions, recovery and reset, route protection, unauthenticated access, profile
 * update, HttpOnly cookies and safe error results.
 */
interface JarCookie {
  value: string;
  options: Record<string, unknown>;
}
const jar = vi.hoisted(() => ({ cookies: new Map<string, JarCookie>(), headers: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.cookies].map(([name, c]) => ({ name, value: c.value })),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      if (value === "" || options.maxAge === 0) jar.cookies.delete(name);
      else jar.cookies.set(name, { value, options });
    },
  }),
  headers: async () => ({ get: (k: string) => jar.headers.get(k.toLowerCase()) ?? null }),
}));

let fake: Awaited<ReturnType<typeof startFakeSupabase>>;
const actions = await import("@/features/auth/cloud-actions");
const { GET: sessionRoute } = await import("@/app/api/auth/session/route");
const { GET: confirmRoute } = await import("@/app/auth/confirm/route");
const { protectRequest } = await import("@/lib/supabase/proxy");
const { parseSupabaseConfig } = await import("@/lib/supabase/config");
const { supabaseCookieOptions } = await import("@/lib/supabase/cookies");

const PASSWORD = "frase-de-prueba-ficticia-1";
const EMAIL = "ana.ejemplo@ejemplo-ficticio.test";

beforeAll(async () => {
  fake = await startFakeSupabase();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", fake.url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", FAKE.publishableKey);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await fake.close();
});
beforeEach(async () => {
  await fetch(`${fake.url}/__test/reset`, { method: "POST" });
  jar.cookies.clear();
  jar.headers.clear();
  jar.headers.set("origin", "http://localhost:3000");
  jar.headers.set("host", "localhost:3000");
});

const outbox = async () => (await (await fetch(`${fake.url}/__test/outbox`)).json()) as { to: string; type: string; tokenHash: string; redirectTo: string | null }[];
const authCookies = () => [...jar.cookies.keys()].filter((n) => /^sb-[a-z0-9]+-auth-token(\.\d+)?$/.test(n));
const cookieHeader = () => [...jar.cookies].map(([n, c]) => `${n}=${c.value}`).join("; ");
const confirm = (query: string) => confirmRoute(new NextRequest(`http://localhost:3000/auth/confirm?${query}`));
const page = (path: string, withCookies = true) => new NextRequest(`http://localhost:3000${path}`, { headers: withCookies ? { cookie: cookieHeader() } : {} });

/** A verified, signed-in user (register → email link → session cookies). */
async function verifiedUser(email = EMAIL, password = PASSWORD) {
  expect(await actions.cloudSignUp({ email, password, confirmation: password, fullName: "Ana Ejemplo", preferredCurrency: "USD" })).toEqual({ ok: true, needsVerification: true });
  const link = (await outbox()).findLast((m) => m.to === email && m.type === "signup")!;
  const res = await confirm(`token_hash=${link.tokenHash}&type=email`);
  expect(res.status).toBe(303);
  return res;
}

describe("registration and email verification", () => {
  it("registers, sends the verification link to /auth/confirm, and opens no session before verifying", async () => {
    const result = await actions.cloudSignUp({ email: EMAIL, password: PASSWORD, confirmation: PASSWORD, fullName: "Ana Ejemplo", preferredCurrency: "USD" });
    expect(result).toEqual({ ok: true, needsVerification: true });
    expect(authCookies()).toEqual([]);
    const [mail] = await outbox();
    expect(mail).toMatchObject({ to: EMAIL, type: "signup", redirectTo: "http://localhost:3000/auth/confirm" });
    // Metadata read by public.initialize_user() (database/sql/06).
    const state = (await (await fetch(`${fake.url}/__test/state`)).json()) as { users: { confirmed: boolean }[] };
    expect(state.users).toEqual([expect.objectContaining({ confirmed: false })]);
    expect(await actions.cloudSignIn({ email: EMAIL, password: PASSWORD })).toEqual({ ok: false, code: "email-not-confirmed" });
  });

  it("answers an already registered email exactly like a new one (no account enumeration)", async () => {
    await actions.cloudSignUp({ email: EMAIL, password: PASSWORD, confirmation: PASSWORD });
    const again = await actions.cloudSignUp({ email: EMAIL, password: "otra-frase-ficticia-2", confirmation: "otra-frase-ficticia-2" });
    expect(again).toEqual({ ok: true, needsVerification: true });
    expect(await outbox()).toHaveLength(1);
  });

  it("validates input before any network call", async () => {
    const before = fake.state.requests.length;
    expect(await actions.cloudSignUp({ email: "no-es-correo", password: PASSWORD, confirmation: PASSWORD })).toEqual({ ok: false, code: "invalid-input" });
    expect(await actions.cloudSignUp({ email: EMAIL, password: "corta", confirmation: "corta" })).toEqual({ ok: false, code: "weak-password" });
    expect(await actions.cloudSignUp({ email: EMAIL, password: PASSWORD, confirmation: "distinta-ficticia" })).toEqual({ ok: false, code: "invalid-input" });
    expect(await actions.cloudSignUp({ email: 42, password: null })).toEqual({ ok: false, code: "invalid-input" });
    expect(fake.state.requests.length).toBe(before);
  });

  it("the email link verifies the address and opens a session in HttpOnly, SameSite=Lax cookies", async () => {
    const res = await verifiedUser();
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe("/?verificado=1");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const names = authCookies();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const { options } = jar.cookies.get(name)!;
      expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    }
  });

  it("a used, forged or malformed link is refused with a neutral message", async () => {
    await actions.cloudSignUp({ email: EMAIL, password: PASSWORD, confirmation: PASSWORD });
    const [mail] = await outbox();
    await confirm(`token_hash=${mail!.tokenHash}&type=email`);
    jar.cookies.clear();
    for (const query of [`token_hash=${mail!.tokenHash}&type=email`, "token_hash=ffffffffffffffffffff&type=email", "token_hash=<script>&type=email", "type=email", `token_hash=${mail!.tokenHash}&type=desconocido`]) {
      const res = await confirm(query);
      expect(res.headers.get("location")).toBe("http://localhost:3000/entrar?motivo=enlace-invalido");
      expect(authCookies()).toEqual([]);
    }
  });

  it("never redirects an email link outside the app (open redirect)", async () => {
    await actions.cloudSignUp({ email: EMAIL, password: PASSWORD, confirmation: PASSWORD });
    const [mail] = await outbox();
    const res = await confirm(`token_hash=${mail!.tokenHash}&type=email&next=//malicioso.example/x`);
    expect(new URL(res.headers.get("location")!).origin).toBe("http://localhost:3000");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("resend answers the same for unknown, verified and pending addresses", async () => {
    await actions.cloudSignUp({ email: EMAIL, password: PASSWORD, confirmation: PASSWORD });
    for (const email of [EMAIL, "nadie@ejemplo-ficticio.test"]) expect(await actions.cloudResendVerification({ email })).toEqual({ ok: true });
    expect((await outbox()).filter((m) => m.type === "signup")).toHaveLength(2); // only the pending address got one
  });
});

describe("login, session and logout", () => {
  it("rejects invalid credentials with one neutral code (unknown email and wrong password alike)", async () => {
    await verifiedUser();
    jar.cookies.clear();
    expect(await actions.cloudSignIn({ email: EMAIL, password: "incorrecta-ficticia" })).toEqual({ ok: false, code: "invalid-credentials" });
    expect(await actions.cloudSignIn({ email: "nadie@ejemplo-ficticio.test", password: PASSWORD })).toEqual({ ok: false, code: "invalid-credentials" });
    expect(await actions.cloudSignIn({ email: { $ne: "" }, password: PASSWORD })).toEqual({ ok: false, code: "invalid-credentials" });
    expect(authCookies()).toEqual([]);
  });

  it("valid login → session cookies; /api/auth/session returns who, never a token", async () => {
    await verifiedUser();
    jar.cookies.clear();
    const login = await actions.cloudSignIn({ email: EMAIL.toUpperCase(), password: PASSWORD });
    expect(login).toMatchObject({ ok: true, user: { email: EMAIL, emailConfirmed: true, fullName: "Ana Ejemplo" } });
    expect(JSON.stringify(login)).not.toMatch(/access_token|refresh_token|eyJ/);
    const res = await sessionRoute();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ state: "authenticated", user: { email: EMAIL, emailConfirmed: true } });
    expect(text).not.toMatch(/access_token|refresh_token|eyJ|password/);
  });

  it("the session persists across requests and is refreshed when the access token expires", async () => {
    await fetch(`${fake.url}/__test/toggle`, { method: "POST", body: JSON.stringify({ accessTtl: 1 }) });
    await verifiedUser();
    await new Promise((r) => setTimeout(r, 1200));
    const before = cookieHeader();
    const res = await sessionRoute();
    expect(res.status).toBe(200); // refresh_token grant happened on the server
    expect(cookieHeader()).not.toBe(before);
    expect(fake.state.requests.some((r) => r.path === "/auth/v1/token")).toBe(true);
  });

  it("logout ends the server session and clears the cookies", async () => {
    await verifiedUser();
    expect(await actions.cloudSignOut("local")).toEqual({ ok: true });
    expect(authCookies()).toEqual([]);
    expect((await sessionRoute()).status).toBe(401);
  });

  it("global logout ends the sessions of other devices too", async () => {
    await verifiedUser();
    const deviceA = new Map(jar.cookies);
    jar.cookies.clear();
    await actions.cloudSignIn({ email: EMAIL, password: PASSWORD });
    expect(await actions.cloudSignOut("global")).toEqual({ ok: true });
    jar.cookies.clear();
    for (const [k, v] of deviceA) jar.cookies.set(k, v);
    expect((await sessionRoute()).status).toBe(401);
  });

  it("an expired or revoked session is reported as anonymous (401), not as an error", async () => {
    await verifiedUser();
    await fetch(`${fake.url}/__test/expire-all`, { method: "POST" });
    expect((await sessionRoute()).status).toBe(401);
  });

  it("an unreachable Auth server is 'unavailable' (503) — never confused with signed out", async () => {
    await verifiedUser();
    await fetch(`${fake.url}/__test/toggle`, { method: "POST", body: JSON.stringify({ authDown: true }) });
    const res = await sessionRoute();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ state: "unavailable" });
  });
});

describe("route protection on the server (proxy)", () => {
  const config = () => parseSupabaseConfig();

  it("redirects an unauthenticated request for any private page to /entrar, keeping the destination", async () => {
    for (const path of ["/", "/cuentas", "/transacciones?tipo=gasto", "/perfil", "/configuracion", "/ruta-desconocida"]) {
      const res = await protectRequest(page(path, false), config());
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get("location")!);
      expect(location.pathname).toBe("/entrar");
      if (path !== "/") expect(location.searchParams.get("next")).toBe(path);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("leaves public pages, email links and API routes alone", async () => {
    for (const path of ["/entrar", "/registro", "/recuperar", "/restablecer", "/verificar", "/auth/confirm", "/offline", "/api/auth/session", "/api/health/supabase"]) {
      const res = await protectRequest(page(path, false), config());
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("lets a verified session through and marks an invalid one as expired", async () => {
    await verifiedUser();
    expect((await protectRequest(page("/cuentas"), config())).headers.get("location")).toBeNull();
    await fetch(`${fake.url}/__test/expire-all`, { method: "POST" });
    const res = await protectRequest(page("/cuentas"), config());
    expect(new URL(res.headers.get("location")!).searchParams.get("motivo")).toBe("expired");
  });

  it("with the Auth server unreachable, a request carrying a session goes through (offline-first client decides)", async () => {
    await verifiedUser();
    await fetch(`${fake.url}/__test/toggle`, { method: "POST", body: JSON.stringify({ authDown: true }) });
    await fetch(`${fake.url}/__test/toggle`, { method: "POST", body: JSON.stringify({ accessTtl: 0 }) });
    expect((await protectRequest(page("/cuentas"), config())).headers.get("location")).toBeNull();
    expect((await protectRequest(page("/cuentas", false), config())).status).toBe(307);
  });

  it("does nothing when Supabase is not configured (local mode)", async () => {
    const res = await protectRequest(page("/cuentas", false), parseSupabaseConfig({}));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("password recovery and change", () => {
  it("recovery answers the same for unknown emails and only mails existing accounts", async () => {
    await verifiedUser();
    for (const email of [EMAIL, "nadie@ejemplo-ficticio.test"]) expect(await actions.cloudRequestReset({ email })).toEqual({ ok: true });
    expect((await outbox()).filter((m) => m.type === "recovery").map((m) => m.to)).toEqual([EMAIL]);
  });

  it("recovery link → /restablecer → new password without the old one; old password stops working", async () => {
    await verifiedUser();
    await actions.cloudSignOut("local");
    await actions.cloudRequestReset({ email: EMAIL });
    const link = (await outbox()).find((m) => m.type === "recovery")!;
    expect(link.redirectTo).toBe("http://localhost:3000/auth/confirm");
    const res = await confirm(`token_hash=${link.tokenHash}&type=recovery`);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/restablecer");
    const next = "nueva-frase-ficticia-3";
    expect(await actions.cloudChangePassword({ newPassword: next, confirmation: next })).toEqual({ ok: true });
    await actions.cloudSignOut("local");
    expect(await actions.cloudSignIn({ email: EMAIL, password: PASSWORD })).toEqual({ ok: false, code: "invalid-credentials" });
    expect(await actions.cloudSignIn({ email: EMAIL, password: next })).toMatchObject({ ok: true });
  });

  it("an ordinary session cannot set a password without the current one (stolen-session guard)", async () => {
    await verifiedUser(); // amr "otp", not "recovery"
    const next = "nueva-frase-ficticia-4";
    expect(await actions.cloudChangePassword({ newPassword: next, confirmation: next })).toEqual({ ok: false, code: "session-missing" });
    jar.cookies.clear();
    await actions.cloudSignIn({ email: EMAIL, password: PASSWORD }); // amr "password"
    expect(await actions.cloudChangePassword({ newPassword: next, confirmation: next })).toEqual({ ok: false, code: "session-missing" });
  });

  it("changing the password re-verifies the current one", async () => {
    await verifiedUser();
    const next = "nueva-frase-ficticia-5";
    expect(await actions.cloudChangePassword({ currentPassword: "incorrecta-ficticia", newPassword: next, confirmation: next })).toEqual({ ok: false, code: "invalid-credentials" });
    expect(await actions.cloudChangePassword({ currentPassword: PASSWORD, newPassword: PASSWORD, confirmation: PASSWORD })).toEqual({ ok: false, code: "same-password" });
    expect(await actions.cloudChangePassword({ currentPassword: PASSWORD, newPassword: "corta", confirmation: "corta" })).toEqual({ ok: false, code: "weak-password" });
    expect(await actions.cloudChangePassword({ currentPassword: PASSWORD, newPassword: next, confirmation: next })).toEqual({ ok: true });
  });

  it("without a session nothing can be changed", async () => {
    const next = "nueva-frase-ficticia-6";
    expect(await actions.cloudChangePassword({ currentPassword: PASSWORD, newPassword: next, confirmation: next })).toEqual({ ok: false, code: "session-missing" });
    expect(await actions.cloudUpdateProfile({ fullName: "X", phone: "", country: "", region: "" })).toEqual({ ok: false, code: "session-missing" });
    expect(await actions.cloudGetProfile()).toEqual({ ok: false, code: "session-missing" });
  });
});

describe("cloud profile (public.profiles, own row)", () => {
  it("reads and updates the editable fields of the signed-in user's own profile", async () => {
    await verifiedUser();
    expect(await actions.cloudGetProfile()).toMatchObject({ ok: true, profile: { fullName: "Ana Ejemplo" } });
    const saved = await actions.cloudUpdateProfile({ fullName: "Ana E. Ejemplo", phone: "+54 11 5555-0000", country: "AR", region: "Córdoba" });
    expect(saved).toMatchObject({ ok: true, profile: { fullName: "Ana E. Ejemplo", country: "AR", region: "Córdoba" } });
  });

  it("refuses unknown fields (no email, password, hash or token can be written) and invalid values", async () => {
    await verifiedUser();
    const before = fake.state.requests.length;
    for (const edit of [
      { fullName: "A", phone: "", country: "", region: "", contactEmail: "x@y.z" },
      { fullName: "A", phone: "", country: "", region: "", password: "x" },
      { fullName: "A", phone: "letras", country: "", region: "" },
      { fullName: "A", phone: "", country: "ZZ", region: "" },
    ]) {
      expect(await actions.cloudUpdateProfile(edit)).toEqual({ ok: false, code: "invalid-input" });
    }
    expect(fake.state.requests.slice(before).some((r) => r.path.startsWith("/rest/"))).toBe(false);
  });

  it("degrades to 'profile-unavailable' when the access policies (SQL 09) are not installed", async () => {
    await verifiedUser();
    await fetch(`${fake.url}/__test/toggle`, { method: "POST", body: JSON.stringify({ profilesPolicies: false }) });
    expect(await actions.cloudUpdateProfile({ fullName: "A", phone: "", country: "", region: "" })).toEqual({ ok: false, code: "profile-unavailable" });
  });
});

describe("cookie security settings", () => {
  it("HttpOnly and SameSite=Lax always; Secure in production", () => {
    expect(supabaseCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    vi.stubEnv("NODE_ENV", "production");
    expect(supabaseCookieOptions()).toMatchObject({ httpOnly: true, secure: true });
    vi.stubEnv("NODE_ENV", "test");
  });

  it("results never carry provider messages, tokens or stack traces", async () => {
    const results = [
      await actions.cloudSignIn({ email: EMAIL, password: "x" }),
      await actions.cloudSignUp({ email: EMAIL, password: "x", confirmation: "x" }),
      await actions.cloudRequestReset({ email: "x" }),
    ];
    for (const r of results) {
      expect(Object.keys(r).sort()).toEqual(r.ok ? expect.any(Array) : ["code", "ok"]);
      expect(JSON.stringify(r)).not.toMatch(/Invalid login|stack|token/i);
    }
  });
});
