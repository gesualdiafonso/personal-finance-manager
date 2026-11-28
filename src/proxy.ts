import type { NextRequest } from "next/server";
import { protectRequest } from "@/lib/supabase/proxy";

/**
 * Next.js 16 proxy (formerly middleware).
 * - Supabase not configured: every request goes through unchanged (local mode, Step 10 login).
 * - Supabase configured (Step 14): the session is refreshed and every non-public page requires a
 *   verified Supabase session — otherwise a server-side redirect to /entrar (D-SB-03).
 */
export async function proxy(request: NextRequest) {
  return protectRequest(request);
}

export const config = {
  matcher: [
    // Pages only: skip Next.js assets, the service worker, PWA files, icons, fonts and images.
    "/((?!_next/static|_next/image|sw\\.js|manifest\\.webmanifest|icon\\.svg|icons/|brand/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|woff2?|ico)$).*)",
  ],
};
