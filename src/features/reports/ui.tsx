import type { ReactNode } from "react";
import type { CurrencyCode } from "@/domain/currency";
import type { Delta } from "@/domain/rules/reports";
import { formatMoney } from "@/lib/formatting/money";
import { APP_CONFIG } from "@/lib/config/app";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";

const t = es.reports;

const shareFormat = new Intl.NumberFormat(APP_CONFIG.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Basis points (0–10 000) → "12,5 %". */
export const formatShare = (basisPoints: number) => `${shareFormat.format(basisPoints / 100)} %`;

export const moneyFormatter = (currency: CurrencyCode) => (n: number) => formatMoney(n, { currency, cents: "auto" });

/**
 * A change against the comparison range: the amount with an explicit sign and the percentage.
 * Neutral ink-2 (rule P-16: no green/red for ordinary income and expenses). Without previous
 * data the percentage is replaced by "sin datos para comparar" (never "+100 %").
 */
export function DeltaText({ delta, currency, className }: { delta: Delta; currency: CurrencyCode; className?: string }) {
  const amount = formatMoney(delta.amount, { currency, cents: "auto", sign: "explicit" });
  const pct =
    delta.percent === null ? t.common.noComparison : `${delta.percent > 0 ? "+" : delta.percent < 0 ? "−" : ""}${Math.abs(delta.percent)} %`;
  return (
    <span className={cn("num type-caption text-ink-2", className)} data-testid="delta">
      {delta.amount === 0 && delta.percent === 0 ? "=" : `${amount} · ${pct}`}
    </span>
  );
}

export function SectionTitle({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
      <h2 id={id} className="type-label text-ink-2">
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function Note({ children, tone = "neutral", testId }: { children: ReactNode; tone?: "neutral" | "warning"; testId?: string }) {
  return (
    <p className={cn("mt-2 max-w-[70ch] type-caption", tone === "warning" ? "text-warning-text" : "text-ink-2")} data-testid={testId}>
      {children}
    </p>
  );
}

/** A statement line: term on the left, amount on the right, hairline below. */
export function StatementLine({ term, children, total = false, testId }: { term: ReactNode; children: ReactNode; total?: boolean; testId?: string }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2",
        total ? "border-t-[3px] border-double border-line-strong" : "border-b border-line",
      )}
      data-testid={testId}
    >
      <dt className={cn("type-body", !total && "text-ink-2")}>{term}</dt>
      <dd className={total ? "type-amount-xl" : "type-amount"}>{children}</dd>
    </div>
  );
}

export interface Column {
  label: string;
  align?: "left" | "right";
}

/**
 * Support table under a chart (arquitetura.md "Análise"). Desktop and tablet: a table without
 * vertical borders, header in `label`. iPhone: a list, the first cell as the title and the
 * others as label/value pairs (rule O-12: tables become lists on the phone).
 */
export function ResponsiveTable({
  columns,
  rows,
  caption,
  testId,
}: {
  columns: Column[];
  rows: { id: string; cells: ReactNode[] }[];
  caption: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <table className="hidden w-full border-collapse tablet:table print:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c, i) => (
              <th key={i} scope="col" className={cn("py-2 type-label text-ink-2", c.align === "right" ? "pl-3 text-right" : "pr-3 text-left")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-b-0">
              {r.cells.map((cell, i) => (
                <td key={i} className={cn("py-2.5 align-baseline type-body", columns[i]?.align === "right" ? "pl-3 text-right" : "pr-3")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="tablet:hidden print:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={r.id} className="border-b border-line py-2.5 last:border-b-0">
            <div className="type-body">{r.cells[0]}</div>
            <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5">
              {r.cells.slice(1).map((cell, i) => (
                <div key={i} className="contents">
                  <dt className="type-caption text-ink-2">{columns[i + 1]?.label}</dt>
                  <dd className="text-right type-body-sm">{cell}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
