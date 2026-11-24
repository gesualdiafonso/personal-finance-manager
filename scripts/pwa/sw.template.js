/* PFM service worker — GENERATED from scripts/pwa/sw.template.js by scripts/pwa/build-sw.ts.
 * Do not edit public/sw.js by hand.
 *
 * Groundwork scope (Step 01, Task 06) — see docs/architecture/pwa.md:
 * - precaches the app shell (/, /offline, manifest, icons) and the hashed static assets those
 *   pages reference, including the two local WOFF2 fonts;
 * - static assets: cache first; pages: network first, cached copy or /offline when offline;
 * - caches are versioned per build and old versions are deleted on activate.
 * It never caches /data/ (future encrypted publication has its own strategy) and HTML
 * never contains financial data (that lives in IndexedDB), so caching pages is safe.
 */
const VERSION = "__PFM_SW_VERSION__";
const SHELL_CACHE = `pfm-shell-${VERSION}`;
const STATIC_CACHE = `pfm-static-${VERSION}`;
/**
 * Detail pages (/cuentas/<id>, /tarjetas/<id>) are the same client shell for every id: the id
 * is read from the address bar and the data from IndexedDB. One shell per area is precached
 * under a placeholder id, so any account or card opens offline, visited or not (Step 03).
 */
const DETAIL_SHELLS = [
  [/^\/cuentas\/[^/]+$/, "/cuentas/_"],
  [/^\/tarjetas\/[^/]+$/, "/tarjetas/_"],
];
const SHELL_URLS = ["/", "/offline", "/cuentas/_", "/tarjetas/_", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];
const ASSET_PATTERN = /\/_next\/static\/[^"'\s)<>]+/g;

async function precache() {
  const shell = await caches.open(SHELL_CACHE);
  const assets = new Set();
  for (const url of SHELL_URLS) {
    const response = await fetch(new Request(url, { cache: "reload" }));
    if (!response.ok) throw new Error(`Precache failed for ${url}: ${response.status}`);
    if ((response.headers.get("content-type") || "").includes("text/html")) {
      const html = await response.clone().text();
      for (const match of html.matchAll(ASSET_PATTERN)) assets.add(match[0].replace(/\\+$/, ""));
    }
    await shell.put(url, response);
  }
  // Each asset on its own: a URL scraped from an inline payload that does not resolve must
  // not abort the install. The shell pages above are mandatory; assets are best effort.
  const statics = await caches.open(STATIC_CACHE);
  await Promise.allSettled([...assets].map((url) => statics.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith("pfm-") && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Lets the page ask a waiting worker to take over (used by the future "Nueva versión" prompt). */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC_CACHE)).put(request, response.clone());
  return response;
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok && (response.headers.get("content-type") || "").includes("text/html")) {
      (await caches.open(SHELL_CACHE)).put(request, response.clone());
    }
    return response;
  } catch {
    const path = new URL(request.url).pathname;
    const shell = DETAIL_SHELLS.find(([pattern]) => pattern.test(path));
    return (
      (await caches.match(request, { ignoreSearch: true })) ||
      (shell && (await caches.match(shell[1]))) ||
      (await caches.match("/offline")) ||
      new Response("Sin conexión", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) (await caches.open(SHELL_CACHE)).put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/data/")) return; // never cached here
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(request));
  }
});
