import { checkSession } from "@/lib/supabase/auth-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/session — the session state for the client (Step 14). Answers WHO is signed in
 * (id, email, verified, display name) and never any token: the tokens stay in HttpOnly cookies.
 * 200 authenticated · 401 anonymous · 503 Auth server unreachable · 404 Supabase not configured.
 * Never cached (no-store; the service worker skips /api/).
 */
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(): Promise<Response> {
  const client = await createSupabaseServerClient();
  if (!client) return Response.json({ state: "not-configured" }, { status: 404, headers: HEADERS });
  const check = await checkSession(client);
  if (check.state === "authenticated") return Response.json(check, { status: 200, headers: HEADERS });
  return Response.json({ state: check.state }, { status: check.state === "anonymous" ? 401 : 503, headers: HEADERS });
}
