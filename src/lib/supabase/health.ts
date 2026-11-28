import { describeSupabaseConfig, parseSupabaseConfig, type SupabaseConfig } from "./config";

/**
 * Supabase connection health check (Step 12). Calls the Auth service's public health endpoint
 * (`/auth/v1/health`) with the publishable key — it touches no table (none exist yet) and no
 * user data. Every outcome is real: there is no simulated success.
 *
 * The result never contains the key; only the project host.
 */
export type SupabaseHealth =
  | { status: "not-configured"; message: string; checkedAt: string }
  | { status: "invalid-config"; message: string; problems: string[]; checkedAt: string }
  | { status: "unreachable"; message: string; host: string; reason: "timeout" | "network"; checkedAt: string }
  | { status: "error"; message: string; host: string; httpStatus: number; checkedAt: string }
  | { status: "ok"; message: string; host: string; latencyMs: number; service: string | null; checkedAt: string };

export interface HealthOptions {
  config?: SupabaseConfig;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

export const HEALTH_PATH = "/auth/v1/health";

export async function checkSupabaseHealth(options: HealthOptions = {}): Promise<SupabaseHealth> {
  const config = options.config ?? parseSupabaseConfig();
  const now = options.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  if (config.status === "not-configured") return { status: "not-configured", message: describeSupabaseConfig(config), checkedAt };
  if (config.status === "invalid") {
    return { status: "invalid-config", message: "Supabase configuration is invalid", problems: config.problems.map((p) => p.message), checkedAt };
  }
  const host = new URL(config.url).host;
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  const started = Date.now();
  try {
    const res = await doFetch(`${config.url}${HEALTH_PATH}`, {
      method: "GET",
      headers: { apikey: config.publishableKey, accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? " (check the publishable key)" : "";
      return { status: "error", message: `Supabase answered HTTP ${res.status}${hint}`, host, httpStatus: res.status, checkedAt };
    }
    let service: string | null = null;
    try {
      const body = (await res.json()) as { name?: unknown };
      service = typeof body.name === "string" ? body.name.slice(0, 40) : null;
    } catch {
      service = null;
    }
    return { status: "ok", message: "Supabase is reachable", host, latencyMs, service, checkedAt };
  } catch (error) {
    const timeout = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
    return { status: "unreachable", message: timeout ? "Supabase did not answer in time" : "Supabase could not be reached (network error)", host, reason: timeout ? "timeout" : "network", checkedAt };
  } finally {
    clearTimeout(timer);
  }
}

/** HTTP status for the health route: 200 only when Supabase answered correctly. */
export function healthHttpStatus(health: SupabaseHealth): number {
  return health.status === "ok" ? 200 : 503;
}
