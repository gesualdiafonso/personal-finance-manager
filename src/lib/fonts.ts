import localFont from "next/font/local";

/**
 * Fonts are self-hosted with next/font/local (decision D3): the WOFF2 files live in
 * src/styles/fonts, are bundled at build time and never requested from Google Fonts.
 * Licence: SIL Open Font License 1.1 (src/styles/fonts/OFL-*.txt).
 */
export const instrumentSans = localFont({
  src: "../styles/fonts/InstrumentSans-Variable.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-instrument-sans",
  adjustFontFallback: "Arial",
});

export const instrumentSerif = localFont({
  src: "../styles/fonts/InstrumentSerif-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-instrument-serif",
  adjustFontFallback: "Times New Roman",
});
