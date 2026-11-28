import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseSupabaseConfig, type SupabaseConfig } from "./config";
import { supabaseCookieOptions } from "./cookies";
import type { Database } from "./types";

/**
 * Session refresh for the Next.js 16 proxy (src/proxy.ts — the successor of `middleware`).
 *
 * Step 12 behaviour, on purpose minimal:
 * - Supabase not configured, or no Supabase session cookie on the request → the request goes
 *   through untouched (no network call, no cost). This is every request until Step 14.
 * - A Supabase session cookie is present → the official SSR client verifies the JWT with
 *   `getClaims()` and, when needed, refreshes the tokens, writing the new cookies to BOTH the
 *   request (for this render) and the response (for the browser).
 * - It never redirects: the local login still protects the app on the client. Step 14 will use
 *   `PROTECTED_PATH_PREFIXES` and the verified claims to protect routes on the server.
 */

/** Routes the server will protect once Supabase Auth is the active login (Step 14). */
export const PROTECTED_PATH_PREFIXES = ["/", "/transacciones", "/cuentas", "/cuentas-domesticas", "/tarjetas", "/recurrencias", "/presupuesto", "/informes", "/configuracion", "/perfil"] as const;
/** Always public (account screens, offline page, health check). */
export const PUBLIC_PATH_PREFIXES = ["/entrar", "/registro", "/offline", "/api/health"] as const;

/** Supabase auth cookies are named sb-<project-ref>-auth-token (optionally chunked .0, .1 …). */
export function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-[a-z0-9]+-auth-token(\.\d+)?$/.test(c.name) && c.value !== "");
}

export interface SessionResult {
  response: NextResponse;
  /** "skipped": nothing to do; "verified": a valid session; "anonymous": cookie present but no valid session. */
  state: "skipped" | "verified" | "anonymous";
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
  try {
    const { data } = await supabase.auth.getClaims();
    userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  } catch {
    // Network failure or invalid token: the request continues as anonymous; never crash the app.
    userId = null;
  }
  // Responses that carry refreshed auth cookies must not be cached by a CDN.
  response.headers.set("Cache-Control", "private, no-store");
  return { response, state: userId ? "verified" : "anonymous", userId };
}
