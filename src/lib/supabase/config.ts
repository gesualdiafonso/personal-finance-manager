import { z } from "zod";

/**
 * Supabase public configuration (Step 12, ADR-006). The single place that reads the Supabase
 * environment variables, validates them with Zod and decides whether the cloud is available.
 *
 * Rules (docs/ENVIRONMENT.md):
 * - Only PUBLIC values are read here: the project URL and the publishable key (or the legacy
 *   anon key). Both are meant to be public; they are only safe together with RLS (Step 15).
 * - A privileged key (sb_secret_…, or a legacy JWT whose role is service_role) in a public
 *   variable is refused — it would be shipped to every browser.
 * - Messages name variables and problems, never values: nothing secret reaches a log.
 * - Missing configuration is a normal state ("not-configured"): the app keeps working on its
 *   local data and local login. Nothing here throws on import.
 *
 * `process.env.NEXT_PUBLIC_*` are read with literal names so Next.js can inline them in the
 * browser bundle.
 */

export const SUPABASE_ENV = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  publishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  anonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
} as const;

export interface SupabasePublicEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

/** The current environment, with literal names (inlined by Next.js in client code). */
export function readSupabasePublicEnv(): SupabasePublicEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export type KeyKind = "publishable" | "legacy-anon";

export type SupabaseConfigProblemCode =
  | "url-invalid"
  | "url-insecure"
  | "url-has-credentials"
  | "url-has-path"
  | "key-invalid"
  | "key-privileged";

export interface SupabaseConfigProblem {
  variable: string;
  code: SupabaseConfigProblemCode;
  /** Safe to log: never contains the value. */
  message: string;
}

export type SupabaseConfig =
  | { status: "configured"; url: string; publishableKey: string; keyKind: KeyKind; keyVariable: string }
  | { status: "not-configured"; missing: string[] }
  | { status: "invalid"; problems: SupabaseConfigProblem[] };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PUBLISHABLE_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{16,}$/;
const SECRET_PATTERN = /^sb_secret_/;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const blank = (v: string | undefined): v is undefined => v === undefined || v.trim() === "";

/** Payload of a JWT without verifying it (only to read the claimed role of a legacy key). */
function jwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "="))) as unknown;
    const role = z.object({ role: z.string() }).safeParse(json);
    return role.success ? role.data.role : null;
  } catch {
    return null;
  }
}

/** Classifies a key without ever returning or logging it. */
export function classifyKey(value: string): { kind: KeyKind } | { problem: "key-invalid" | "key-privileged" } {
  const key = value.trim();
  if (SECRET_PATTERN.test(key)) return { problem: "key-privileged" };
  if (PUBLISHABLE_PATTERN.test(key)) return { kind: "publishable" };
  if (JWT_PATTERN.test(key)) {
    const role = jwtRole(key);
    if (role === "service_role" || role === "supabase_admin") return { problem: "key-privileged" };
    if (role === "anon") return { kind: "legacy-anon" };
  }
  return { problem: "key-invalid" };
}

const urlSchema = z.string().trim().pipe(z.url());

function checkUrl(value: string): { url: string } | { problem: SupabaseConfigProblem } {
  const variable = SUPABASE_ENV.url;
  const parsed = urlSchema.safeParse(value);
  if (!parsed.success) return { problem: { variable, code: "url-invalid", message: `${variable} is not a valid URL` } };
  const url = new URL(parsed.data);
  if (url.username || url.password) return { problem: { variable, code: "url-has-credentials", message: `${variable} must not contain a user or password` } };
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    return { problem: { variable, code: "url-insecure", message: `${variable} must use https (http is allowed only for localhost)` } };
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    return { problem: { variable, code: "url-has-path", message: `${variable} must be the project URL only (no path, query or fragment)` } };
  }
  return { url: url.origin };
}

/**
 * Validates the Supabase public environment. The publishable key wins over the legacy anon
 * key when both are set.
 */
export function parseSupabaseConfig(env: SupabasePublicEnv = readSupabasePublicEnv()): SupabaseConfig {
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const keyVariable = !blank(publishable) ? SUPABASE_ENV.publishableKey : SUPABASE_ENV.anonKey;
  const rawKey = !blank(publishable) ? publishable : anon;

  const problems: SupabaseConfigProblem[] = [];
  // A privileged key is an error even if the rest of the configuration is missing.
  for (const [variable, value] of [
    [SUPABASE_ENV.publishableKey, publishable],
    [SUPABASE_ENV.anonKey, anon],
  ] as const) {
    if (!blank(value)) {
      const kind = classifyKey(value);
      if ("problem" in kind && kind.problem === "key-privileged") {
        problems.push({ variable, code: "key-privileged", message: `${variable} holds a privileged (secret/service_role) key. Never put it in a NEXT_PUBLIC_ variable; rotate it in Supabase.` });
      }
    }
  }
  if (problems.length > 0) return { status: "invalid", problems };

  const missing = [blank(rawUrl) ? SUPABASE_ENV.url : null, blank(rawKey) ? `${SUPABASE_ENV.publishableKey} (or ${SUPABASE_ENV.anonKey})` : null].filter((m): m is string => m !== null);
  if (missing.length === 2) return { status: "not-configured", missing };

  if (!blank(rawUrl)) {
    const url = checkUrl(rawUrl);
    if ("problem" in url) problems.push(url.problem);
  }
  if (!blank(rawKey)) {
    const kind = classifyKey(rawKey);
    if ("problem" in kind) problems.push({ variable: keyVariable, code: kind.problem, message: `${keyVariable} is not a Supabase publishable key (sb_publishable_…) or a legacy anon key` });
  }
  if (missing.length > 0) {
    // Half-configured: treat as invalid so the developer sees it, instead of silently local.
    for (const m of missing) problems.push({ variable: m, code: m.startsWith(SUPABASE_ENV.url) ? "url-invalid" : "key-invalid", message: `${m} is missing while the other Supabase variable is set` });
  }
  if (problems.length > 0) return { status: "invalid", problems };

  const url = checkUrl(rawUrl!) as { url: string };
  const kind = classifyKey(rawKey!) as { kind: KeyKind };
  return { status: "configured", url: url.url, publishableKey: rawKey!.trim(), keyKind: kind.kind, keyVariable };
}

/** One-line, value-free description for developers (console, health check, docs). */
export function describeSupabaseConfig(config: SupabaseConfig): string {
  if (config.status === "configured") return `Supabase configured (${new URL(config.url).host}, ${config.keyKind} key from ${config.keyVariable})`;
  if (config.status === "not-configured") return `Supabase not configured: set ${config.missing.join(" and ")} (docs/SUPABASE_SETUP.md). The app keeps working locally.`;
  return `Supabase configuration invalid: ${config.problems.map((p) => p.message).join("; ")}`;
}

/**
 * Every NEXT_PUBLIC_ variable that holds something that looks privileged (used by the build
 * guard in next.config.ts). Returns variable NAMES only.
 */
export function findPrivilegedPublicVariables(env: Record<string, string | undefined>): string[] {
  return Object.entries(env)
    .filter(([name, value]) => name.startsWith("NEXT_PUBLIC_") && !blank(value))
    .filter(([, value]) => {
      const v = value!.trim();
      if (SECRET_PATTERN.test(v)) return true;
      if (JWT_PATTERN.test(v)) {
        const role = jwtRole(v);
        return role === "service_role" || role === "supabase_admin";
      }
      return false;
    })
    .map(([name]) => name)
    .sort();
}
