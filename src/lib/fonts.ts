import localFont from "next/font/local";

/**
 * AUREON typography (docs/branding/TYPOGRAPHY.md). Fonts are self-hosted with next/font/local
 * (decision D3): the WOFF2 files (Latin subset, variable weight) live in src/styles/fonts, are
 * bundled at build time and never requested from Google Fonts or any other host.
 * Licence: SIL Open Font License 1.1 (src/styles/fonts/OFL-*.txt). Source: Fontsource 5.3.0.
 *
 * - Manrope: interface, body, forms, buttons, tables and every financial figure (tabular).
 * - Cormorant Garamond: editorial headings, page titles, the dashboard hero, brand statements.
 */
export const manrope = localFont({
  src: "../styles/fonts/Manrope-Variable.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-manrope",
  adjustFontFallback: "Arial",
});

export const cormorantGaramond = localFont({
  src: [
    { path: "../styles/fonts/CormorantGaramond-Variable.woff2", weight: "300 700", style: "normal" },
    { path: "../styles/fonts/CormorantGaramond-Italic-Variable.woff2", weight: "300 700", style: "italic" },
  ],
  display: "swap",
  preload: true,
  variable: "--font-cormorant-garamond",
  adjustFontFallback: "Times New Roman",
});
