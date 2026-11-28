import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Cookie options for the Supabase session cookies (official SSR integration). They stay
 * readable by JavaScript (httpOnly: false) because the browser client must read the session —
 * that is how @supabase/ssr works; the protection against theft is the CSP and short-lived,
 * rotating tokens (docs/SUPABASE_SETUP.md §Sesiones). SameSite=Lax blocks cross-site POSTs;
 * Secure in production so they never travel over plain http.
 */
export function supabaseCookieOptions(): CookieOptionsWithName {
  return {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}
