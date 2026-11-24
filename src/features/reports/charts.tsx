"use client";

import { cloneElement, createContext, useContext, type ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BucketUnit, DateRange } from "@/domain/rules/reports";
import {
  formatDate,
  formatMonthTitle,
  type LocalDate,
} from "@/lib/formatting/date";
import { cn } from "@/lib/utils/cn";

/**
 * Report charts (Recharts, already a dependency). Colours are Design System tokens only:
 * forest = main series, sage = second series, chart-muted = context / comparison, ink-2 =
 * balance line, alert = over the limit (cores.md "Dados"). Every chart has a legend and the
 * same numbers in a table for screen readers; the chart itself is aria-hidden.
 * No donut or pie charts (rule P-10): category distribution is a ranked bar list.
 */

/**
 * True while the report is rendered for printing / PDF. ResponsiveContainer measures the screen
 * and does not re-measure for the printed page, so printed charts get a fixed size that fits
 * an A4 page with its margins (≈ 182 mm ≈ 680 CSS px).
 */
export const PrintModeContext = createContext(false);
const PRINT_WIDTH = 680;

function Frame({ height, children }: { height: number; children: ReactElement<{ width?: number; height?: number }> }) {
  const printing = useContext(PrintModeContext);
  if (printing) return cloneElement(children, { width: PRINT_WIDTH, height });
  return (
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  );
}

export type SeriesColor = "forest" | "sage" | "muted" | "ink";
const STROKE: Record<SeriesColor, string> = {
  forest: "var(--forest)",
  sage: "var(--sage)",
  muted: "var(--chart-muted)",
  ink: "var(--ink-2)",
};
const SWATCH: Record<SeriesColor, string> = {
  forest: "bg-forest",
  sage: "bg-sage",
  muted: "bg-chart-muted",
  ink: "bg-ink-2",
};

export interface Series<K extends string> {
  key: K;
  name: string;
  kind: "bar" | "line";
  color: SeriesColor;
  /** Lines may use their own scale (a balance next to flows). */
  axis?: "main" | "side";
  dashed?: boolean;
}

/** Short axis label of a bucket. */
export function bucketLabel(b: DateRange, unit: BucketUnit, multiYear = false): string {
  if (unit === "day") return String(Number(b.from.slice(8, 10)));
  if (unit === "week") return formatDate(b.from as LocalDate);
  const month = formatMonthTitle(b.from as LocalDate).slice(0, 3);
  return multiYear ? `${month} ${b.from.slice(2, 4)}` : month;
}

/** Full bucket name for tooltips and tables. */
export function bucketTitle(b: DateRange, unit: BucketUnit): string {
  if (unit === "day" || b.from === b.to) return formatDate(b.from as LocalDate, "long");
  if (unit === "month" && b.from.endsWith("-01"))
    return `${formatMonthTitle(b.from as LocalDate)} ${b.from.slice(0, 4)}`;
  return `${formatDate(b.from as LocalDate)} – ${formatDate(b.to as LocalDate)}`;
}

