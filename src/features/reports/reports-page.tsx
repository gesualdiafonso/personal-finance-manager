"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { CurrencyCode } from "@/domain/currency";
import { shiftPeriod } from "@/domain/rules/dashboard";
import {
  REPORT_COMPARISONS,
  REPORT_GRANULARITIES,
  REPORT_TYPES,
  reportRange,
  type DateRange,
  type ReportComparison,
  type ReportFilters,
  type ReportGranularity,
  type ReportType,
} from "@/domain/rules/reports";
import type { Category } from "@/domain/schemas";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FeedbackProvider, useFeedback } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalQuery } from "@/hooks/use-local-data";
import { APP_CONFIG } from "@/lib/config/app";
import { AREAS } from "@/lib/config/navigation";
import {
  formatDate,
  formatMonthTitle,
  isLocalDate,
  TIME_ZONE,
  type LocalDate,
} from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { buildReport, type Report } from "@/services/reports/build-report";
import {
  downloadFile,
  reportFileName,
  reportJson,
  summaryCsv,
  transactionsCsv,
} from "@/services/reports/export";
import { PrintModeContext } from "./charts";
import { loadReports, type ReportsData } from "./data";
import {
  AccountsSection,
  BudgetsSection,
  CardsSection,
  CashFlowSection,
  CategoriesSection,
  GoalsSection,
  REPORT_TABS,
  SummarySection,
  type ReportTab,
  type SectionProps,
} from "./sections";
import { Note } from "./ui";

const t = es.reports;

/**
 * Informes (archetype "Análise", arquitetura.md): chart first, full width, with the period
 * selector and the comparison; the support table below. "Como evoluí?".
 * Everything is computed on this device from one IndexedDB read (loadReports → buildReport);
 * changing a filter recomputes without reading again, and any change in the data re-reads.
 */
export function ReportsPage() {
  return (
    <FeedbackProvider>
      <ReportsContent />
    </FeedbackProvider>
  );
}

