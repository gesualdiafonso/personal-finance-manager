import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const FORBIDDEN_IMPORTS = [
  { name: "next/font/google", message: "Fonts are self-hosted with next/font/local (D3, rule P-23)." },
  { name: "@supabase/supabase-js", message: "No database or remote persistence (ADR-001, rule P-21)." },
  { name: "firebase", message: "No database or remote persistence (ADR-001, rule P-21)." },
  { name: "@prisma/client", message: "No database or ORM (ADR-001, rule P-21)." },
  { name: "drizzle-orm", message: "No database or ORM (ADR-001, rule P-21)." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": ["error", { paths: FORBIDDEN_IMPORTS, patterns: [{ group: ["@supabase/*", "@prisma/*", "@firebase/*"], message: "No database (ADR-001)." }] }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  {
    // CLI scripts report to the terminal.
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "public/sw.js",
    "docs/design-system/**",
  ]),
]);

export default eslintConfig;
