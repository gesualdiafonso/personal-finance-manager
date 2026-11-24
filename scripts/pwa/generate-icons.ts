/**
 * Renders the PROVISIONAL PWA icons: the PFM wordmark (Instrument Serif, ink) on paper,
 * as the Design System prescribes while there is no logo (docs/design-system/README.md §6).
 * Run manually: `npm run icons:build` (needs a Chromium: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
 * or `npx playwright install chromium`). The PNGs are committed.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const font = readFileSync(resolve(root, "src/styles/fonts/InstrumentSerif-Regular.woff2")).toString("base64");
const out = resolve(root, "public/icons");
mkdirSync(out, { recursive: true });

const icons = [
  { file: "icon-192.png", size: 192, scale: 0.36 },
  { file: "icon-512.png", size: 512, scale: 0.36 },
  { file: "apple-touch-icon.png", size: 180, scale: 0.36 },
  // Maskable: content kept inside the 80% safe zone.
  { file: "icon-maskable-512.png", size: 512, scale: 0.28 },
];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
for (const icon of icons) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: "Instrument Serif"; src: url(data:font/woff2;base64,${font}) format("woff2"); }
    html, body { margin: 0; width: ${icon.size}px; height: ${icon.size}px; background: #F5F3ED; }
    body { display: grid; place-items: center; }
    span { font-family: "Instrument Serif"; font-size: ${Math.round(icon.size * icon.scale)}px; color: #202622; letter-spacing: -0.02em; line-height: 1; }
  </style></head><body><span>PFM</span></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(out, icon.file) });
  await page.close();
}
await browser.close();
console.log(`Icons written to ${out}`);