function ReportsContent() {
  const query = useLocalQuery((db) => loadReports(db), []);
  return (
    <>
      <PageHeader label={t.label} title={AREAS.reports.label} />
      {query.status === "loading" && (
        <div data-testid="reports-loading" aria-busy="true">
          <Skeleton className="h-9 w-96 max-w-full" />
          <Skeleton className="mt-10 h-64 w-full" />
          <div className="mt-10 grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      )}
      {query.status === "error" && (
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
      )}
      {query.status === "ready" &&
        (query.data.empty ? (
          <section className="max-w-[60ch]" data-testid="reports-empty">
            <p className="type-body text-ink-2">{t.empty}</p>
            <Link
              href={AREAS.accounts.href}
              className="mt-4 inline-block type-body-sm text-forest underline-offset-4 hover:underline"
            >
              {t.emptyAction}
            </Link>
          </section>
        ) : (
          <Reports data={query.data} />
        ))}
    </>
  );
}

interface ControlsState {
  granularity: ReportGranularity;
  anchor: string;
  custom: DateRange;
  comparison: ReportComparison;
  categoryId: string | null;
  accountId: string | null;
  type: ReportType;
}

function periodTitle(
  granularity: ReportGranularity,
  range: DateRange,
  today: string,
): string {
  const year = range.from.slice(0, 4);
  const d = (x: string) => formatDate(x as LocalDate);
  switch (granularity) {
    case "week":
      return es.dashboard.period.week(d(range.from), d(range.to));
    case "month":
      return year === today.slice(0, 4)
        ? formatMonthTitle(range.from as LocalDate)
        : `${formatMonthTitle(range.from as LocalDate)} ${year}`;
    case "quarter":
      return es.dashboard.period.quarter(
        Math.floor((Number(range.from.slice(5, 7)) - 1) / 3) + 1,
        Number(year),
      );
    case "year":
      return year;
    case "custom":
      return t.period.custom(
        formatDate(range.from as LocalDate, "form"),
        formatDate(range.to as LocalDate, "form"),
      );
  }
}

function Reports({ data }: { data: ReportsData }) {
  const { today, settings } = data;
  const notify = useFeedback();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [state, setState] = useState<ControlsState>({
    granularity: "month",
    anchor: today,
    custom: { from: monthStart, to: today },
    comparison: "previous",
    categoryId: null,
    accountId: null,
    type: "all",
  });
  const [tab, setTab] = useState<ReportTab>("summary");
  const [chosenCurrency, setCurrency] = useState<CurrencyCode>(
    settings.baseCurrency,
  );
  const [printAll, setPrintAll] = useState(false);

  const filters: ReportFilters = useMemo(
    () => ({
      range: reportRange(state.granularity, state.anchor, {
        firstDayOfWeek: settings.firstDayOfWeek,
        custom: state.custom,
      }),
      granularity: state.granularity,
      comparison: state.comparison,
      categoryId: state.categoryId,
      accountId: state.accountId,
      type: state.type,
    }),
    [state, settings.firstDayOfWeek],
  );
  const range = filters.range;
  const report = useMemo(() => buildReport(data, filters), [data, filters]);
  const currency = report.currencies.includes(chosenCurrency)
    ? chosenCurrency
    : (report.currencies[0] ?? settings.baseCurrency);
  const title = periodTitle(state.granularity, range, today);
  const set = (patch: Partial<ControlsState>) =>
    setState((s) => ({ ...s, ...patch }));

  // Printing (or "Guardar como PDF" in the print dialog) shows every section, not only the open
  // one. flushSync renders them before the browser takes the print snapshot (Ctrl+P too).
  useEffect(() => {
    const before = () => flushSync(() => setPrintAll(true));
    const after = () => setPrintAll(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const exportAs = (kind: "transactions" | "summary" | "json") => {
    try {
      const name =
        kind === "json"
          ? reportFileName(report, "informe", "json")
          : reportFileName(
              report,
              kind === "transactions" ? "transacciones" : "resumen",
              "csv",
            );
      const content =
        kind === "json"
          ? reportJson(report)
          : kind === "transactions"
            ? transactionsCsv(report)
            : summaryCsv(report);
      downloadFile(
        name,
        content,
        kind === "json"
          ? "application/json;charset=utf-8"
          : "text/csv;charset=utf-8",
      );
      notify(t.export.done(name));
    } catch {
      notify(t.export.failed, "error");
    }
  };
  const print = () => {
    flushSync(() => setPrintAll(true));
    window.print();
    setPrintAll(false);
  };

  const props: SectionProps = { report, currency, today, onTab: setTab };
  const sections: Record<ReportTab, ReactNode> = {
    summary: <SummarySection {...props} />,
    cashflow: <CashFlowSection {...props} />,
    categories: <CategoriesSection {...props} />,
    accounts: <AccountsSection {...props} />,
    cards: <CardsSection {...props} />,
    budgets: <BudgetsSection {...props} />,
    goals: <GoalsSection {...props} />,
  };

  return (
    <div data-testid="reports">
      <p className="-mt-4 mb-6 max-w-[60ch] type-body text-ink-2 desktop:-mt-8 print:hidden">
        {t.description}
      </p>
      <PrintHeader report={report} title={title} currency={currency} />

      <div
        className="mb-8 grid gap-5 print:hidden"
        data-testid="report-controls"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="type-heading" data-testid="report-title">
            {title}
          </h2>
          <PeriodControl
            state={state}
            range={range}
            today={today}
            firstDayOfWeek={settings.firstDayOfWeek}
            onChange={set}
          />
        </div>
        {state.granularity === "custom" && (
          <CustomRange
            value={state.custom}
            onChange={(custom) => set({ custom })}
          />
        )}
        <Filters
          state={state}
          data={data}
          onChange={set}
          currencies={report.currencies}
          currency={currency}
          onCurrency={setCurrency}
        />
        <p className="type-caption text-ink-2" data-testid="comparison-range">
          {t.filters.comparedWith(
            formatDate(report.previousRange.from as LocalDate, "form"),
            formatDate(report.previousRange.to as LocalDate, "form"),
          )}
        </p>
      </div>

      {(report.timing !== "past" || report.reliability.pending) && (
        <div className="-mt-4 mb-8" data-testid="reliability">
          {report.timing === "current" && (
            <Note tone="warning">{t.period.inProgress}</Note>
          )}
          {report.timing === "future" && (
            <Note tone="warning">{t.period.future}</Note>
          )}
        </div>
      )}

      {printAll ? (
        <PrintModeContext.Provider value={true}>
          <div className="grid gap-16" data-testid="print-all">
            {REPORT_TABS.map((id) => (
              <section
                key={id}
                aria-label={t.tabs[id]}
                className="break-before-page first:break-before-auto"
              >
                <h2 className="mb-6 type-heading">{t.tabs[id]}</h2>
                {sections[id]}
              </section>
            ))}
          </div>
        </PrintModeContext.Provider>
      ) : (
        <>
          <div className="-mx-4 mb-8 overflow-x-auto px-4 tablet:mx-0 tablet:px-0 print:hidden">
            <div
              role="tablist"
              aria-label={t.tabs.label}
              className="flex min-w-max gap-6 border-b border-line"
            >
              {REPORT_TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`report-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`report-panel-${id}`}
                  onClick={() => setTab(id)}
                  className={cn(
                    "-mb-px h-11 border-b-2 border-transparent type-nav text-ink-2 hover:text-ink",
                    tab === id && "border-ink text-ink",
                  )}
                >
                  {t.tabs[id]}
                </button>
              ))}
            </div>
          </div>
          <div
            role="tabpanel"
            id={`report-panel-${tab}`}
            aria-labelledby={`report-tab-${tab}`}
          >
            {sections[tab]}
          </div>
        </>
      )}

      <section
        aria-labelledby="rep-export"
        className="mt-16 border-t border-line pt-6 print:hidden"
        data-testid="report-export"
      >
        <h2 id="rep-export" className="type-label text-ink-2">
          {t.export.title}
        </h2>
        <p
          className="mt-2 max-w-[70ch] type-body-sm text-warning-text"
          data-testid="export-warning"
        >
          {t.export.warning}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => exportAs("transactions")}>
            {t.export.transactionsCsv}
          </Button>
          <Button onClick={() => exportAs("summary")}>
            {t.export.summaryCsv}
          </Button>
          <Button onClick={() => exportAs("json")}>{t.export.json}</Button>
          <Button onClick={print}>{t.export.print}</Button>
        </div>
      </section>
    </div>
  );
}

/** Only on paper / PDF: what, when, which currency, and that the file is not encrypted. */
function PrintHeader({
  report,
  title,
  currency,
}: {
  report: Report;
  title: string;
  currency: CurrencyCode;
}) {
  const [now] = useState(() => new Date());
  // Buenos Aires wall clock, whatever the device time zone is.
  const when = new Intl.DateTimeFormat(APP_CONFIG.locale, {
    timeZone: TIME_ZONE,
    dateStyle: "long",
    timeStyle: "short",
  }).format(now);
  return (
    <div
      className="mb-8 hidden border-b border-line pb-4 print:block"
      data-testid="print-header"
    >
      <p className="type-label text-ink-2">{t.print.title}</p>
      <p className="type-heading">{title}</p>
      <p className="type-body-sm text-ink-2">
        {formatDate(report.range.from as LocalDate, "form")} –{" "}
        {formatDate(report.range.to as LocalDate, "form")} ·{" "}
        {t.filters.comparedWith(
          formatDate(report.previousRange.from as LocalDate, "form"),
          formatDate(report.previousRange.to as LocalDate, "form"),
        )}
      </p>
      <p className="type-body-sm text-ink-2">
        {t.print.currency(es.common.currencies[currency])} ·{" "}
        {t.print.generated(when)}
      </p>
      {(report.filters.categoryId ||
        report.filters.accountId ||
        report.filters.type !== "all") && (
        <p className="type-body-sm text-ink-2">
          {[
            report.filters.categoryId &&
              `${t.filters.category}: ${report.lookups.category(report.filters.categoryId)}`,
            report.filters.accountId &&
              `${t.filters.account}: ${report.lookups.account(report.filters.accountId)}`,
            report.filters.type !== "all" &&
              `${t.filters.type}: ${t.filters.types[report.filters.type]}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p className="type-body-sm font-semibold">{t.print.sensitive}</p>
    </div>
  );
}

function PeriodControl({
  state,
  range,
  today,
  firstDayOfWeek,
  onChange,
}: {
  state: ControlsState;
  range: DateRange;
  today: string;
  firstDayOfWeek: "monday" | "sunday";
  onChange: (patch: Partial<ControlsState>) => void;
}) {
  const g = state.granularity;
  const isCurrent = range.from <= today && today <= range.to;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="report-period"
    >
      <div
        role="group"
        aria-label={t.period.label}
        className="grid grid-cols-4 rounded-sm bg-paper-2 p-0.75"
      >
        {REPORT_GRANULARITIES.filter((x) => x !== "custom").map((x) => (
          <button
            key={x}
            type="button"
            aria-pressed={x === g}
            onClick={() =>
              onChange({
                granularity: x,
                anchor: g === "custom" ? range.to : state.anchor,
              })
            }
            className={cn(
              "grid h-8 place-items-center rounded-xs px-2.5 type-body-sm text-ink-2",
              x === g && "bg-surface font-semibold text-ink ring-1 ring-line",
            )}
          >
            {t.period.granularity[x]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {/* A custom range is a different kind of choice: its own toggle, next to the calendar periods. */}
        <button
          type="button"
          aria-pressed={g === "custom"}
          onClick={() =>
            g !== "custom" &&
            onChange({ granularity: "custom", custom: { ...range } })
          }
          className={cn(
            "h-9 rounded-sm px-2.5 type-body-sm text-ink-2 hover:bg-paper-2",
            g === "custom" && "bg-lake-tint font-semibold text-lake",
          )}
        >
          {t.period.granularity.custom}
        </button>
        {g !== "custom" && (
          <>
            <Button
              variant="ghost"
              aria-label={es.dashboard.period.previous}
              onClick={() =>
                onChange({
                  anchor: shiftPeriod(g, range, -1, firstDayOfWeek).from,
                })
              }
            >
              ‹
            </Button>
            {!isCurrent && (
              <Button
                variant="ghost"
                onClick={() => onChange({ anchor: today })}
              >
                {es.dashboard.period.current}
              </Button>
            )}
            <Button
              variant="ghost"
              aria-label={es.dashboard.period.next}
              onClick={() =>
                onChange({
                  anchor: shiftPeriod(g, range, 1, firstDayOfWeek).from,
                })
              }
            >
              ›
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function CustomRange({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  // Only valid calendar dates are applied; an incomplete date keeps the previous range.
  const update = (k: keyof DateRange, v: string) => {
    if (isLocalDate(v)) onChange({ ...value, [k]: v });
  };
  return (
    <div
      className="grid max-w-[32rem] grid-cols-2 gap-4"
      data-testid="custom-range"
    >
      <Field label={t.period.from}>
        {(p) => (
          <Input
            {...p}
            type="date"
            value={value.from}
            onChange={(e) => update("from", e.target.value)}
          />
        )}
      </Field>
      <Field label={t.period.to}>
        {(p) => (
          <Input
            {...p}
            type="date"
            value={value.to}
            onChange={(e) => update("to", e.target.value)}
          />
        )}
      </Field>
    </div>
  );
}

function Filters({
  state,
  data,
  onChange,
  currencies,
  currency,
  onCurrency,
}: {
  state: ControlsState;
  data: ReportsData;
  onChange: (patch: Partial<ControlsState>) => void;
  currencies: CurrencyCode[];
  currency: CurrencyCode;
  onCurrency: (c: CurrencyCode) => void;
}) {
  const byId = new Map(data.categories.map((c) => [c.id, c]));
  const label = (c: Category) =>
    c.parentId && byId.get(c.parentId)
      ? `${byId.get(c.parentId)!.name} › ${c.name}`
      : c.name;
  const categories = [...data.categories].sort(
    (a, b) =>
      a.type.localeCompare(b.type) || label(a).localeCompare(label(b), "es-AR"),
  );
  const active = [
    state.categoryId !== null,
    state.accountId !== null,
    state.type !== "all",
  ].filter(Boolean).length;
  const any = active > 0;
  // On the phone the narrowing filters fold behind "Más filtros" (as in Transacciones).
  const [more, setMore] = useState(false);
  return (
    <div
      role="search"
      aria-label={t.filters.label}
      className="grid gap-4"
      data-testid="report-filters"
    >
      <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        <Field label={t.filters.comparison}>
          {(p) => (
            <Select
              {...p}
              value={state.comparison}
              onChange={(e) =>
                onChange({ comparison: e.target.value as ReportComparison })
              }
            >
              {REPORT_COMPARISONS.map((c) => (
                <option key={c} value={c}>
                  {t.filters.comparisons[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button
          variant="ghost"
          className="justify-self-start tablet:hidden"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
        >
          {es.transactions.list.moreFilters(active)}
        </Button>
        <div
          className={cn("gap-4 tablet:contents", more ? "grid" : "hidden")}
          data-testid="more-report-filters"
        >
          <Field label={t.filters.category}>
            {(p) => (
              <Select
                {...p}
                value={state.categoryId ?? ""}
                onChange={(e) =>
                  onChange({ categoryId: e.target.value || null })
                }
              >
                <option value="">{t.filters.allCategories}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {label(c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t.filters.account}>
            {(p) => (
              <Select
                {...p}
                value={state.accountId ?? ""}
                onChange={(e) =>
                  onChange({ accountId: e.target.value || null })
                }
              >
                <option value="">{t.filters.allAccounts}</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t.filters.type}>
            {(p) => (
              <Select
                {...p}
                value={state.type}
                onChange={(e) =>
                  onChange({ type: e.target.value as ReportType })
                }
              >
                {REPORT_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t.filters.types[x]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {currencies.length > 1 ? (
          <div
            role="group"
            aria-label={t.filters.currency}
            className="flex items-center gap-1"
            data-testid="report-currency"
          >
            <span className="mr-2 type-label text-ink-2">
              {t.filters.currency}
            </span>
            {currencies.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === currency}
                onClick={() => onCurrency(c)}
                className={cn(
                  "h-8 rounded-xs px-2.5 type-body-sm text-ink-2",
                  c === currency && "bg-paper-2 font-semibold text-ink",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {any && (
          <Button
            variant="ghost"
            onClick={() =>
              onChange({ categoryId: null, accountId: null, type: "all" })
            }
          >
            {t.filters.clear}
          </Button>
        )}
      </div>
    </div>
  );
}
