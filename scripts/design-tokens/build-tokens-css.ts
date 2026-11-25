/**
 * Generates src/styles/tokens.css from the approved Design System tokens
 * (docs/design-system/tokens.json). The JSON file is the single source of truth:
 * never edit tokens.css by hand. `npm run tokens:check` fails when they drift.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

type ThemedValue = string | Record<string, string>;
interface Token {
  name: string;
  value: ThemedValue;
  usage?: string;
}
interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  letterSpacing?: string;
}
interface Tokens {
  color: { themes: { id: string; name: string }[]; tokens: Token[] };
  type: {
    families: Record<string, string>;
    groups: { name: string; family: string; styles: TypeStyle[] }[];
  };
  spacing: { tokens: Token[] };
  radius: { tokens: Token[] };
  shadow: { tokens: Token[] };
  layout: { tokens: Token[] };
  breakpoint: { tokens: Token[] };
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const TOKENS_PATH = resolve(root, "docs/design-system/tokens.json");
export const CSS_PATH = resolve(root, "src/styles/tokens.css");

/** next/font/local exposes these variables; the Design System names the families. */
const FONT_VARIABLES: Record<string, string> = {
  Manrope: "var(--font-manrope)",
  "Cormorant Garamond": "var(--font-cormorant-garamond)",
};

function resolveValue(value: ThemedValue, theme: string, firstTheme: string): string {
  const raw = typeof value === "string" ? value : (value[theme] ?? value[firstTheme] ?? "");
  const alias = /^\{(.+)\}$/.exec(raw);
  return alias ? `var(--${alias[1]})` : raw;
}

function stack(family: string): string {
  return family.replace(/"([^"]+)"/g, (whole, name: string) => FONT_VARIABLES[name] ?? whole);
}

/** Tailwind colour names: bg-paper, text-ink, border-line… (bg- prefix dropped). */
function colorUtilityName(token: string): string {
  return token.replace(/^bg-/, "");
}

export function buildTokensCss(tokens: Tokens): string {
  const themes = tokens.color.themes.map((t) => t.id);
  const first = themes[0];
  if (!first) throw new Error("tokens.json has no colour themes");
  const out: string[] = [];
  out.push("/* AUREON — generated from docs/design-system/tokens.json. Do not edit by hand. */");
  out.push("/* Regenerate with `npm run tokens:build`; `npm run tokens:check` fails on drift. */", "");

  themes.forEach((theme, index) => {
    const selector = index === 0 ? `:root,\n[data-theme="${theme}"]` : `[data-theme="${theme}"]`;
    out.push(`${selector} {`);
    out.push(`  color-scheme: ${theme === "dark" ? "dark" : "light"};`);
    for (const t of [...tokens.color.tokens, ...tokens.shadow.tokens]) {
      out.push(`  --${t.name}: ${resolveValue(t.value, theme, first)};`);
    }
    out.push("}", "");
  });

  out.push(":root {");
  for (const t of [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.layout.tokens, ...tokens.breakpoint.tokens]) {
    out.push(`  --${t.name}: ${resolveValue(t.value, first, first)};`);
  }
  for (const [key, family] of Object.entries(tokens.type.families)) out.push(`  --pfm-font-${key}: ${stack(family)};`);
  out.push("}", "");

  // Close the Tailwind theme: only Design System values exist (rules P-04, P-15).
  out.push("@theme {");
  for (const ns of ["color", "shadow", "radius", "font", "text", "breakpoint", "container", "inset-shadow", "drop-shadow", "text-shadow", "blur"]) {
    out.push(`  --${ns}-*: initial;`);
  }
  out.push("  --font-weight-*: initial;");
  out.push("  --font-weight-normal: 400;");
  out.push("  --font-weight-medium: 500;");
  out.push("  --font-weight-semibold: 600;");
  out.push("  --spacing: 4px; /* base 4px: p-1=4 … p-24=96 (space-1 … space-9) */");
  for (const t of tokens.breakpoint.tokens) {
    out.push(`  --breakpoint-${t.name.replace(/^bp-/, "")}: ${resolveValue(t.value, first, first)};`);
  }
  out.push("}", "");

  out.push("@theme inline {");
  for (const t of tokens.color.tokens) out.push(`  --color-${colorUtilityName(t.name)}: var(--${t.name});`);
  for (const t of tokens.radius.tokens) out.push(`  --radius-${t.name.replace(/^radius-/, "")}: var(--${t.name});`);
  for (const t of tokens.shadow.tokens) out.push(`  --shadow-${t.name.replace(/^shadow-/, "")}: var(--${t.name});`);
  for (const key of Object.keys(tokens.type.families)) out.push(`  --font-${key}: var(--pfm-font-${key});`);
  out.push("}", "");

  for (const group of tokens.type.groups) {
    for (const s of group.styles) {
      out.push(`@utility type-${s.name} {`);
      out.push(`  font-family: var(--pfm-font-${group.family});`);
      out.push(`  font-size: ${s.fontSize};`);
      out.push(`  line-height: ${s.lineHeight};`);
      out.push(`  font-weight: ${s.fontWeight};`);
      if (s.letterSpacing) out.push(`  letter-spacing: ${s.letterSpacing};`);
      if (s.name === "label") out.push("  text-transform: uppercase;");
      if (group.name === "Numbers") {
        out.push("  font-variant-numeric: tabular-nums lining-nums;");
        out.push('  font-feature-settings: "tnum" 1, "lnum" 1;');
      }
      out.push("}", "");
    }
  }
  return out.join("\n");
}

function main(): void {
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf8")) as Tokens;
  const css = buildTokensCss(tokens);
  if (process.argv.includes("--check")) {
    const current = readFileSync(CSS_PATH, "utf8");
    if (current !== css) {
      console.error("src/styles/tokens.css is out of date. Run `npm run tokens:build`.");
      process.exit(1);
    }
    console.log("tokens.css matches tokens.json");
    return;
  }
  writeFileSync(CSS_PATH, css);
  console.log(`Wrote ${CSS_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
