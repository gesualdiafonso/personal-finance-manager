import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Cookie options for the Supabase session cookies (official SSR integration).
 *
 * Step 14 (D-SB-02): HttpOnly. Every auth operation runs on the server (Server Actions,
 * /auth/confirm, /api/auth/session, the proxy), so no browser script ever needs — or can read —
 * the access or refresh token. An XSS can no longer steal the session from document.cookie.
 * SameSite=Lax: sent on top-level navigations (email links work) but not on cross-site POSTs.
 * Secure in production so the cookies never travel over plain http (localhost is exempt in
 * browsers, which keeps local production builds usable).
 */
export function supabaseCookieOptions(): CookieOptionsWithName {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}
