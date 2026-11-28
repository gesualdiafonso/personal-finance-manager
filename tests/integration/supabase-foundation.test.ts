// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Step 12 — Supabase foundation: server client, proxy session refresh, health check (route
 * included), privileged-key guards and local-auth compatibility. No real Supabase project is
 * used: values are fictitious and network calls are mocked; the outcomes the code reports are
 * real (no simulated success).
 */
const cookieJar = vi.hoisted(() => ({ values: new Map<string, string>(), set: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...cookieJar.values].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      cookieJar.set(name, value, options);
      cookieJar.values.set(name, value);
    },
  }),
}));

import { parseSupabaseConfig } from "@/lib/supabase/config";
import { checkSupabaseHealth, healthHttpStatus, HEALTH_PATH } from "@/lib/supabase/health";
import { hasSupabaseSessionCookie, updateSupabaseSession } from "@/lib/supabase/proxy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { configuredEnv, FAKE } from "../helpers/supabase-fixtures";

const configured = parseSupabaseConfig(configuredEnv);
const notConfigured = parseSupabaseConfig({});

beforeEach(() => {
  cookieJar.values.clear();
  cookieJar.set.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("server client", () => {
  it("initialises with the public key and the request cookies when configured", async () => {
    cookieJar.values.set("otra", "x");
    const client = await createSupabaseServerClient(configured);
    expect(client).not.toBeNull();
    expect(typeof client!.auth.getClaims).toBe("function");
    expect(typeof client!.from).toBe("function");
  });
  it("returns null when not configured or invalid (no throw)", async () => {
    expect(await createSupabaseServerClient(notConfigured)).toBeNull();
    expect(await createSupabaseServerClient(parseSupabaseConfig({ ...configuredEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE.secretKey }))).toBeNull();
  });
  it("reads process.env by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", FAKE.url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", FAKE.publishableKey);
    expect(await createSupabaseServerClient()).not.toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(await createSupabaseServerClient()).toBeNull();
  });
});

describe("proxy session refresh (Next.js 16 proxy)", () => {
  const request = (path: string, cookies: Record<string, string> = {}) => {
    const r = new NextRequest(new URL(path, "https://aureon.example"));
    for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
    return r;
  };

  it("lets every request through untouched without a Supabase session cookie (today: always)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const path of ["/", "/entrar", "/registro", "/cuentas", "/perfil"]) {
      const result = await updateSupabaseSession(request(path, { "pfm.otra": "1" }), configured);
      expect(result.state).toBe("skipped");
      expect(result.response.headers.get("x-middleware-next")).toBe("1");
      expect(result.response.headers.get("location")).toBeNull(); // never redirects in Step 12
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does nothing when Supabase is not configured, even with a cookie", async () => {
    const result = await updateSupabaseSession(request("/", { "sb-ejemplo-auth-token": "x" }), notConfigured);
    expect(result.state).toBe("skipped");
  });

  it("verifies a present session cookie and stays anonymous when it is not valid", async () => {
    const r = request("/cuentas", { "sb-ejemploficticio-auth-token": "base64-no-es-una-sesion" });
    expect(hasSupabaseSessionCookie(r)).toBe(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("sin red"));
    const result = await updateSupabaseSession(r, configured);
    expect(result).toMatchObject({ state: "anonymous", userId: null });
    expect(result.response.headers.get("cache-control")).toBe("private, no-store");
    expect(result.response.headers.get("location")).toBeNull();
    fetchSpy.mockRestore();
  });

  it("recognises chunked auth cookies and ignores unrelated ones", () => {
    expect(hasSupabaseSessionCookie(request("/", { "sb-abc123-auth-token.0": "x" }))).toBe(true);
    expect(hasSupabaseSessionCookie(request("/", { "sb-abc123-auth-token-code-verifier": "x" }))).toBe(false);
    expect(hasSupabaseSessionCookie(request("/", { "aureon.session": "x" }))).toBe(false);
  });
});

