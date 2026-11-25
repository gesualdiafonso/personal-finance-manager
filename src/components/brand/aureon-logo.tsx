import { useId } from "react";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import {
  AUREON_BASE,
  AUREON_DESCRIPTOR,
  AUREON_DESCRIPTOR_WIDTH,
  AUREON_MARK,
  AUREON_WORDMARK,
  AUREON_WORDMARK_WIDTH,
} from "./aureon-paths";

/**
 * Colour versions of the logo (docs/branding/LOGO-SYSTEM.md). The monogram has two colours:
 * the mark (wings and A) and the base between the legs, a darker shade of it.
 * - theme: follows the active theme through tokens (Forest mark with gold base on Ivory; gold
 *   mark with shaded base on Deep Forest) — the default inside the app;
 * - light / dark: fixed colours for a light or dark background;
 * - gold: gold mark with shaded base and Forest wordmark (gold-accent version);
 * - mono: one colour (currentColor), the base at 55 % opacity.
 */
export type LogoTone = "theme" | "light" | "dark" | "gold" | "mono";

const PALETTE: Record<
  LogoTone,
  {
    mark: string;
    base: string;
    baseOpacity?: number;
    word: string;
    descriptor: string;
  }
> = {
  theme: {
    mark: "var(--brand-mark)",
    base: "var(--brand-base)",
    word: "var(--brand-word)",
    descriptor: "var(--ink-2)",
  },
  light: {
    mark: "#17251F",
    base: "#56635C",
    word: "#252923",
    descriptor: "#5D6058",
  },
  dark: {
    mark: "#B99A60",
    base: "#6B5736",
    word: "#F4F0E7",
    descriptor: "#AAA69B",
  },
  gold: {
    mark: "#B99A60",
    base: "#6B5736",
    word: "#17251F",
    descriptor: "#7A6233",
  },
  mono: {
    mark: "currentColor",
    base: "currentColor",
    baseOpacity: 0.55,
    word: "currentColor",
    descriptor: "currentColor",
  },
};

function Mark({ tone }: { tone: LogoTone }) {
  const c = PALETTE[tone];
  return (
    <>
      <path d={AUREON_BASE} fill={c.base} fillOpacity={c.baseOpacity} />
      <path d={AUREON_MARK} fill={c.mark} />
    </>
  );
}

/** The standalone A monogram. Decorative unless `label` is given. */
export function AureonMonogram({
  tone = "theme",
  className,
  label,
}: {
  tone?: LogoTone;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <Mark tone={tone} />
    </svg>
  );
}

/**
 * Primary horizontal logo: monogram + AUREON wordmark, with the optional institutional
 * descriptor ("FINANCIAL INTELLIGENCE"). Scales with its height (set it with className).
 */
export function AureonLogo({
  tone = "theme",
  descriptor = false,
  className,
}: {
  tone?: LogoTone;
  descriptor?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const c = PALETTE[tone];
  const wordX = 80;
  const width =
    wordX +
    Math.max(AUREON_WORDMARK_WIDTH, descriptor ? AUREON_DESCRIPTOR_WIDTH : 0);
  const wordY = descriptor ? 18 : 19.5;
  return (
    <svg
      viewBox={`0 0 ${width.toFixed(2)} 64`}
      className={cn("shrink-0", className)}
      role="img"
      aria-labelledby={titleId}
      focusable="false"
    >
      <title id={titleId}>{es.app.name}</title>
      <Mark tone={tone} />
      <path
        transform={`translate(${wordX} ${wordY})`}
        d={AUREON_WORDMARK}
        fill={c.word}
      />
      {descriptor && (
        <path
          transform={`translate(${wordX + 1} ${wordY + 34.5})`}
          d={AUREON_DESCRIPTOR}
          fill={c.descriptor}
        />
      )}
    </svg>
  );
}
