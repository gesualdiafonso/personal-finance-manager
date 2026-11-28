import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 proxy (formerly middleware). Step 12: only keeps a Supabase session fresh when one
 * exists; otherwise it lets every request through unchanged. No redirects yet — the local login
 * remains the active protection until Step 14 (docs/SUPABASE_SETUP.md §Integración futura).
 */
export async function proxy(request: NextRequest) {
  const { response } = await updateSupabaseSession(request);
  return response;
}

export const config = {
  matcher: [
    // Pages only: skip Next.js assets, the service worker, PWA files, icons, fonts and images.
    "/((?!_next/static|_next/image|sw\\.js|manifest\\.webmanifest|icon\\.svg|icons/|brand/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|woff2?|ico)$).*)",
  ],
};
