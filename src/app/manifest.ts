import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/lib/config/app";
import { es } from "@/lib/i18n/es";

/**
 * Web app manifest, served at /manifest.webmanifest (Next.js metadata route; Step 01
 * suggested public/manifest.json — see docs/architecture/pwa.md for the deviation).
 * Icons: the AUREON monogram, gold on Aureon Forest (docs/branding/LOGO-SYSTEM.md).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_CONFIG.fullName,
    short_name: es.app.name,
    description: es.app.description,
    lang: APP_CONFIG.locale,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F4F0E7",
    theme_color: "#17251F",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: es.nav.newTransaction, url: "/transacciones" },
      { name: es.nav.areas.bills, url: "/cuentas-domesticas" },
      { name: es.nav.areas.cards, url: "/tarjetas" },
    ],
  };
}
