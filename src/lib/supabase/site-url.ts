import { z } from "zod";

/**
 * Origin used to build the links in Supabase emails (verification, recovery) — Step 14.
 *
 * 1. `NEXT_PUBLIC_SITE_URL` when set (recommended in production; docs/ENVIRONMENT.md).
 * 2. Otherwise the request's own origin (Origin header, else forwarded proto + host).
 *
 * This is not a security boundary on its own: Supabase only sends links to URLs in the
 * project's "Redirect URLs" allow list (docs/SUPABASE_SETUP.md §Auth), anything else falls
 * back to the Site URL. So a forged Host header cannot send a user's link elsewhere.
 */
const originSchema = z.url({ protocol: /^https?$/ }).transform((u) => new URL(u).origin);

export function resolveSiteOrigin(headers: Pick<Headers, "get">, env: { NEXT_PUBLIC_SITE_URL?: string } = { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL }): string | null {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    const parsed = originSchema.safeParse(configured);
    if (parsed.success) return parsed.data;
  }
  const origin = headers.get("origin");
  if (origin) {
    const parsed = originSchema.safeParse(origin);
    if (parsed.success) return parsed.data;
  }
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return null;
  const proto = headers.get("x-forwarded-proto") === "http" || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}
