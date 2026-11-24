"use client";

import Link from "next/link";
import type { CurrencyCode } from "@/domain/currency";
import { periodElapsedPercent } from "@/domain/rules/dashboard";
import { goalDisplayStatus } from "@/domain/rules/goals";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { AREAS } from "@/lib/config/navigation";
import { formatDate, type LocalDate } from "@/lib/formatting/date";
import { formatMoney } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import type { Report } from "@/services/reports/build-report";
import { BudgetStateBadge, GoalStatusBadge, ProgressBar, budgetBarTone } from "../planning/ui";
import { BudgetBars, ReportChart } from "./charts";
import { DeltaText, formatShare, moneyFormatter, Note, ResponsiveTable, SectionTitle, StatementLine } from "./ui";

const t = es.reports;

export interface SectionProps {
  report: Report;
  currency: CurrencyCode;
  today: string;
  /** Jump to another section (links between sections). */
  onTab?: (tab: ReportTab) => void;
}
export const REPORT_TABS = ["summary", "cashflow", "categories", "accounts", "cards", "budgets", "goals"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

const linkClass = "type-body-sm text-forest underline-offset-4 hover:underline";
const short = (d: string) => formatDate(d as LocalDate);

function NarrowedNote({ report }: { report: Report }) {
  return report.reliability.narrowed ? <Note testId="narrowed-note">{t.filters.narrowed}</Note> : null;
}

/* ------------------------------------------------------------------------------ */
/* A · Income and expenses                                                          */
/* ------------------------------------------------------------------------------ */

export function SummarySection({ report, currency, onTab }: SectionProps) {
  const money = moneyFormatter(currency);
  const row = report.incomeExpenses.find((r) => r.currency === currency);
  const monthly = report.monthly.find((m) => m.currency === currency)?.points ?? [];
  const expenses = report.categories.find((c) => c.currency === currency && c.kind === "expense");
  const transferOnly = report.filters.type === "transfer";
  const empty = !row || (row.current.income === 0 && row.current.expenses === 0 && row.previous.income === 0 && row.previous.expenses === 0);
  return (
    <div className="grid gap-12" data-testid="section-summary">
      <section aria-labelledby="rep-monthly">
        <SectionTitle id="rep-monthly">{t.summary.monthly}</SectionTitle>
        {monthly.every((p) => p.income === 0 && p.expenses === 0) ? (
          <p className="type-body-sm text-ink-2">{transferOnly ? t.summary.transferOnly : t.common.noData}</p>
        ) : (
          <ReportChart
            rows={monthly}
            unit="month"
            format={money}
            caption={t.common.tableCaption(t.summary.monthly, currency)}
            testId="monthly-chart"
            series={[
              { key: "income", name: t.common.income, kind: "bar", color: "sage" },
              { key: "expenses", name: t.common.expenses, kind: "bar", color: "forest" },
              { key: "result", name: t.common.result, kind: "line", color: "ink", dashed: true },
            ]}
          />
        )}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 desktop:grid-cols-12">
        <section aria-labelledby="rep-statement" className="desktop:col-span-7" data-testid="income-expenses">
          <SectionTitle id="rep-statement">{t.summary.title}</SectionTitle>
          {transferOnly ? (
            <p className="type-body-sm text-ink-2">{t.summary.transferOnly}</p>
          ) : empty || !row ? (
            <p className="type-body-sm text-ink-2">{t.common.noData}</p>
          ) : (
            <>
              <ResponsiveTable
                caption={t.common.tableCaption(t.summary.title, currency)}
                columns={[
                  { label: "" },
                  { label: `${short(report.range.from)} – ${short(report.range.to)}`, align: "right" },
                  { label: `${short(report.previousRange.from)} – ${short(report.previousRange.to)}`, align: "right" },
                  { label: t.common.change, align: "right" },
                ]}
                rows={(["income", "expenses", "result"] as const).map((k) => ({
                  id: k,
                  cells: [
                    k === "income" ? t.common.income : k === "expenses" ? t.common.expenses : t.common.result,
                    <Money
                      key="c"
                      amount={k === "expenses" ? -row.current.expenses : row.current[k]}
                      currency={currency}
                      cents="auto"
                      sign={k === "income" ? "explicit" : "negative"}
                      className={cn(k === "result" ? "type-amount-lg" : "type-amount")}
                    />,
                    <Money
                      key="p"
                      amount={k === "expenses" ? -row.previous.expenses : row.previous[k]}
                      currency={currency}
                      cents="auto"
                      className="type-amount text-ink-2"
                    />,
                    <DeltaText key="d" delta={k === "income" ? row.income : k === "expenses" ? row.expenses : row.result} currency={currency} />,
                  ],
                }))}
                testId="statement"
              />
              {(row.current.pendingIncome > 0 || row.current.pendingExpenses > 0) && (
                <Note testId="pending-note">{t.common.pendingApart(money(row.current.pendingIncome), money(row.current.pendingExpenses))}</Note>
              )}
              <Note>
                {t.common.movements(row.movements)} · {t.common.rules}
              </Note>
            </>
          )}
        </section>

        <section aria-labelledby="rep-top" className="desktop:col-span-5">
          <SectionTitle
            id="rep-top"
            aside={
              onTab && (
                <button type="button" className={cn(linkClass, "print:hidden")} onClick={() => onTab("categories")}>
                  {t.summary.seeCategories}
                </button>
              )
            }
          >
            {t.summary.topCategories}
          </SectionTitle>
          {!expenses || expenses.total === 0 ? (
            <p className="type-body-sm text-ink-2">{t.categories.none}</p>
          ) : (
            <CategoryBars report={report} rows={expenses.rows.filter((r) => r.amount > 0).slice(0, 5)} currency={currency} compact />
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------ */
/* B · Cash flow                                                                    */
/* ------------------------------------------------------------------------------ */

export function CashFlowSection({ report, currency, today }: SectionProps) {
  const money = moneyFormatter(currency);
  const flow = report.cashFlow.find((c) => c.currency === currency);
  const expected = report.expected.find((e) => e.currency === currency);
  const unit = report.buckets[0]?.unit ?? "day";
  if (!flow || flow.accountIds.length === 0)
    return (
      <div data-testid="section-cashflow">
        <p className="type-body-sm text-ink-2">{t.cashflow.noAccounts}</p>
      </div>
    );
  const moved = flow.points.some((p) => p.inflow || p.outflow || p.transfersIn || p.transfersOut);
  return (
    <div className="grid gap-12" data-testid="section-cashflow">
      <section aria-labelledby="rep-cash">
        <SectionTitle id="rep-cash">{t.cashflow.title}</SectionTitle>
        <ReportChart
          rows={flow.points}
          unit={unit}
          format={money}
          caption={t.common.tableCaption(t.cashflow.title, currency)}
          testId="cashflow-chart"
          tall
          series={[
            { key: "inflow", name: t.cashflow.inflow, kind: "bar", color: "sage" },
            { key: "outflow", name: t.cashflow.outflow, kind: "bar", color: "forest" },
            { key: "balance", name: t.cashflow.balance, kind: "line", color: "ink", axis: "side", dashed: true },
          ]}
        />
        <NarrowedNote report={report} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 desktop:grid-cols-12">
        <section aria-label={t.cashflow.title} className="desktop:col-span-7">
          <dl data-testid="cashflow-statement">
            <StatementLine term={t.cashflow.opening} testId="cf-opening">
              <Money amount={flow.opening} currency={currency} cents="auto" />
            </StatementLine>
            <StatementLine term={t.cashflow.inflow} testId="cf-inflow">
              <Money amount={flow.inflow} currency={currency} cents="auto" sign="explicit" />
            </StatementLine>
            <StatementLine term={t.cashflow.outflow} testId="cf-outflow">
              <Money amount={-flow.outflow} currency={currency} cents="auto" />
            </StatementLine>
            {(flow.transfersIn > 0 || flow.transfersOut > 0) && (
              <>
                <StatementLine term={t.cashflow.transfersIn}>
                  <Money amount={flow.transfersIn} currency={currency} cents="auto" sign="explicit" />
                </StatementLine>
                <StatementLine term={t.cashflow.transfersOut}>
                  <Money amount={-flow.transfersOut} currency={currency} cents="auto" />
                </StatementLine>
              </>
            )}
            <StatementLine term={t.cashflow.net} testId="cf-net">
              <Money amount={flow.net} currency={currency} cents="auto" sign="explicit" />
            </StatementLine>
            <StatementLine term={report.range.to >= today ? t.cashflow.closingToday : t.cashflow.closing} total testId="cf-closing">
              <Money amount={flow.closing} currency={currency} cents="auto" />
            </StatementLine>
          </dl>
          {moved && <Note testId="cf-periods">{t.cashflow.periods(flow.positive, flow.negative, flow.judged)}</Note>}
          <Note>{t.cashflow.creditNote}</Note>
        </section>

        <section aria-labelledby="rep-expected" className="desktop:col-span-5" data-testid="expected">
          {expected && (
            <>
              <SectionTitle id="rep-expected">{t.cashflow.expected}</SectionTitle>
              <dl>
                {expected.pendingIncome > 0 && (
                  <StatementLine term={t.cashflow.pendingIncome}>
                    <Money amount={expected.pendingIncome} currency={currency} cents="auto" sign="explicit" />
                  </StatementLine>
                )}
                {expected.pendingExpenses > 0 && (
                  <StatementLine term={t.cashflow.pendingExpenses}>
                    <Money amount={-expected.pendingExpenses} currency={currency} cents="auto" />
                  </StatementLine>
                )}
                {expected.billsDue > 0 && (
                  <StatementLine term={t.cashflow.billsDue}>
                    <Money amount={-expected.billsDue} currency={currency} cents="auto" />
                  </StatementLine>
                )}
                {expected.recurring > 0 && (
                  <StatementLine term={t.cashflow.recurring}>
                    <Money amount={-expected.recurring} currency={currency} cents="auto" />
                  </StatementLine>
                )}
              </dl>
              <Note>{t.cashflow.expectedNote}</Note>
            </>
          )}
        </section>
      </div>

      {moved && (
        <section aria-labelledby="rep-cash-history">
          <SectionTitle id="rep-cash-history">{t.cashflow.history}</SectionTitle>
          <ResponsiveTable
            caption={t.common.tableCaption(t.cashflow.history, currency)}
            testId="cashflow-table"
            columns={[
              { label: t.common.bucket },
              { label: t.cashflow.inflow, align: "right" },
              { label: t.cashflow.outflow, align: "right" },
              { label: t.cashflow.net, align: "right" },
              { label: t.cashflow.balance, align: "right" },
            ]}
            rows={flow.points
              .filter((p) => p.inflow || p.outflow || p.transfersIn || p.transfersOut)
              .map((p) => ({
                id: p.from,
                cells: [
                  p.from === p.to ? short(p.from) : `${short(p.from)} – ${short(p.to)}`,
                  <Money key="i" amount={p.inflow} currency={currency} cents="auto" className="type-amount" />,
                  <Money key="o" amount={-p.outflow} currency={currency} cents="auto" className="type-amount" />,
                  <span key="n" className="inline-flex items-center gap-2">
                    <Badge tone={p.net > 0 ? "positive" : p.net < 0 ? "late" : "neutral"}>
                      {p.net > 0 ? t.cashflow.positive : p.net < 0 ? t.cashflow.negative : t.cashflow.neutral}
                    </Badge>
                    <Money amount={p.net} currency={currency} cents="auto" sign="explicit" className="type-amount" />
                  </span>,
                  p.balance === null ? "—" : <Money key="b" amount={p.balance} currency={currency} cents="auto" className="type-amount" />,
                ],
              }))}
          />
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------ */
/* C · Categories                                                                   */
/* ------------------------------------------------------------------------------ */

function CategoryBars({
  report,
  rows,
  currency,
  compact = false,
}: {
  report: Report;
  rows: Report["categories"][number]["rows"];
  currency: CurrencyCode;
  compact?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const name = (id: string | null) => report.lookups.category(id) ?? t.categories.noCategory;
  return (
    <ol className="grid gap-3" data-testid={compact ? "top-categories" : "category-ranking"}>
      {rows.map((r, i) => (
        <li key={r.categoryId ?? "none"} className="grid gap-1" data-testid="category-row">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 truncate type-body">
              {!compact && <span className="mr-2 num text-ink-2">{i + 1}</span>}
              {name(r.categoryId)}
            </span>
            <Money amount={r.amount} currency={currency} cents="auto" className="type-amount" />
          </span>
          <span
            className="block h-2 w-full overflow-hidden rounded-full bg-paper-2"
            role="img"
            aria-label={`${name(r.categoryId)}: ${formatShare(r.share)}`}
          >
            <span className="block h-full rounded-full bg-sage" style={{ width: `${(r.amount * 100) / max}%` }} />
          </span>
          <span className="flex flex-wrap justify-between gap-x-3 type-caption text-ink-2">
            <span data-testid="category-share">{t.categories.shareOf(formatShare(r.share))}</span>
            {!compact && <DeltaText delta={r.delta} currency={currency} />}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function CategoriesSection({ report, currency }: SectionProps) {
  const money = moneyFormatter(currency);
  const expenses = report.categories.find((c) => c.currency === currency && c.kind === "expense");
  const income = report.categories.find((c) => c.currency === currency && c.kind === "income");
  const block = (kind: "expense" | "income", data: typeof expenses) => (
    <section aria-labelledby={`rep-cat-${kind}`} data-testid={`categories-${kind}`}>
      <SectionTitle
        id={`rep-cat-${kind}`}
        aside={
          data && data.total > 0 ? (
            <span className="type-body-sm text-ink-2">
              {t.categories.total}: <Money amount={data.total} currency={currency} cents="auto" />
            </span>
          ) : null
        }
      >
        {kind === "expense" ? t.categories.expenses : t.categories.income}
      </SectionTitle>
      {!data || data.total === 0 ? (
        <p className="type-body-sm text-ink-2">{kind === "expense" ? t.categories.none : t.categories.noneIncome}</p>
      ) : (
        <>
          <CategoryBars report={report} rows={data.rows.filter((r) => r.amount > 0)} currency={currency} />
          {data.rows.some((r) => r.amount === 0 && r.previous > 0) && (
            <Note>
              {t.common.previous}:{" "}
              {data.rows
                .filter((r) => r.amount === 0 && r.previous > 0)
                .map((r) => `${report.lookups.category(r.categoryId) ?? t.categories.noCategory} ${money(r.previous)}`)
                .join(" · ")}
            </Note>
          )}
        </>
      )}
    </section>
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12 desktop:grid-cols-12" data-testid="section-categories">
      <div className="desktop:col-span-7">{block("expense", expenses)}</div>
      {(income?.total ?? 0) > 0 || report.filters.type === "income" ? (
        <div className="desktop:col-span-5">{block("income", income)}</div>
      ) : null}
      <div className="desktop:col-span-12">
        <Note>{t.common.rules}</Note>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------ */
/* D · Accounts                                                                     */
/* ------------------------------------------------------------------------------ */

export function AccountsSection({ report, currency }: SectionProps) {
  const money = moneyFormatter(currency);
  const rows = report.accounts.filter((a) => a.account.currency === currency);
  const flow = report.cashFlow.find((c) => c.currency === currency);
  const unit = report.buckets[0]?.unit ?? "day";
  if (rows.length === 0)
    return (
      <div data-testid="section-accounts">
        <p className="type-body-sm text-ink-2">{t.accounts.none}</p>
      </div>
    );
  return (
    <div className="grid gap-12" data-testid="section-accounts">
      {flow && (
        <section aria-labelledby="rep-acc-chart">
          <SectionTitle id="rep-acc-chart">
            {t.accounts.balanceChart}
            {report.filters.accountId ? ` · ${report.lookups.account(report.filters.accountId)}` : ""}
          </SectionTitle>
          <ReportChart
            rows={flow.points}
            unit={unit}
            format={money}
            caption={t.common.tableCaption(t.accounts.balanceChart, currency)}
            testId="balance-chart"
            series={[{ key: "balance", name: t.cashflow.balance, kind: "line", color: "forest" }]}
          />
          {report.filters.accountId === null && rows.length > 1 && <Note>{t.accounts.chooseAccount}</Note>}
          <NarrowedNote report={report} />
        </section>
      )}
      <section aria-labelledby="rep-acc">
        <SectionTitle id="rep-acc">{t.accounts.title}</SectionTitle>
        <ul className="grid gap-8">
          {rows.map((a) => {
            const ops = a.operations.income + a.operations.expense + a.operations.transfer;
            return (
              <li key={a.account.id} data-testid="account-report">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
                  <Link href={`${AREAS.accounts.href}/${a.account.id}`} className="type-body font-semibold hover:underline">
                    {a.account.name}
                  </Link>
                  {a.account.status === "archived" && <Badge tone="neutral">{t.accounts.archived}</Badge>}
                </div>
                <dl className="grid gap-x-8 tablet:grid-cols-2">
                  <StatementLine term={t.accounts.opening}>
                    <Money amount={a.opening} currency={currency} cents="auto" />
                  </StatementLine>
                  <StatementLine term={t.accounts.closing} testId="account-closing">
                    <Money amount={a.closing} currency={currency} cents="auto" />
                  </StatementLine>
                  <StatementLine term={t.accounts.income}>
                    <Money amount={a.income} currency={currency} cents="auto" sign="explicit" />
                  </StatementLine>
                  <StatementLine term={t.accounts.expenses} testId="account-expenses">
                    <Money amount={-a.expenses} currency={currency} cents="auto" />
                  </StatementLine>
                  <StatementLine term={t.accounts.transfersIn}>
                    <Money amount={a.transfersIn} currency={currency} cents="auto" sign="explicit" />
                  </StatementLine>
                  <StatementLine term={t.accounts.transfersOut}>
                    <Money amount={-a.transfersOut} currency={currency} cents="auto" />
                  </StatementLine>
                </dl>
                {a.creditPurchases > 0 && (
                  <Note testId="account-credit">
                    {t.accounts.creditPurchases}: {money(a.creditPurchases)}. {t.accounts.creditPurchasesNote}
                  </Note>
                )}
                {ops > 0 && (
                  <div className="mt-3">
                    <span
                      className="flex h-2 w-full overflow-hidden rounded-full bg-paper-2"
                      role="img"
                      aria-label={`${t.accounts.operations}: ${t.accounts.operationsDetail(a.operations.income, a.operations.expense, a.operations.transfer)}`}
                    >
                      <span className="h-full bg-sage" style={{ width: `${(a.operations.income * 100) / ops}%` }} />
                      <span className="h-full bg-forest" style={{ width: `${(a.operations.expense * 100) / ops}%` }} />
                      <span className="h-full bg-chart-muted" style={{ width: `${(a.operations.transfer * 100) / ops}%` }} />
                    </span>
                    <p className="mt-1 type-caption text-ink-2">
                      {t.accounts.operations}: {t.accounts.operationsDetail(a.operations.income, a.operations.expense, a.operations.transfer)}
                    </p>
                  </div>
                )}
                {a.pending > 0 && <Note>{t.accounts.pending(a.pending)}</Note>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------------ */
/* E · Cards                                                                        */
/* ------------------------------------------------------------------------------ */

export function CardsSection({ report, currency }: SectionProps) {
  const rows = report.cards.filter((c) => c.card.currency === currency);
  const unit = report.buckets[0]?.unit ?? "day";
  const charted = rows.filter((c) => c.card.cardType === "credit" && c.utilization !== null && c.points.length > 0).slice(0, 3);
  const colors = ["forest", "sage", "ink"] as const;
  const chartRows = (charted[0]?.points ?? []).map((p, i) => ({
    from: p.from,
    to: p.to,
    ...Object.fromEntries(charted.map((c) => [c.card.id, c.points[i]?.utilization ?? null])),
  })) as ({ from: string; to: string } & Record<string, number | null>)[];
  if (rows.length === 0)
    return (
      <div data-testid="section-cards">
        <p className="type-body-sm text-ink-2">{t.cards.none}</p>
      </div>
    );
  return (
    <div className="grid gap-12" data-testid="section-cards">
      {charted.length > 0 && (
        <section aria-labelledby="rep-card-chart">
          <SectionTitle id="rep-card-chart">{t.cards.utilizationChart}</SectionTitle>
          <ReportChart
            rows={chartRows}
            unit={unit}
            format={(n) => `${n} %`}
            caption={t.common.tableCaption(t.cards.utilizationChart, currency)}
            testId="utilization-chart"
            series={charted.map((c, i) => ({
              key: c.card.id,
              name: c.card.name,
              kind: "line" as const,
              color: colors[i]!,
              dashed: i === 2,
            }))}
          />
        </section>
      )}
      <section aria-labelledby="rep-cards">
        <SectionTitle id="rep-cards">{t.cards.title}</SectionTitle>
        <ul className="grid gap-8">
          {rows.map((c) => (
            <li key={c.card.id} data-testid="card-report">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <Link href={`${AREAS.cards.href}/${c.card.id}`} className="type-body font-semibold hover:underline">
                  {c.card.name}
                  {c.card.lastFourDigits && <span className="font-normal text-ink-2"> ·· {c.card.lastFourDigits}</span>}
                </Link>
                <span className="flex gap-2">
                  <Badge tone="neutral">{es.cards.types[c.card.cardType]}</Badge>
                  {c.card.status !== "active" && <Badge tone="neutral">{t.cards.inactive}</Badge>}
                </span>
              </div>
              <dl className="grid gap-x-8 tablet:grid-cols-2">
                <StatementLine term={`${t.cards.purchases} · ${t.cards.purchasesCount(c.purchasesCount)}`} testId="card-purchases">
                  <Money amount={c.purchases} currency={currency} cents="auto" />
                </StatementLine>
                <StatementLine term={t.common.previous}>
                  <DeltaText delta={c.delta} currency={currency} />
                </StatementLine>
                {c.pendingPurchases > 0 && (
                  <StatementLine term={t.cards.pending}>
                    <Money amount={c.pendingPurchases} currency={currency} cents="auto" className="text-ink-2" />
                  </StatementLine>
                )}
                {c.committed !== null && (
                  <StatementLine term={t.cards.committed} testId="card-committed">
                    <Money amount={c.committed} currency={currency} cents="auto" />
                  </StatementLine>
                )}
              </dl>
              {c.committed !== null && (
                <div className="mt-3 grid gap-1">
                  {c.utilization !== null && c.card.creditLimit !== null ? (
                    <>
                      <ProgressBar
                        percent={c.utilization}
                        tone={c.utilization >= 100 ? "alert" : c.utilization >= 85 ? "warning" : "forest"}
                        label={`${t.cards.utilization} ${c.card.name}`}
                        valueText={`${c.utilization} %`}
                      />
                      <span className="flex flex-wrap justify-between gap-2 type-caption text-ink-2">
                        <span data-testid="card-utilization">
                          {t.cards.utilization}: {c.utilization} %
                        </span>
                        <span>
                          {t.cards.limit}: {formatMoney(c.card.creditLimit, { currency, cents: "auto" })}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="type-caption text-ink-2">{t.cards.noLimit}</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <Note>{t.cards.noDuplicates}</Note>
        <Note testId="payments-note">
          {t.cards.payments}: {t.cards.paymentsNotSupported}
        </Note>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------------ */
/* F · Budgets                                                                      */
/* ------------------------------------------------------------------------------ */

export function BudgetsSection({ report, currency, today }: SectionProps) {
  const money = moneyFormatter(currency);
  const rows = report.budgets.rows.filter((r) => r.budget.currency === currency);
  const totals = report.budgets.totals.find((x) => x.currency === currency);
  const over = rows.filter((r) => r.usage.state === "exceeded");
  if (rows.length === 0)
    return (
      <div data-testid="section-budgets">
        <p className="type-body-sm text-ink-2">
          {t.budgets.none}{" "}
          <Link href={`${AREAS.budget.href}#presupuestos`} className={linkClass}>
            {t.budgets.create}
          </Link>
        </p>
      </div>
    );
  const label = (r: (typeof rows)[number]) => r.category?.name ?? r.budget.name;
  return (
    <div className="grid gap-12" data-testid="section-budgets">
      <section aria-labelledby="rep-budget-chart">
        <SectionTitle id="rep-budget-chart">{t.budgets.title}</SectionTitle>
        <BudgetBars
          rows={rows.map((r) => ({ id: r.budget.id, name: label(r), budgeted: r.budget.amount, spent: r.usage.spent, tone: budgetBarTone(r.usage.state) as "forest" | "warning" | "alert" }))}
          format={money}
          labels={{ budgeted: t.budgets.budgeted, spent: t.budgets.spent }}
          caption={t.common.tableCaption(t.budgets.title, currency)}
        />
        {totals && (
          <p className="mt-4 type-body text-ink-2" data-testid="budget-totals">
            {t.budgets.totals(totals.count)} · {t.budgets.spent}{" "}
            <Money amount={totals.spent} currency={currency} cents="auto" className="text-ink" /> / {t.budgets.budgeted}{" "}
            <Money amount={totals.budgeted} currency={currency} cents="auto" className="text-ink" />
            {totals.budgeted > 0 && ` · ${t.budgets.execution} ${Math.floor((totals.spent * 100) / totals.budgeted)} %`}
          </p>
        )}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 desktop:grid-cols-12">
        <section aria-labelledby="rep-budget-list" className="desktop:col-span-7">
          <SectionTitle id="rep-budget-list">{t.budgets.execution}</SectionTitle>
          <ul className="grid gap-5">
            {rows.map((r) => (
              <li key={r.budget.id} data-testid="budget-report">
                <Link href={`${AREAS.budget.href}#presupuestos/${r.budget.id}`} className="grid gap-1.5 hover:opacity-80">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="truncate type-body">{label(r)}</span>
                    <span className="flex items-center gap-2">
                      {r.running && <Badge tone="neutral">{t.budgets.running}</Badge>}
                      <BudgetStateBadge state={r.usage.state} />
                      <span className="type-amount">{es.planning.budgets.percent(r.usage.percent)}</span>
                    </span>
                  </span>
                  <ProgressBar
                    percent={r.usage.percent}
                    tone={budgetBarTone(r.usage.state)}
                    label={label(r)}
                    valueText={es.planning.budgets.percent(r.usage.percent)}
                    pace={r.running ? periodElapsedPercent({ from: r.budget.startDate, to: r.budget.endDate }, today) : null}
                  />
                  <span className="flex flex-wrap justify-between gap-2 type-caption text-ink-2">
                    <span>
                      {short(r.budget.startDate)} – {short(r.budget.endDate)} · {es.planning.budgets.spentOf(money(r.usage.spent), money(r.budget.amount))}
                    </span>
                    {r.delta && (
                      <span>
                        {t.budgets.previous}: {money(r.previousSpent ?? 0)} · <DeltaText delta={r.delta} currency={currency} />
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="rep-budget-over" className="desktop:col-span-5" data-testid="budgets-over">
          <SectionTitle id="rep-budget-over">{t.budgets.over}</SectionTitle>
          {over.length === 0 ? (
            <p className="type-body-sm text-ink-2">{t.budgets.noneOver}</p>
          ) : (
            <ul>
              {over.map((r) => (
                <li key={r.budget.id} className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                  <span className="min-w-0 truncate type-body">{label(r)}</span>
                  <Money amount={r.usage.over} currency={currency} cents="auto" attention className="type-amount" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------ */
/* G · Goals                                                                        */
/* ------------------------------------------------------------------------------ */

export function GoalsSection({ report, currency }: SectionProps) {
  const money = moneyFormatter(currency);
  const rows = report.goals.filter((g) => g.goal.currency === currency);
  const series = report.goalSeries.find((s) => s.currency === currency)?.points ?? [];
  const unit = report.buckets[0]?.unit ?? "day";
  if (rows.length === 0)
    return (
      <div data-testid="section-goals">
        <p className="type-body-sm text-ink-2">
          {t.goals.none}{" "}
          <Link href={`${AREAS.budget.href}#metas`} className={linkClass}>
            {t.goals.create}
          </Link>
        </p>
      </div>
    );
  return (
    <div className="grid gap-12" data-testid="section-goals">
      {series.length > 0 && (
        <section aria-labelledby="rep-goal-chart">
          <SectionTitle id="rep-goal-chart">{t.goals.chart}</SectionTitle>
          <ReportChart
            rows={series}
            unit={unit}
            format={money}
            caption={t.common.tableCaption(t.goals.chart, currency)}
            testId="goals-chart"
            series={[
              { key: "contributed", name: t.goals.contributions, kind: "bar", color: "sage" },
              { key: "accumulated", name: t.goals.accumulated, kind: "line", color: "forest", axis: "side" },
            ]}
          />
          <Note>{t.goals.note}</Note>
        </section>
      )}
      <section aria-labelledby="rep-goals">
        <SectionTitle id="rep-goals">{t.goals.title}</SectionTitle>
        <ul className="grid gap-8">
          {rows.map((g) => (
            <li key={g.goal.id} data-testid="goal-report">
              <Link href={`${AREAS.budget.href}#metas/${g.goal.id}`} className="grid gap-1.5 hover:opacity-80">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate type-body font-semibold">{g.goal.name}</span>
                    <GoalStatusBadge status={goalDisplayStatus(g.goal, g.progress)} />
                  </span>
                  <span className="type-amount">
                    <Money amount={g.progress.saved} currency={currency} cents="auto" /> <span className="text-ink-2">/</span>{" "}
                    <Money amount={g.progress.target} currency={currency} cents="auto" className="text-ink-2" />
                  </span>
                </span>
                <ProgressBar percent={g.progress.percent} tone="forest" label={g.goal.name} valueText={`${g.progress.percent} %`} />
              </Link>
              <dl className="mt-2 grid gap-x-8 tablet:grid-cols-2">
                <StatementLine term={t.goals.remaining} testId="goal-remaining">
                  {g.progress.reached ? <span className="type-body-sm">{t.goals.reached}</span> : <Money amount={g.progress.remaining} currency={currency} cents="auto" />}
                </StatementLine>
                <StatementLine term={t.goals.contributed} testId="goal-contributed">
                  <Money amount={g.contributedInRange} currency={currency} cents="auto" />
                </StatementLine>
              </dl>
              <Note testId="goal-pace">
                {t.goals.pace}: {g.pacePerMonth === null ? t.goals.paceUnknown : t.goals.pacePerMonth(money(g.pacePerMonth))}
                {g.estimatedDate && ` · ${t.goals.estimated(formatDate(g.estimatedDate as LocalDate, "form"))}`}
              </Note>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
