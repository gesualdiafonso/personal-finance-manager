import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildTokensCss } from "../../scripts/design-tokens/build-tokens-css";
import { Money } from "@/components/shared/money";
import { APP_CONFIG } from "@/lib/config/app";

const root = resolve(__dirname, "../..");
const tokens = JSON.parse(readFileSync(resolve(root, "docs/design-system/tokens.json"), "utf8"));

describe("Design System integration", () => {
  it("tokens.css is exactly what tokens.json generates (no drift)", () => {
    expect(readFileSync(resolve(root, "src/styles/tokens.css"), "utf8")).toBe(buildTokensCss(tokens));
  });

  it("defines both themes with every colour token", () => {
    const css = buildTokensCss(tokens);
    for (const t of tokens.color.tokens as { name: string }[]) {
      expect(css.match(new RegExp(`--${t.name}:`, "g"))?.length).toBe(2);
    }
    expect(css).toContain('[data-theme="dark"]');
    // AUREON: Ivory Paper (light) and Deep Forest (dark) backgrounds.
    expect(css).toContain("--bg-paper: #F4F0E7;");
    expect(css).toContain("--bg-paper: #0E1612;");
  });

  it("carries the AUREON brand palette (docs/branding/COLOR-SYSTEM.md)", () => {
    const value = (name: string) => (tokens.color.tokens as { name: string; value: Record<string, string> }[]).find((t) => t.name === name)!.value;
    expect(value("forest").paper).toBe("#17251F"); // Aureon Forest
    expect(value("gold").paper).toBe("#B99A60"); // Heritage Gold
    expect(value("bg-paper").paper).toBe("#F4F0E7"); // Ivory Paper
    expect(value("stone").paper).toBe("#AAA69B"); // Stone Grey
    expect(value("ink").paper).toBe("#252923"); // Deep Charcoal
    expect(value("sage").paper).toBe("#899585"); // Sage
    // Financial semantics stay distinct from the brand gold.
    for (const semantic of ["income", "expense", "warning", "alert", "lake"]) expect(value(semantic).paper).not.toBe(value("gold").paper);
  });

  it("closes the Tailwind palette (no default colours, shadows or fonts)", () => {
    const css = buildTokensCss(tokens);
    expect(css).toContain("--color-*: initial;");
    expect(css).toContain("--shadow-*: initial;");
    expect(css).toContain("--font-*: initial;");
  });

  it("maps the font families to next/font/local variables", () => {
    const css = buildTokensCss(tokens);
    expect(css).toContain("--pfm-font-sans: var(--font-manrope)");
    expect(css).toContain("--pfm-font-serif: var(--font-cormorant-garamond)");
  });
});

describe("<Money>", () => {
  it("renders tabular numerals with cents in ink-2 and an accessible label", () => {
    const { container } = render(<Money amount={-4830000} />);
    const root = container.firstElementChild!;
    expect(root).toHaveClass("num");
    expect(root).toHaveAttribute("aria-label", "−$ 48.300,00");
    expect(container.querySelector(".text-ink-2")?.textContent).toBe(",00");
  });

  it("uses alert-text only when the value needs attention", () => {
    const { container } = render(<Money amount={2140000} attention />);
    expect(container.firstElementChild).toHaveClass("text-alert-text");
  });
});

describe("application configuration", () => {
  it("is ARS, es-AR, Buenos Aires, single-user", () => {
    expect(APP_CONFIG).toMatchObject({
      currency: "ARS",
      locale: "es-AR",
      minorUnitDigits: 2,
      timeZone: "America/Argentina/Buenos_Aires",
      userModel: "single-user",
    });
  });
});
