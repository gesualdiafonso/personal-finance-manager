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
    expect(css).toContain("--bg-paper: #161A17;");
  });

  it("closes the Tailwind palette (no default colours, shadows or fonts)", () => {
    const css = buildTokensCss(tokens);
    expect(css).toContain("--color-*: initial;");
    expect(css).toContain("--shadow-*: initial;");
    expect(css).toContain("--font-*: initial;");
  });

  it("maps the font families to next/font/local variables", () => {
    const css = buildTokensCss(tokens);
    expect(css).toContain("--pfm-font-sans: var(--font-instrument-sans)");
    expect(css).toContain("--pfm-font-serif: var(--font-instrument-serif)");
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
