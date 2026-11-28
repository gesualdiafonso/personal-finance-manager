import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, RESET_PATH, safeNext } from "@/features/auth/paths";
import { completeEmailLink, isRecentRecoverySession } from "@/lib/supabase/auth-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm — target of the Supabase email links (Step 14).
 * Verification: ?token_hash=…&type=email|signup → session opened (HttpOnly cookies) → the app.
 * Recovery:     ?token_hash=…&type=recovery → recovery session → /restablecer.
 * PKCE links (?code=…) are exchanged too. Tokens are used once on the server and never logged;
 * a failed link sends to /entrar with a neutral message.
 */
function redirectTo(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const client = await createSupabaseServerClient();
  if (!client) return redirectTo(request, LOGIN_PATH);
  const result = await completeEmailLink(client, { tokenHash: params.get("token_hash"), type: params.get("type"), code: params.get("code") });
  if (!result.ok) return redirectTo(request, `${LOGIN_PATH}?motivo=enlace-invalido`);
  // A PKCE link does not say its type: a recovery session is recognised by its `amr` claim.
  if (result.type === "recovery" || (result.type === "pkce" && (await isRecentRecoverySession(client)))) return redirectTo(request, RESET_PATH);
  const next = safeNext(params.get("next"));
  return redirectTo(request, `${next}${next.includes("?") ? "&" : "?"}verificado=1`);
}
