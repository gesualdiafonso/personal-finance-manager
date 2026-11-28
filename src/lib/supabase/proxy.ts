import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseSupabaseConfig, type SupabaseConfig } from "./config";
import { supabaseCookieOptions } from "./cookies";
import type { Database } from "./types";

/**
 * Session refresh and route protection for the Next.js 16 proxy (src/proxy.ts — the successor
 * of `middleware`).
 *
 * `updateSupabaseSession` (Step 12, unchanged contract — it never redirects):
 * - Supabase not configured, or no Supabase session cookie → untouched (no network call).
 * - A session cookie is present → `getClaims()` verifies the JWT and, when needed, refreshes the
 *   tokens, writing the new cookies to BOTH the request (this render) and the response.
 *
 * `protectRequest` (Step 14, D-SB-03): with Supabase configured, a protected path without a
 * verified session is redirected to /entrar?next=… on the SERVER — the page is never served.
 * If the Auth server cannot be reached while a session cookie exists ("unavailable"), the
 * request goes through and the client decides with its offline snapshot (offline-first PWA:
 * the financial data lives on the device, the server holds none of it yet).
 */

/** Always public: account screens, email links, offline page, health and session endpoints. */
export const PUBLIC_PATH_PREFIXES = ["/entrar", "/registro", "/recuperar", "/restablecer", "/verificar", "/auth/", "/offline", "/api/"] as const;
/** The application's own pages (informative: every non-public page is protected). */
export const PROTECTED_PATH_PREFIXES = ["/", "/transacciones", "/cuentas", "/cuentas-domesticas", "/tarjetas", "/recurrencias", "/presupuesto", "/informes", "/configuracion", "/perfil"] as const;

/** Every page that is not explicitly public requires a session (deny by default). */
export function isProtectedPath(pathname: string): boolean {
  return !PUBLIC_PATH_PREFIXES.some((prefix) => (prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

/** Supabase auth cookies are named sb-<project-ref>-auth-token (optionally chunked .0, .1 …). */
export function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-[a-z0-9]+-auth-token(\.\d+)?$/.test(c.name) && c.value !== "");
}

export interface SessionResult {
  response: NextResponse;
  /**
   * "skipped": nothing to do; "verified": a valid session; "anonymous": cookie present but no
   * valid session; "unavailable": cookie present but the Auth server could not be reached.
   */
  state: "skipped" | "verified" | "anonymous" | "unavailable";
  userId: string | null;
}

export async function updateSupabaseSession(request: NextRequest, config: SupabaseConfig = parseSupabaseConfig()): Promise<SessionResult> {
  if (config.status !== "configured" || !hasSupabaseSessionCookie(request)) {
    return { response: NextResponse.next({ request }), state: "skipped", userId: null };
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(config.url, config.publishableKey, {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  // Do not put code between client creation and getClaims(): it is what refreshes the session.
  let userId: string | null = null;
  let unavailable = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    unavailable = !userId && isUnavailable(error);
  } catch (error) {
    // Never crash the app: an invalid token is anonymous; a network failure is "unavailable".
    userId = null;
    unavailable = isUnavailable(error);
  }
  // Responses that carry refreshed auth cookies must not be cached by a CDN.
  response.headers.set("Cache-Control", "private, no-store");
  return { response, state: userId ? "verified" : unavailable ? "unavailable" : "anonymous", userId };
}

/** The Auth server could not answer (network, 5xx) — as opposed to "the session is not valid". */
function isUnavailable(error: unknown): boolean {
  const e = error as { name?: string; status?: number } | null;
  if (!e) return false;
  return e.name === "AuthRetryableFetchError" || e.status === 0 || (typeof e.status === "number" && e.status >= 500);
}

/** Login URL with the page to return to (only same-app paths, see safeNext in the client). */
export function loginRedirectUrl(request: NextRequest, reason: "expired" | null): URL {
  const url = new URL("/entrar", request.url);
  url.search = "";
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/" && next.startsWith("/") && !next.startsWith("//")) url.searchParams.set("next", next);
  if (reason) url.searchParams.set("motivo", reason);
  return url;
}

/**
 * Step 14: refresh + server-side protection. Returns the response to send (the refreshed
 * response, or a redirect carrying the same cookie changes — e.g. a cleared expired session).
 */
export async function protectRequest(request: NextRequest, config: SupabaseConfig = parseSupabaseConfig()): Promise<NextResponse> {
  const result = await updateSupabaseSession(request, config);
  if (config.status !== "configured" || !isProtectedPath(request.nextUrl.pathname)) return result.response;
  if (result.state === "verified" || result.state === "unavailable") return result.response;
  const redirect = NextResponse.redirect(loginRedirectUrl(request, result.state === "anonymous" ? "expired" : null), 307);
  for (const cookie of result.response.cookies.getAll()) redirect.cookies.set(cookie);
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}
