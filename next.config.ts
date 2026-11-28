import type { NextConfig } from "next";
import { findPrivilegedPublicVariables, parseSupabaseConfig } from "./src/lib/supabase/config";

// Build guard (Step 12): a privileged key in a NEXT_PUBLIC_ variable would be shipped to every
// browser. Fail the build, naming the variable only (never its value).
const privileged = findPrivilegedPublicVariables(process.env);
if (privileged.length > 0) {
  throw new Error(`Refusing to build: ${privileged.join(", ")} hold(s) a privileged Supabase key. Remove it from NEXT_PUBLIC_ variables and rotate it (docs/ENVIRONMENT.md).`);
}

/**
 * Content-Security-Policy for every page (production builds; `next dev` needs eval).
 * connect-src lists the only origins the browser may talk to: this app, the configured
 * Supabase project (https + wss for realtime) and the opt-in DolarApi quotations.
 * script-src keeps 'unsafe-inline' because static pages carry Next.js inline bootstrap scripts
 * and the theme script; a nonce-based policy needs dynamic rendering (planned, Step 20).
 */
function contentSecurityPolicy(): string {
  const supabase = parseSupabaseConfig();
  const connect = ["'self'", "https://dolarapi.com"];
  if (supabase.status === "configured") {
    const url = new URL(supabase.url);
    connect.push(url.origin, `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Next.js configuration. cacheComponents/partialPrefetching are the create-next-app 16.4
 * defaults and are kept: every page is a static shell; financial data is read on the client
 * from IndexedDB, never on the server.
 */
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy() }] : []),
        ],
      },
      {
        // The service worker must always be revalidated so a new build is picked up.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