describe("connection health check", () => {
  const now = () => new Date("2026-11-28T13:00:00Z");

  it("distinguishes missing configuration, invalid configuration, network failure, timeout, HTTP error and success", async () => {
    expect(await checkSupabaseHealth({ config: notConfigured, now })).toMatchObject({ status: "not-configured" });
    expect(await checkSupabaseHealth({ config: parseSupabaseConfig({ ...configuredEnv, NEXT_PUBLIC_SUPABASE_URL: "http://otro.example" }), now })).toMatchObject({ status: "invalid-config" });

    const network = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await checkSupabaseHealth({ config: configured, fetchImpl: network, now })).toMatchObject({ status: "unreachable", reason: "network", host: "ejemploficticio.supabase.example" });

    const slow = vi.fn<typeof fetch>((_url, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    expect(await checkSupabaseHealth({ config: configured, fetchImpl: slow, timeoutMs: 10, now })).toMatchObject({ status: "unreachable", reason: "timeout" });

    const unauthorized = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 401 }));
    expect(await checkSupabaseHealth({ config: configured, fetchImpl: unauthorized, now })).toMatchObject({ status: "error", httpStatus: 401, message: expect.stringContaining("publishable key") });

    const ok = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ version: "v2", name: "GoTrue" }));
    const health = await checkSupabaseHealth({ config: configured, fetchImpl: ok, now });
    expect(health).toMatchObject({ status: "ok", service: "GoTrue", host: "ejemploficticio.supabase.example", checkedAt: "2026-11-28T13:00:00.000Z" });
    expect(healthHttpStatus(health)).toBe(200);
    expect(healthHttpStatus({ status: "not-configured", message: "", checkedAt: "" })).toBe(503);
  });

  it("calls only the Auth health endpoint (no table), and never returns the key", async () => {
    const ok = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ name: "GoTrue" }));
    const health = await checkSupabaseHealth({ config: configured, fetchImpl: ok });
    expect(ok).toHaveBeenCalledTimes(1);
    const [url, init] = ok.mock.calls[0]!;
    expect(url).toBe(`${FAKE.url}${HEALTH_PATH}`);
    expect(url).not.toMatch(/rest\/v1/);
    expect((init?.headers as Record<string, string>).apikey).toBe(FAKE.publishableKey); // sent to Supabase only
    expect(JSON.stringify(health)).not.toContain(FAKE.publishableKey);
  });

  it("GET /api/health/supabase answers a controlled, uncached status", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { GET } = await import("@/app/api/health/supabase/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "not-configured" });
  });
});

describe("secret exposure prevention", () => {
  const guard = resolve("scripts/guards/check-public-artifacts.mjs");
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aureon-guard-"));
    mkdirSync(join(dir, ".next/static/chunks"), { recursive: true });
    mkdirSync(join(dir, ".next/server"), { recursive: true });
    mkdirSync(join(dir, "public"), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const run = () => {
    try {
      return { code: 0, out: execFileSync("node", [guard], { cwd: dir, encoding: "utf8", stdio: "pipe" }) };
    } catch (e) {
      const err = e as { status: number; stderr: string };
      return { code: err.status, out: err.stderr };
    }
  };

  it("passes a bundle that only holds the publishable key", () => {
    writeFileSync(join(dir, ".next/static/chunks/app.js"), `const k=${JSON.stringify(FAKE.publishableKey)};const a=${JSON.stringify(FAKE.legacyAnonKey)};`);
    expect(run().code).toBe(0);
  });
  it("fails on a secret key or a service_role JWT in the build output, without printing it", () => {
    for (const secret of [FAKE.secretKey, FAKE.serviceRoleKey]) {
      writeFileSync(join(dir, ".next/static/chunks/app.js"), `const k=${JSON.stringify(secret)};`);
      const result = run();
      expect(result.code).toBe(1);
      expect(result.out).toContain("privileged Supabase key");
      expect(result.out).not.toContain(secret);
    }
  });
  it("the Supabase code itself (patterns, not keys) does not trip the guard", () => {
    writeFileSync(join(dir, ".next/static/chunks/app.js"), "const SECRET_PATTERN=/^sb_secret_/;const PUBLISHABLE=/^sb_publishable_[A-Za-z0-9_-]{16,}$/;");
    expect(run().code).toBe(0);
  });
});
