"use client";

import { activeRateSet, consolidate } from "@/domain/fx";
import { ConsolidatedEstimate } from "@/features/exchange/estimates";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  balancesAt,
  dashboardPeriod,
  DASHBOARD_GRANULARITIES,
  flowSeries,
  periodElapsedPercent,
  periodFlow,
  periodTiming,
  shiftPeriod,
  type DashboardGranularity,
  type DateRange,
} from "@/domain/rules/dashboard";
import type { CurrencyCode } from "@/domain/currency";
import type { Transaction } from "@/domain/schemas";
import { PageHeader } from "@/components/layout/page-header";
import {
  CurrentMonthTitle,
  TodayLabel,
} from "@/components/shared/current-date";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackProvider } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalQuery } from "@/hooks/use-local-data";
import { AREAS } from "@/lib/config/navigation";
import {
  formatDate,
  formatMonthTitle,
  type LocalDate,
} from "@/lib/formatting/date";
import { formatMoney } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import {
  readPreference,
  writePreference,
} from "@/services/storage/preferences";
import { BudgetStateBadge, ProgressBar, budgetBarTone } from "../planning/ui";
import { TransactionDetailSheet } from "../transactions/transaction-detail";
import { EmptyDashboard } from "./empty-dashboard";
import { FlowChart } from "./flow-chart";
import { loadDashboard, type DashboardData } from "./data";

const t = es.dashboard;

/**
 * Panel (dashboard.md): "¿Cuánto tengo? ¿Cómo va el período? ¿Qué viene? ¿A dónde va el
 * dinero?". Everything is read from this device's IndexedDB in one go; the period selector
 * recomputes the dependent blocks from what was read (no new read, no reload). Any change in
 * the data re-reads the page (notifyDataChanged), so the indicators always follow it.
 */
export function DashboardPage() {
  return (
    <FeedbackProvider>
      <DashboardContent />
    </FeedbackProvider>
  );
}

function DashboardContent() {
  const query = useLocalQuery((db) => loadDashboard(db), []);
  if (query.status === "loading") return <DashboardSkeleton />;
  if (query.status === "error") {
    return (
      <>
        <PageHeader title={AREAS.dashboard.label} />
        <section role="alert" className="max-w-[60ch]">
          <p className="type-body text-alert-text">
            {query.error.code === "STORAGE_UNAVAILABLE"
              ? es.accounts.storageUnavailable
              : t.loadError}
          </p>
          <Button className="mt-4" onClick={query.reload}>
            {es.common.retry}
          </Button>
        </section>
      </>
    );
  }
  if (query.data.empty) return <EmptyDashboard />;
  return <Dashboard data={query.data} />;
}

/** Skeletons with the shape of the content (dashboard.md "Carregamento"), never a spinner. */
function DashboardSkeleton() {
  // The header is real from the first paint (today's date and month are known without data).
  return (
    <div data-testid="dashboard-loading" aria-busy="true">
      <PageHeader label={<TodayLabel />} title={<CurrentMonthTitle />} />
      <div className="mt-12 grid gap-8 desktop:grid-cols-12">
        <div className="desktop:col-span-7">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-16 w-80 max-w-full" />
          <Skeleton className="mt-5 h-2 w-full" />
        </div>
        <div className="grid gap-3 desktop:col-span-4 desktop:col-start-9">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="mt-12 h-20 w-full" />
    </div>
  );
}

function usePeriod(today: string, firstDayOfWeek: "monday" | "sunday") {
  // The chosen granularity is a light preference (LocalStorage, never financial data). This
  // component only mounts on the client, after IndexedDB was read, so reading it here is safe.
  const [granularity, setGranularity] = useState<DashboardGranularity>(
    () => readPreference("pfm.dashboard.granularity") ?? "month",
  );
  const [anchor, setAnchor] = useState(today);
  const period = dashboardPeriod(granularity, anchor, firstDayOfWeek);
  return {
    granularity,
    period,
    setGranularity: (g: DashboardGranularity) => {
      setGranularity(g);
      writePreference("pfm.dashboard.granularity", g);
    },
    shift: (steps: number) =>
      setAnchor(shiftPeriod(granularity, period, steps, firstDayOfWeek).from),
    reset: () => setAnchor(today),
  };
}

