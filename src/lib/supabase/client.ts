import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { parseSupabaseConfig, type SupabaseConfig } from "./config";
import { supabaseCookieOptions } from "./cookies";
import type { Database } from "./types";

/**
 * Browser Supabase client (Step 12). Uses ONLY the public URL and publishable key; there is no
 * privileged credential anywhere in client code. One instance per page (singleton).
 *
 * Returns null when Supabase is not configured: callers fall back to the local data and the
 * local login, which stay the active implementation until Step 14. Nothing in the app calls
 * this yet except the cloud status panel.
 */
let instance: SupabaseClient<Database> | null = null;
let instanceKey: string | null = null;

export function getSupabaseBrowserClient(config: SupabaseConfig = parseSupabaseConfig()): SupabaseClient<Database> | null {
  if (typeof window === "undefined") {
    throw new AppError("UNKNOWN", "getSupabaseBrowserClient() is for the browser; use createSupabaseServerClient() on the server");
  }
  if (config.status !== "configured") return null;
  const key = `${config.url}|${config.keyVariable}`;
  if (instance && instanceKey === key) return instance;
  instance = createBrowserClient<Database>(config.url, config.publishableKey, {
    cookieOptions: supabaseCookieOptions(),
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    isSingleton: false,
  });
  instanceKey = key;
  return instance;
}

/** Tests only: forget the singleton. */
export function resetSupabaseBrowserClientForTests(): void {
  instance = null;
  instanceKey = null;
}
