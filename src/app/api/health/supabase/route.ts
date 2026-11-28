import { checkSupabaseHealth, healthHttpStatus } from "@/lib/supabase/health";

/**
 * GET /api/health/supabase — controlled connection status (Step 12). Never cached (the service
 * worker skips /api/ too). Contains no key and no user data.
 */
export async function GET(): Promise<Response> {
  const health = await checkSupabaseHealth();
  return Response.json(health, {
    status: healthHttpStatus(health),
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