export function ReportChart<K extends string>({
  rows,
  unit,
  series,
  format,
  caption,
  testId,
  tall = false,
}: {
  rows: (DateRange & Record<K, number | null>)[];
  unit: BucketUnit;
  series: Series<K>[];
  format: (value: number) => string;
  caption: string;
  testId?: string;
  tall?: boolean;
}) {
  const multiYear = rows.length > 0 && rows[0]!.from.slice(0, 4) !== rows[rows.length - 1]!.from.slice(0, 4);
  const data = rows.map((r) => ({ ...r, label: bucketLabel(r, unit, multiYear) }));
  const hasSide = series.some((s) => s.axis === "side");
  return (
    <figure className="m-0 break-inside-avoid" data-testid={testId}>
      <div className={cn("w-full", tall ? "h-64 desktop:h-80" : "h-56 desktop:h-64")} aria-hidden="true">
        <Frame height={tall ? 256 : 224}>
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={8}
              tick={{ fill: "var(--ink-2)", fontSize: 12 }}
            />
            <YAxis yAxisId="main" hide />
            {hasSide && <YAxis yAxisId="side" hide orientation="right" />}
            <Tooltip
              cursor={{ fill: "var(--bg-paper-2)" }}
              contentStyle={{
                background: "var(--bg-surface)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--ink)",
              }}
              formatter={(value, name) => [value === null ? "—" : format(Number(value)), String(name)]}
              labelFormatter={(_, payload) => {
                const b = payload?.[0]?.payload as DateRange | undefined;
                return b ? bucketTitle(b, unit) : "";
              }}
            />
            {series.map((s) =>
              s.kind === "bar" ? (
                <Bar
                  key={s.key}
                  yAxisId={s.axis ?? "main"}
                  dataKey={s.key}
                  name={s.name}
                  fill={STROKE[s.color]}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={18}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={s.key}
                  yAxisId={s.axis ?? "main"}
                  dataKey={s.key}
                  name={s.name}
                  stroke={STROKE[s.color]}
                  strokeWidth={s.dashed ? 1.5 : 2}
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </Frame>
      </div>
      <Legend series={series} />
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Tramo</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.from}>
                <th scope="row">{bucketTitle(r, unit)}</th>
                {series.map((s) => (
                  <td key={s.key}>{r[s.key] === null ? "—" : format(r[s.key] as number)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export function Legend<K extends string>({ series }: { series: Pick<Series<K>, "key" | "name" | "kind" | "color" | "dashed">[] }) {
  return (
    <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 type-caption text-ink-2">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          {s.kind === "bar" ? (
            <span aria-hidden="true" className={cn("size-2.5 rounded-xs", SWATCH[s.color])} />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "h-0 w-4 border-t-2",
                s.dashed ? "border-dashed" : "border-solid",
                s.color === "forest" ? "border-forest" : s.color === "sage" ? "border-sage" : "border-ink-2",
              )}
            />
          )}
          {s.name}
        </span>
      ))}
    </figcaption>
  );
}

/**
 * Budgeted vs used, one pair of horizontal bars per budget. The used bar is forest inside the
 * limit, warning near it and alert over it (the same states as the Budget area).
 */
export function BudgetBars({
  rows,
  format,
  labels,
  caption,
}: {
  rows: { id: string; name: string; budgeted: number; spent: number; tone: "forest" | "warning" | "alert" }[];
  format: (value: number) => string;
  labels: { budgeted: string; spent: string };
  caption: string;
}) {
  const fill = { forest: "var(--forest)", warning: "var(--warning)", alert: "var(--alert)" } as const;
  const height = Math.max(120, rows.length * 56 + 24);
  return (
    <figure className="m-0 break-inside-avoid" data-testid="budget-chart">
      <div className="w-full" style={{ height }} aria-hidden="true">
        <Frame height={height}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 4 }} barGap={2}>
            <CartesianGrid horizontal={false} stroke="var(--line)" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={112}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--ink-2)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "var(--bg-paper-2)" }}
              contentStyle={{
                background: "var(--bg-surface)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--ink)",
              }}
              formatter={(value, name) => [format(Number(value)), String(name)]}
            />
            <Bar dataKey="budgeted" name={labels.budgeted} fill="var(--chart-muted)" maxBarSize={14} isAnimationActive={false} />
            <Bar dataKey="spent" name={labels.spent} maxBarSize={14} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.id} fill={fill[r.tone]} />
              ))}
            </Bar>
          </BarChart>
        </Frame>
      </div>
      <Legend
        series={[
          { key: "budgeted", name: labels.budgeted, kind: "bar", color: "muted" },
          { key: "spent", name: labels.spent, kind: "bar", color: "forest" },
        ]}
      />
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Presupuesto</th>
              <th scope="col">{labels.budgeted}</th>
              <th scope="col">{labels.spent}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                <td>{format(r.budgeted)}</td>
                <td>{format(r.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
