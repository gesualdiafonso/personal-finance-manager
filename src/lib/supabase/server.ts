import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { parseSupabaseConfig, type SupabaseConfig } from "./config";
import { supabaseCookieOptions } from "./cookies";
import type { Database } from "./types";

/**
 * Server Supabase client for Route Handlers, Server Actions and Server Components (Step 12).
 * Reads and writes the session cookies through next/headers with the official getAll/setAll
 * contract. Uses the PUBLIC key with the user's session — never a privileged key: requests
 * act as the signed-in user and will be limited by RLS (Step 15).
 *
 * Create one per request (never share between requests). Returns null when Supabase is not
 * configured.
 *
 * To trust the user on the server, call `supabase.auth.getClaims()` (verifies the JWT) — never
 * `getSession()`, which only reads the cookie.
 */
export async function createSupabaseServerClient(config: SupabaseConfig = parseSupabaseConfig()): Promise<SupabaseClient<Database> | null> {
  if (config.status !== "configured") return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy
          // (src/proxy.ts) refreshes the session and writes the cookies instead.
        }
      },
    },
  });
}