function periodTitle(
  granularity: DashboardGranularity,
  period: DateRange,
  today: string,
): string {
  const year = Number(period.from.slice(0, 4));
  const sameYear = period.from.slice(0, 4) === today.slice(0, 4);
  switch (granularity) {
    case "week":
      return t.period.week(
        formatDate(period.from as LocalDate),
        formatDate(period.to as LocalDate),
      );
    case "month":
      return sameYear
        ? formatMonthTitle(period.from as LocalDate)
        : `${formatMonthTitle(period.from as LocalDate)} ${year}`;
    case "quarter":
      return t.period.quarter(
        Math.floor((Number(period.from.slice(5, 7)) - 1) / 3) + 1,
        year,
      );
    case "year":
      return String(year);
  }
}

function Dashboard({ data }: { data: DashboardData }) {
  const { today, settings } = data;
  const base = settings.baseCurrency;
  const { granularity, period, setGranularity, shift, reset } = usePeriod(
    today,
    settings.firstDayOfWeek,
  );
  const timing = periodTiming(period, today);
  const title = periodTitle(granularity, period, today);
  // Hour in the financial time zone (Buenos Aires by default), never the device's.
  const [hour] = useState(() =>
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timezone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date()),
    ),
  );
  const [selectedTx, setSelectedTx] = useState<string | null>(null);

  const flows = useMemo(
    () => periodFlow(data.transactions, period, base),
    [data.transactions, period, base],
  );
  const chartCurrencies = useMemo(() => {
    const set = new Set<CurrencyCode>([
      ...flows.map((f) => f.currency),
      ...data.activeAccounts.map((a) => a.currency),
    ]);
    return [...set].sort((a, b) =>
      a === base ? -1 : b === base ? 1 : a.localeCompare(b),
    );
  }, [flows, data.activeAccounts, base]);
  const [chartCurrency, setChartCurrency] = useState<CurrencyCode>(base);
  const currency = chartCurrencies.includes(chartCurrency)
    ? chartCurrency
    : (chartCurrencies[0] ?? base);
  const series = useMemo(
    () =>
      flowSeries(data.transactions, data.accounts, {
        period,
        granularity,
        currency,
        today,
        cardTypes: data.cardTypes,
      }),
    [
      data.transactions,
      data.accounts,
      period,
      granularity,
      currency,
      today,
      data.cardTypes,
    ],
  );
  // The hero is "now" (dashboard.md); for a past period, the balance at its end.
  const hero =
    timing === "past"
      ? balancesAt(
          data.accounts,
          data.transactions,
          period.to,
          base,
          data.cardTypes,
        )
      : data.accountsSummary.balances.map((m) => ({
          currency: m.currency,
          amount: m.amount as number,
        }));

  return (
    <>
      <PageHeader
        label={
          <span suppressHydrationWarning>
            {t.greeting(hour)} · {formatDate(today as LocalDate, "long")}
          </span>
        }
        title={<span data-testid="dashboard-title">{title}</span>}
      />
      <div className="-mt-4 mb-10 desktop:-mt-8 desktop:flex desktop:justify-end">
        <PeriodControl
          granularity={granularity}
          onGranularity={setGranularity}
          onShift={shift}
          onReset={reset}
          isCurrent={timing === "current"}
        />
      </div>

      {/* 1 · Quanto tenho? — 2 · Como está o período? */}
      <section
        className="grid grid-cols-[minmax(0,1fr)] gap-10 desktop:grid-cols-12"
        aria-label={t.availableBalance}
      >
        <div className="desktop:col-span-7" data-testid="dashboard-hero">
          <h2 className="flex items-center gap-2.5 type-label text-ink-2">
            <span aria-hidden="true" className="brand-rule" />
            {timing === "past" ? t.balanceAtEnd : t.availableBalance}
          </h2>
          {hero.length === 0 ? (
            <p className="mt-3.5 type-display-hero-mobile text-ink-2 desktop:type-display-hero">
              $ 0
            </p>
          ) : (
            <>
              <p
                className="mt-3.5 type-display-hero-mobile desktop:type-display-hero"
                data-testid="hero-balance"
              >
                <Money
                  amount={hero[0]!.amount}
                  currency={hero[0]!.currency}
                  cents="auto"
                />
              </p>
              {hero.length > 1 && (
                <div className="mt-3">
                  <p className="type-caption text-ink-2">{t.otherCurrencies}</p>
                  {hero.slice(1).map((h) => (
                    <p
                      key={h.currency}
                      className="type-amount-lg"
                      data-testid={`hero-balance-${h.currency}`}
                    >
                      <Money
                        amount={h.amount}
                        currency={h.currency}
                        cents="auto"
                      />
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
          <ConsolidatedEstimate
            className="mt-4"
            total={consolidate(
              hero,
              data.form.exchange.primary,
              activeRateSet(data.form.exchange.exchange),
              data.form.exchange.exchange.defaultMode,
            )}
          />
          <AccountsBar data={data} />
          <p className="mt-2 type-body-sm text-ink-2">
            {t.accountsCount(data.accountsSummary.active)}
          </p>
        </div>
        <div
          className="desktop:col-span-4 desktop:col-start-9"
          data-testid="period-flow"
        >
          <h2 className="flex items-center gap-2.5 type-label text-ink-2">
            <span aria-hidden="true" className="brand-rule" />
            {timing === "current" ? t.period.toDate(title) : title}
          </h2>
          {flows.length === 0 ? (
            <p className="mt-4 type-body-sm text-ink-2">{t.flow.none}</p>
          ) : (
            flows.map((f) => (
              <dl
                key={f.currency}
                className="mt-4"
                data-testid={`flow-${f.currency}`}
              >
                {flows.length > 1 && (
                  <p className="mb-1 type-caption text-ink-2">
                    {es.common.currencies[f.currency]}
                  </p>
                )}
                <StatementLine term={t.flow.income} testId="flow-income">
                  <Money
                    amount={f.income}
                    currency={f.currency}
                    sign="explicit"
                  />
                </StatementLine>
                <StatementLine term={t.flow.expenses} testId="flow-expenses">
                  <Money amount={-f.expenses} currency={f.currency} />
                </StatementLine>
                <div className="flex items-baseline justify-between gap-4 border-t-[3px] border-double border-line-strong pt-2">
                  <dt className="type-body">{t.flow.result}</dt>
                  <dd className="type-amount-xl" data-testid="flow-result">
                    <Money amount={f.result} currency={f.currency} />
                  </dd>
                </div>
                {(f.pendingIncome > 0 || f.pendingExpenses > 0) && (
                  <p
                    className="mt-2 type-caption text-ink-2"
                    data-testid="flow-pending"
                  >
                    {t.flow.pending(
                      formatMoney(f.pendingIncome, {
                        currency: f.currency,
                        cents: "auto",
                      }),
                      formatMoney(f.pendingExpenses, {
                        currency: f.currency,
                        cents: "auto",
                      }),
                    )}
                  </p>
                )}
              </dl>
            ))
          )}
          <p className="mt-3 type-caption text-ink-2">{t.flow.note}</p>
          <Link
            href={AREAS.transactions.href}
            className="mt-2 inline-block type-body-sm text-forest underline-offset-4 hover:underline"
          >
            {t.flow.seeAll}
          </Link>
        </div>
      </section>

      {/* 3 · O que vem a seguir? — faixa de obrigações */}
      <ObligationsStrip data={data} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 desktop:grid-cols-12">
        <Upcoming data={data} />
        <section
          aria-labelledby="dash-flow"
          className="desktop:col-span-6 desktop:col-start-7"
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2
              id="dash-flow"
              className="flex items-center gap-2.5 type-label text-ink-2"
            >
              <span aria-hidden="true" className="brand-rule" />
              {t.chart.title} · {title}
            </h2>
            {chartCurrencies.length > 1 && (
              <div
                role="group"
                aria-label={t.chart.currency}
                className="flex gap-1"
              >
                {chartCurrencies.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={c === currency}
                    onClick={() => setChartCurrency(c)}
                    className={cn(
                      "h-8 rounded-xs px-2.5 type-body-sm text-ink-2",
                      c === currency && "bg-paper-2 font-semibold text-ink",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          {series.every((b) => b.income === 0 && b.expenses === 0) &&
          series.every((b) => b.balance === null) ? (
            <p className="type-body-sm text-ink-2">{t.chart.none}</p>
          ) : (
            <FlowChart
              buckets={series}
              granularity={granularity}
              currency={currency}
            />
          )}
        </section>

        <Recent data={data} onOpen={(tx) => setSelectedTx(tx.id)} />
        <Budgets data={data} />
        <Goals data={data} />
        <AccountsAndCards data={data} />
      </div>

      <TransactionDetailSheet
        transaction={
          selectedTx
            ? (data.transactions.find((x) => x.id === selectedTx) ?? null)
            : null
        }
        context={{
          accounts: data.accounts,
          categories: data.categories,
          cards: data.cards,
          cardTypes: data.cardTypes,
          form: data.form,
        }}
        onClose={() => setSelectedTx(null)}
      />
    </>
  );
}

function PeriodControl({
  granularity,
  onGranularity,
  onShift,
  onReset,
  isCurrent,
}: {
  granularity: DashboardGranularity;
  onGranularity: (g: DashboardGranularity) => void;
  onShift: (steps: number) => void;
  onReset: () => void;
  isCurrent: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="period-control"
    >
      <div
        role="group"
        aria-label={t.period.label}
        className="grid grid-cols-4 rounded-sm bg-paper-2 p-0.75"
      >
        {DASHBOARD_GRANULARITIES.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={g === granularity}
            onClick={() => onGranularity(g)}
            className={cn(
              "grid h-8 place-items-center rounded-xs px-2.5 type-body-sm text-ink-2",
              g === granularity &&
                "bg-surface font-semibold text-ink ring-1 ring-line",
            )}
          >
            {t.period.granularity[g]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          onClick={() => onShift(-1)}
          aria-label={t.period.previous}
        >
          ‹
        </Button>
        {!isCurrent && (
          <Button variant="ghost" onClick={onReset}>
            {t.period.current}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => onShift(1)}
          aria-label={t.period.next}
        >
          ›
        </Button>
      </div>
    </div>
  );
}

function StatementLine({
  term,
  children,
  testId,
}: {
  term: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2">
      <dt className="type-body text-ink-2">{term}</dt>
      <dd className="type-amount" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

/** The only visual next to the hero: share of each account in the base-currency balance. */
function AccountsBar({ data }: { data: DashboardData }) {
  const base = data.settings.baseCurrency;
  const rows = data.activeAccounts
    .filter((a) => a.currency === base)
    .map((a) => ({
      account: a,
      amount:
        (data.accountsSummary.byAccount.get(a.id)?.amount as
          number | undefined) ?? 0,
    }))
    .filter((r) => r.amount > 0);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (rows.length < 2 || total <= 0) return null;
  const shades = ["bg-forest", "bg-sage", "bg-chart-muted", "bg-lake"];
  return (
    <div
      className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-paper-2"
      role="img"
      aria-label={`${t.accountsBar}: ${rows.map((r) => `${r.account.name} ${formatMoney(r.amount, { currency: base, cents: "auto" })}`).join(", ")}`}
    >
      {rows.map((r, i) => (
        <span
          key={r.account.id}
          className={cn("h-full", shades[i % shades.length])}
          style={{ width: `${(r.amount * 100) / total}%` }}
          title={`${r.account.name}: ${formatMoney(r.amount, { currency: base, cents: "auto" })}`}
        />
      ))}
    </div>
  );
}

function ObligationsStrip({ data }: { data: DashboardData }) {
  const toPay = data.bills.byCurrency.filter((r) => r.pending > 0);
  const committed = data.cardsSummary.committed.filter(
    (m) => (m.amount as number) > 0,
  );
  return (
    <section
      aria-label={t.obligations.label}
      className="-mx-4 my-12 grid gap-6 bg-paper-2 px-4 py-5 tablet:mx-0 tablet:rounded-md tablet:px-6 desktop:grid-cols-12 desktop:items-center"
      data-testid="obligations-strip"
    >
      <div className="desktop:col-span-4" data-testid="to-pay">
        <h2 className="type-label text-ink-2">{t.obligations.toPay}</h2>
        <p className="mt-1 flex flex-wrap gap-x-3 type-amount-lg">
          {toPay.length === 0 ? (
            <span className="text-ink-2">{t.obligations.nothing}</span>
          ) : (
            toPay.map((r) => (
              <Money
                key={r.currency}
                amount={r.pending}
                currency={r.currency}
                cents="auto"
                attention={r.overdue > 0}
              />
            ))
          )}
        </p>
        {data.bills.overdueCount > 0 && (
          <p className="type-caption text-alert-text">
            {t.obligations.overdue(data.bills.overdueCount)}
          </p>
        )}
        {data.pending.length > 0 && (
          <p className="type-caption text-ink-2">
            {t.obligations.pendingExpenses(
              data.pending
                .map((p) =>
                  formatMoney(p.amount, {
                    currency: p.currency,
                    cents: "auto",
                  }),
                )
                .join(" · "),
            )}
          </p>
        )}
      </div>
      <div
        className="desktop:col-span-4 desktop:border-l desktop:border-line desktop:pl-6"
        data-testid="committed"
      >
        <h2 className="type-label text-ink-2">{t.obligations.committed}</h2>
        <p className="mt-1 flex flex-wrap gap-x-3 type-amount-lg">
          {committed.length === 0 ? (
            <span className="text-ink-2">{t.obligations.nothing}</span>
          ) : (
            committed.map((m) => (
              <Money
                key={m.currency}
                amount={m.amount}
                currency={m.currency}
                cents="auto"
              />
            ))
          )}
        </p>
      </div>
      <nav
        aria-label={t.obligations.shortcuts}
        className="flex flex-wrap gap-x-5 gap-y-2 type-body-sm desktop:col-span-4 desktop:justify-end"
      >
        <Link
          className="text-forest underline-offset-4 hover:underline"
          href={`${AREAS.transactions.href}#nueva`}
        >
          {t.obligations.addExpense}
        </Link>
        <Link
          className="text-forest underline-offset-4 hover:underline"
          href={AREAS.bills.href}
        >
          {t.obligations.payBill}
        </Link>
        <Link
          className="text-forest underline-offset-4 hover:underline"
          href={AREAS.cards.href}
        >
          {t.obligations.seeCards}
        </Link>
      </nav>
    </section>
  );
}

function SectionHead({
  id,
  title,
  href,
  linkLabel,
}: {
  id: string;
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2.5 type-label text-ink-2">
        <span aria-hidden="true" className="brand-rule" />
        {title}
      </h2>
      <Link
        href={href}
        className="type-body-sm text-forest underline-offset-4 hover:underline"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function Upcoming({ data }: { data: DashboardData }) {
  return (
    <section
      aria-labelledby="dash-upcoming"
      className="desktop:col-span-5"
      data-testid="upcoming"
    >
      <SectionHead
        id="dash-upcoming"
        title={t.upcoming.title}
        href={AREAS.bills.href}
        linkLabel={t.upcoming.seeAll}
      />
      {data.upcoming.length === 0 ? (
        <p className="type-body-sm text-ink-2">{t.upcoming.none}</p>
      ) : (
        <ul>
          {data.upcoming.map((u) => (
            <li
              key={`${u.kind}-${u.id}-${u.date}`}
              className="border-b border-line last:border-b-0"
              data-testid="upcoming-item"
            >
              <Link
                href={
                  u.kind === "bill" ? AREAS.bills.href : AREAS.recurrences.href
                }
                className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-3 py-2.5 hover:bg-paper-2"
              >
                <span
                  className={cn(
                    "type-amount-lg tabular-nums",
                    u.overdue && "text-alert-text",
                  )}
                >
                  {Number(u.date.slice(8, 10))}
                </span>
                <span className="min-w-0">
                  <span className="block truncate type-body">{u.name}</span>
                  <span
                    className={cn(
                      "block type-caption",
                      u.overdue ? "text-alert-text" : "text-ink-2",
                    )}
                  >
                    {u.overdue
                      ? t.upcoming.overdue
                      : formatDate(u.date as LocalDate)}{" "}
                    ·{" "}
                    {u.kind === "bill"
                      ? t.upcoming.bill
                      : t.upcoming.recurrence}
                  </span>
                </span>
                <Money
                  amount={u.amount}
                  currency={u.currency}
                  cents="auto"
                  className="type-amount"
                  attention={u.overdue}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Recent({
  data,
  onOpen,
}: {
  data: DashboardData;
  onOpen: (tx: Transaction) => void;
}) {
  const category = (id: string | null) =>
    id ? data.categories.find((c) => c.id === id)?.name : null;
  const account = (id: string) =>
    data.accounts.find((a) => a.id === id)?.name ?? "—";
  return (
    <section
      aria-labelledby="dash-recent"
      className="desktop:col-span-5"
      data-testid="recent"
    >
      <SectionHead
        id="dash-recent"
        title={t.recent.title}
        href={AREAS.transactions.href}
        linkLabel={t.recent.seeAll}
      />
      {data.recent.length === 0 ? (
        <p className="type-body-sm text-ink-2">{t.recent.none}</p>
      ) : (
        <ul>
          {data.recent.map((tx) => {
            const kind =
              tx.type === "income"
                ? t.recent.income
                : tx.type === "expense"
                  ? t.recent.expense
                  : t.recent.transfer;
            return (
              <li key={tx.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpen(tx)}
                  aria-label={t.recent.open(tx.description)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2.5 text-left hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
                  data-testid="recent-item"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 truncate type-body">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          tx.type === "income"
                            ? "bg-income"
                            : tx.type === "expense"
                              ? "bg-expense"
                              : "bg-stone",
                        )}
                      />
                      <span className="truncate">{tx.description}</span>
                    </span>
                    <span className="block truncate type-caption text-ink-2">
                      {[
                        formatDate(tx.date as LocalDate),
                        tx.type === "transfer"
                          ? kind
                          : (category(tx.categoryId) ?? t.recent.noCategory),
                        account(tx.accountId),
                      ].join(" · ")}
                    </span>
                  </span>
                  <span className="text-right">
                    <Money
                      amount={tx.type === "expense" ? -tx.amount : tx.amount}
                      sign={tx.type === "transfer" ? "negative" : "explicit"}
                      currency={tx.currency}
                      className={cn(
                        "type-amount",
                        tx.status === "pending" && "text-ink-2",
                      )}
                    />
                    <span className="block type-caption text-ink-2">
                      {kind}
                      {tx.status === "pending" && ` · ${t.recent.pending}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Budgets({ data }: { data: DashboardData }) {
  return (
    <section
      aria-labelledby="dash-budgets"
      className="desktop:col-span-6 desktop:col-start-7"
      data-testid="dashboard-budgets"
    >
      <SectionHead
        id="dash-budgets"
        title={t.budgets.title}
        href={`${AREAS.budget.href}#presupuestos`}
        linkLabel={t.budgets.seeAll}
      />
      {data.budgets.length === 0 ? (
        <p className="type-body-sm text-ink-2">
          {t.budgets.none}{" "}
          <Link
            href={`${AREAS.budget.href}#presupuestos`}
            className="text-forest underline-offset-4 hover:underline"
          >
            {t.budgets.create}
          </Link>
        </p>
      ) : (
        <ul className="grid gap-4">
          {data.budgets.map(({ budget, usage, category }, i) => {
            const money = (n: number) =>
              formatMoney(n, { currency: budget.currency, cents: "auto" });
            const pace = periodElapsedPercent(
              { from: budget.startDate, to: budget.endDate },
              data.today,
            );
            return (
              // On the phone only the three closest to the limit (dashboard.md "Mobile").
              <li
                key={budget.id}
                className={cn(i >= 3 && "hidden tablet:block")}
                data-testid="dashboard-budget"
              >
                <Link
                  href={`${AREAS.budget.href}#presupuestos/${budget.id}`}
                  className="grid gap-1.5 hover:opacity-80"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="truncate type-body">
                      {category?.name ?? budget.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <BudgetStateBadge state={usage.state} />
                      <span className="type-amount">
                        {es.planning.budgets.percent(usage.percent)}
                      </span>
                    </span>
                  </span>
                  <ProgressBar
                    percent={usage.percent}
                    tone={budgetBarTone(usage.state)}
                    label={budget.name}
                    valueText={es.planning.budgets.percent(usage.percent)}
                    pace={pace}
                  />
                  <span className="flex flex-wrap justify-between gap-2 type-caption text-ink-2">
                    <span>
                      {usage.state === "exceeded"
                        ? t.budgets.over(money(usage.over))
                        : t.budgets.remaining(money(usage.remaining))}
                    </span>
                    <span>
                      {es.planning.budgets.spentOf(
                        money(usage.spent),
                        money(budget.amount),
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Goals({ data }: { data: DashboardData }) {
  return (
    <section
      aria-labelledby="dash-goals"
      className="desktop:col-span-5"
      data-testid="dashboard-goals"
    >
      <SectionHead
        id="dash-goals"
        title={t.goals.title}
        href={`${AREAS.budget.href}#metas`}
        linkLabel={t.goals.seeAll}
      />
      {data.goals.length === 0 ? (
        <p className="type-body-sm text-ink-2">
          {t.goals.none}{" "}
          <Link
            href={`${AREAS.budget.href}#metas`}
            className="text-forest underline-offset-4 hover:underline"
          >
            {t.goals.create}
          </Link>
        </p>
      ) : (
        <ul className="grid gap-4">
          {data.goals.slice(0, 4).map(({ goal, progress }) => (
            <li key={goal.id} data-testid="dashboard-goal">
              <Link
                href={`${AREAS.budget.href}#metas/${goal.id}`}
                className="grid gap-1.5 hover:opacity-80"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="truncate type-body">{goal.name}</span>
                  <span className="type-amount">
                    <Money
                      amount={progress.saved}
                      currency={goal.currency}
                      cents="auto"
                    />
                  </span>
                </span>
                <ProgressBar
                  percent={progress.percent}
                  tone="forest"
                  label={goal.name}
                  valueText={`${progress.percent} %`}
                />
                <span className="flex flex-wrap justify-between gap-2 type-caption text-ink-2">
                  <span>
                    {progress.reached
                      ? t.goals.reached
                      : t.goals.remaining(
                          formatMoney(progress.remaining, {
                            currency: goal.currency,
                            cents: "auto",
                          }),
                        )}
                  </span>
                  <span>
                    {progress.percent} % ·{" "}
                    {goal.targetDate
                      ? t.goals.due(formatDate(goal.targetDate as LocalDate))
                      : t.goals.noDate}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountsAndCards({ data }: { data: DashboardData }) {
  const balanceOf = (id: string) => data.accountsSummary.byAccount.get(id);
  return (
    <section
      aria-labelledby="dash-accounts"
      className="desktop:col-span-6 desktop:col-start-7"
      data-testid="dashboard-accounts"
    >
      <SectionHead
        id="dash-accounts"
        title={t.accountsCards.title}
        href={AREAS.accounts.href}
        linkLabel={t.accountsCards.seeAccounts}
      />
      <h3 className="sr-only">{t.accountsCards.accounts}</h3>
      {data.activeAccounts.length === 0 ? (
        <p className="type-body-sm text-ink-2">{t.accountsCards.noAccounts}</p>
      ) : (
        <ul>
          {data.activeAccounts.map((a) => {
            const b = balanceOf(a.id);
            return (
              <li
                key={a.id}
                className="border-b border-line last:border-b-0"
                data-testid="dashboard-account"
              >
                <Link
                  href={`${AREAS.accounts.href}/${a.id}`}
                  className="flex items-baseline justify-between gap-3 py-2.5 hover:bg-paper-2"
                >
                  <span className="min-w-0 truncate type-body">{a.name}</span>
                  {b && (
                    <Money
                      amount={b.amount}
                      currency={b.currency}
                      cents="auto"
                      className="type-amount"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-6 mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="type-label text-ink-2">{t.accountsCards.cards}</h3>
        <Link
          href={AREAS.cards.href}
          className="type-body-sm text-forest underline-offset-4 hover:underline"
        >
          {t.accountsCards.seeCards}
        </Link>
      </div>
      {data.dashboardCards.length === 0 ? (
        <p className="type-body-sm text-ink-2">{t.accountsCards.noCards}</p>
      ) : (
        <ul>
          {data.dashboardCards.map(
            ({ card, committed, available, nextDue }) => (
              <li
                key={card.id}
                className="border-b border-line last:border-b-0"
                data-testid="dashboard-card"
              >
                <Link
                  href={`${AREAS.cards.href}/${card.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2.5 hover:bg-paper-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate type-body">
                      {card.name}
                      {card.lastFourDigits && (
                        <span className="text-ink-2">
                          {" "}
                          ·· {card.lastFourDigits}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 type-caption text-ink-2">
                      <Badge tone="neutral">
                        {es.cards.types[card.cardType]}
                      </Badge>
                      {nextDue &&
                        t.accountsCards.due(formatDate(nextDue as LocalDate))}
                    </span>
                  </span>
                  <span className="text-right">
                    {card.cardType === "credit" ? (
                      <>
                        <span className="block type-caption text-ink-2">
                          {t.accountsCards.committed}
                        </span>
                        <Money
                          amount={committed.amount}
                          currency={committed.currency}
                          cents="auto"
                          className="type-amount"
                        />
                        {available !== null && (
                          <span
                            className={cn(
                              "block type-caption",
                              available < 0 ? "text-alert-text" : "text-ink-2",
                            )}
                          >
                            {t.accountsCards.available}:{" "}
                            {formatMoney(available, {
                              currency: card.currency,
                              cents: "auto",
                            })}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="type-caption text-ink-2">
                        {es.cards.types[card.cardType]}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
