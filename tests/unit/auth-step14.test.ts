import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeNext } from "@/features/auth/paths";
import { authErrorCode } from "@/lib/supabase/auth-service";
import { isProtectedPath } from "@/lib/supabase/proxy";
import { resolveSiteOrigin } from "@/lib/supabase/site-url";
import { checkPassword, CLOUD_PASSWORD_MIN_LENGTH } from "@/services/auth/password";

/** Step 14 — pure rules of the Supabase Auth integration (no network, no database). */
const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

describe("safe return paths (open-redirect protection)", () => {
  it.each([
    ["/cuentas?x=1", "/cuentas?x=1"],
    ["/", "/"],
    [null, "/"],
    ["https://malicioso.example", "/"],
    ["//malicioso.example", "/"],
    ["/\\malicioso.example", "/"],
    ["/entrar", "/"],
    ["/entrar?next=/x", "/"],
    ["/restablecer", "/"],
    ["/auth/confirm?token_hash=x", "/"],
    ["/entrarx", "/entrarx"],
  ])("%s → %s", (raw, expected) => expect(safeNext(raw)).toBe(expected));
});

describe("server-side route protection map", () => {
  it("denies by default and keeps account screens, email links and APIs public", () => {
    for (const p of ["/", "/cuentas", "/cuentas/abc", "/perfil", "/configuracion", "/ruta-nueva"]) expect(isProtectedPath(p), p).toBe(true);
    for (const p of ["/entrar", "/registro", "/recuperar", "/restablecer", "/verificar", "/auth/confirm", "/offline", "/api/auth/session"]) expect(isProtectedPath(p), p).toBe(false);
  });
});

describe("email-link origin", () => {
  it("prefers NEXT_PUBLIC_SITE_URL, then the request Origin, then forwarded host", () => {
    expect(resolveSiteOrigin(headers({ origin: "http://otro.example" }), { NEXT_PUBLIC_SITE_URL: "https://aureon.example/ruta" })).toBe("https://aureon.example");
    expect(resolveSiteOrigin(headers({ origin: "https://app.example" }), {})).toBe("https://app.example");
    expect(resolveSiteOrigin(headers({ host: "app.example" }), {})).toBe("https://app.example");
    expect(resolveSiteOrigin(headers({ host: "localhost:3000" }), {})).toBe("http://localhost:3000");
    expect(resolveSiteOrigin(headers({ host: "mal host/x" }), {})).toBeNull();
    expect(resolveSiteOrigin(headers({ origin: "javascript:alert(1)" }), {})).toBeNull();
  });
});

describe("safe error codes", () => {
  it("maps provider errors to a closed set and never forwards messages", () => {
    expect(authErrorCode({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("invalid-credentials");
    expect(authErrorCode({ code: "email_not_confirmed" })).toBe("email-not-confirmed");
    expect(authErrorCode({ code: "over_email_send_rate_limit" })).toBe("rate-limited");
    expect(authErrorCode({ status: 429 })).toBe("rate-limited");
    expect(authErrorCode({ code: "otp_expired" })).toBe("link-invalid");
    expect(authErrorCode({ name: "AuthRetryableFetchError", status: 0 })).toBe("network");
    expect(authErrorCode({ name: "AuthSessionMissingError" })).toBe("session-missing");
    expect(authErrorCode({ code: "algo_nuevo", message: "detalle interno" })).toBe("unknown");
    expect(authErrorCode(null)).toBe("unknown");
  });
});

describe("cloud password policy", () => {
  it("same rules as the local policy, with 10 characters minimum", () => {
    expect(CLOUD_PASSWORD_MIN_LENGTH).toBe(10);
    expect(checkPassword("nueve9999", { minLength: CLOUD_PASSWORD_MIN_LENGTH })).toBe("too-short");
    expect(checkPassword("frase-larga-ficticia", { minLength: CLOUD_PASSWORD_MIN_LENGTH })).toBeNull();
    expect(checkPassword("1234567890", { minLength: CLOUD_PASSWORD_MIN_LENGTH })).toBe("too-common");
  });
});

describe("service worker (PWA) and auth", () => {
  const sw = readFileSync("scripts/pwa/sw.template.js", "utf8");
  it("never stores a redirected navigation (a protected page answered with /entrar) under the requested URL", () => {
    expect(sw).toMatch(/response\.ok && !response\.redirected/);
  });
  it("never caches the session endpoint or email links", () => {
    expect(sw).toMatch(/startsWith\("\/api\/"\)\) return;/);
    expect(sw).toMatch(/startsWith\("\/auth\/"\)\) return;/);
  });
});
