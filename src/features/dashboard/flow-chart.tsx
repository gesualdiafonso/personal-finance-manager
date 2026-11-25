"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DashboardGranularity,
  FlowBucket,
} from "@/domain/rules/dashboard";
import type { CurrencyCode } from "@/domain/currency";
import {
  formatDate,
  formatMonthTitle,
  type LocalDate,
} from "@/lib/formatting/date";
import { formatMoney } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";

const t = es.dashboard;

function bucketLabel(b: FlowBucket, granularity: DashboardGranularity): string {
  if (granularity === "year")
    return formatMonthTitle(b.from as LocalDate).slice(0, 3);
  if (granularity === "quarter") return formatDate(b.from as LocalDate);
  return String(Number(b.from.slice(8, 10)));
}

/**
 * Income and expenses per bucket (bars) and the derived balance of the accounts (line), one
 * currency at a time — never converted. Colours are AUREON tokens (income, expense, gold balance line) and follow the theme;
 * the same numbers are in a table for screen readers.
 */
export function FlowChart({
  buckets,
  granularity,
  currency,
}: {
  buckets: FlowBucket[];
  granularity: DashboardGranularity;
  currency: CurrencyCode;
}) {
  const money = (n: number) => formatMoney(n, { currency, cents: "auto" });
  const data = buckets.map((b) => ({
    ...b,
    label: bucketLabel(b, granularity),
  }));
  const hasBalance = buckets.some((b) => b.balance !== null);
  return (
    <figure className="m-0" data-testid="flow-chart">
      <div className="h-56 w-full desktop:h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          >
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tick={{ fill: "var(--ink-2)", fontSize: 12 }}
            />
            <YAxis yAxisId="flow" hide />
            <YAxis yAxisId="balance" hide orientation="right" />
            <Tooltip
              cursor={{ fill: "var(--bg-paper-2)" }}
              contentStyle={{
                background: "var(--bg-surface)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 13,
              }}
              formatter={(value, name) => [money(Number(value)), String(name)]}
              labelFormatter={(_, payload) => {
                const b = payload?.[0]?.payload as FlowBucket | undefined;
                return b
                  ? b.from === b.to
                    ? formatDate(b.from as LocalDate, "long")
                    : `${formatDate(b.from as LocalDate)} – ${formatDate(b.to as LocalDate)}`
                  : "";
              }}
            />
            <Bar
              yAxisId="flow"
              dataKey="income"
              name={t.flow.income}
              fill="var(--income)"
              radius={[2, 2, 0, 0]}
              maxBarSize={18}
            />
            <Bar
              yAxisId="flow"
              dataKey="expenses"
              name={t.flow.expenses}
              fill="var(--expense)"
              radius={[2, 2, 0, 0]}
              maxBarSize={18}
            />
            {hasBalance && (
              <Line
                yAxisId="balance"
                dataKey="balance"
                name={t.chart.balance}
                stroke="var(--ink-2)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 type-caption text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-xs bg-income" />
          {t.flow.income}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-xs bg-expense" />
          {t.flow.expenses}
        </span>
        {hasBalance && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-0 w-4 border-t-2 border-dashed border-gold"
            />
            {t.chart.balance}
          </span>
        )}
      </figcaption>
      <div className="sr-only">
        <table data-testid="flow-table">
          <caption>{t.chart.tableCaption(currency)}</caption>
          <thead>
            <tr>
              <th scope="col">{t.chart.bucket}</th>
              <th scope="col">{t.flow.income}</th>
              <th scope="col">{t.flow.expenses}</th>
              <th scope="col">{t.chart.balance}</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.from}>
                <th scope="row">
                  {b.from === b.to ? b.from : `${b.from} – ${b.to}`}
                </th>
                <td>{money(b.income)}</td>
                <td>{money(b.expenses)}</td>
                <td>{b.balance === null ? "—" : money(b.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
