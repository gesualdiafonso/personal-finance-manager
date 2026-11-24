import type { NextConfig } from "next";

/**
 * Next.js configuration. cacheComponents/partialPrefetching are the create-next-app 16.4
 * defaults and are kept: every page is a static shell; financial data is read on the client
 * from IndexedDB, never on the server.
 */
/**
 * Content Security Policy (production only: `next dev` needs eval and a websocket).
 * The point for a finance app: connect-src 'self' — the page can never send data to another
 * host, even if a dependency tried — and no script, font, style or frame from elsewhere.
 * 'unsafe-inline' for scripts is required by the static, prerendered shell (Next.js inline
 * bootstrap and the theme script before first paint; nonces would force dynamic rendering).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const isProduction = process.env.NODE_ENV === "production";

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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(isProduction
            ? [
                { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
                // Only honoured over HTTPS (production hosting); ignored on http://localhost.
                { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
              ]
            : []),
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
