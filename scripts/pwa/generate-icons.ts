/**
 * Renders the PWA PNG icons from the AUREON monogram (src/components/brand/aureon-paths.ts):
 * Heritage Gold mark with its shaded base on Aureon Forest (docs/branding/LOGO-SYSTEM.md).
 * Browsers that support it use src/app/icon.svg directly; these PNGs cover the rest.
 * Run manually: `npm run icons:build` (needs a Chromium: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
 * or `npx playwright install chromium`). The PNGs are committed.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AUREON_BASE, AUREON_MARK } from "../../src/components/brand/aureon-paths";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(root, "public/icons");
mkdirSync(out, { recursive: true });

const icons = [
  { file: "icon-192.png", size: 192, scale: 0.7 },
  { file: "icon-512.png", size: 512, scale: 0.7 },
  { file: "apple-touch-icon.png", size: 180, scale: 0.66 },
  // Maskable: content kept inside the 80% safe zone.
  { file: "icon-maskable-512.png", size: 512, scale: 0.56 },
];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
for (const icon of icons) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
  const offset = (64 - 64 * icon.scale) / 2;
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; width: ${icon.size}px; height: ${icon.size}px; background: #17251F; }
    svg { display: block; }
  </style></head><body><svg viewBox="0 0 64 64" width="${icon.size}" height="${icon.size}">
    <g transform="translate(${offset} ${offset}) scale(${icon.scale})"><path d="${AUREON_BASE}" fill="#6B5736"/><path d="${AUREON_MARK}" fill="#B99A60"/></g>
  </svg></body></html>`);
  await page.screenshot({ path: resolve(out, icon.file) });
  await page.close();
}
await browser.close();
console.log(`Icons written to ${out}`);
