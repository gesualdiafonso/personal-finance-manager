"use client";

import { useEffect, useState } from "react";
import { DUE_GROUPS, daysUntilDue, type DueGroup } from "@/domain/rules/bills";
import { ObligationsSwitcher } from "@/components/layout/obligations-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/shared/money";
import { LocalOnlyMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackProvider } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { mutate, useLocalQuery } from "@/hooks/use-local-data";
import { AREAS } from "@/lib/config/navigation";
import { formatDate, type LocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { ensureDefaultCategories } from "@/services/repositories/repositories";
import { BillDetailSheet } from "./bill-detail";
import { NewBillSheet, type BillFormContext } from "./bill-sheet";
import { BillStatusBadge } from "./bill-status";
import {
  categoryLabel,
  loadBillsView,
  type BillRow,
  type BillsView,
} from "./data";

const t = es.bills;
const PAID_PAGE = 10;

/**
 * Cuentas domésticas (Obligaciones · "Calendário de obrigações"): indicators per currency,
 * then pending bills grouped by due date (Vencidas · Hoy · Próximos 7 días · Próximos 30 días
 * · Después), then paid and cancelled ones. A click opens the detail in the side sheet.
 */
export function BillsPage() {
  return (
    <FeedbackProvider>
      <BillsContent />
    </FeedbackProvider>
  );
}

function BillsContent() {
  const query = useLocalQuery((db) => loadBillsView(db), []);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = query.status === "ready" ? query.data : null;

  // Initial categories, once per device with none (D4-09): bills use expense categories.
  useEffect(() => {
    void mutate((_r, db) => ensureDefaultCategories({ db })).catch(
      () => undefined,
    );
  }, []);

  const context: BillFormContext | null = data && {
    accounts: data.accounts,
    allAccounts: data.allAccounts,
    categories: data.categories,
    allCategories: data.allCategories,
    today: data.today,
    baseCurrency: data.settings.baseCurrency,
  };
  const selected =
    data && selectedId
      ? (data.rows.find((r) => r.bill.id === selectedId) ?? null)
      : null;

  return (
    <>
      <PageHeader
        label={es.nav.groups.obligations}
        title={AREAS.bills.label}
        actions={
          data &&
          data.rows.length > 0 && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t.newBill}
            </Button>
          )
        }
      />
      <ObligationsSwitcher current="bills" />
      <p className="-mt-4 mb-8 max-w-[60ch] type-body text-ink-2 desktop:-mt-8 desktop:mb-10">
        {t.description}
      </p>

      {query.status === "loading" && (
        <div data-testid="bills-loading" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-12 w-64" />
          <div className="mt-10 grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
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
      {data && context && (
        <>
          {data.invalid > 0 && (
            <p role="alert" className="mb-6 type-body-sm text-alert-text">
              {t.invalidRecords(data.invalid)}
            </p>
          )}
          {data.rows.length === 0 ? (
            <section
              aria-labelledby="sin-cuentas"
              className="max-w-[60ch]"
              data-testid="bills-empty"
            >
              <h2 id="sin-cuentas" className="type-heading">
                {t.empty.title}
              </h2>
              <p className="mt-2 mb-5 type-body text-ink-2">{t.empty.body}</p>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t.empty.action}
              </Button>
            </section>
          ) : (
            <BillsBody
              view={data}
              onOpen={(row) => setSelectedId(row.bill.id)}
            />
          )}
          <NewBillSheet
            open={creating}
            context={context}
            onClose={() => setCreating(false)}
          />
          <BillDetailSheet
            row={selected}
            context={context}
            onClose={() => setSelectedId(null)}
          />
        </>
      )}
    </>
  );
}

function Indicators({ view }: { view: BillsView }) {
  const { indicators } = view;
  const [hero, ...others] = indicators.byCurrency.filter(
    (r) => r.pendingCount > 0,
  );
  return (
    <section
      aria-label={t.indicators.label}
      className="mb-12 grid gap-8 desktop:grid-cols-12"
      data-testid="bills-indicators"
    >
      <div className="desktop:col-span-7">
        <h2 className="type-label text-ink-2">{t.indicators.pending}</h2>
        <p
          className="mt-3 type-display-hero-mobile desktop:type-display-hero"
          data-testid="bills-pending-total"
        >
          {hero ? (
            <Money
              amount={hero.pending}
              currency={hero.currency}
              cents="auto"
            />
          ) : (
            <span className="text-ink-2">$ 0</span>
          )}
        </p>
        {others.map((r) => (
          <p key={r.currency} className="mt-2 type-amount-lg">
            <Money amount={r.pending} currency={r.currency} cents="auto" />
          </p>
        ))}
        <p className="mt-4 type-body-sm text-ink-2" data-testid="bills-counts">
          {indicators.pendingCount > 0
            ? t.indicators.counts(
                indicators.pendingCount,
                indicators.overdueCount,
              )
            : t.indicators.none}
        </p>
        {indicators.byCurrency.length > 1 && (
          <p className="mt-1 type-caption text-ink-2">
            {t.indicators.perCurrency}
          </p>
        )}
      </div>
      <div className="grid content-start gap-6 desktop:col-span-5 desktop:border-l desktop:border-line desktop:pl-8">
        {indicators.overdueCount > 0 && (
          <div data-testid="bills-overdue-total">
            <h3 className="type-label text-alert-text">
              {t.indicators.overdue}
            </h3>
            <p className="mt-1 inline-flex flex-wrap gap-x-3 type-amount-lg text-alert-text">
              {indicators.byCurrency
                .filter((r) => r.overdueCount > 0)
                .map((r) => (
                  <Money
                    key={r.currency}
                    amount={r.overdue}
                    currency={r.currency}
                    cents="auto"
                  />
                ))}
            </p>
          </div>
        )}
        <div data-testid="bills-paid-month">
          <h3 className="type-label text-ink-2">{t.indicators.paidInMonth}</h3>
          <p className="mt-1 inline-flex flex-wrap gap-x-3 type-amount-lg">
            {indicators.byCurrency.some((r) => r.paidInPeriod > 0) ? (
              indicators.byCurrency
                .filter((r) => r.paidInPeriod > 0)
                .map((r) => (
                  <Money
                    key={r.currency}
                    amount={r.paidInPeriod}
                    currency={r.currency}
                    cents="auto"
                  />
                ))
            ) : (
              <span className="text-ink-2">$ 0</span>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

function BillsBody({
  view,
  onOpen,
}: {
  view: BillsView;
  onOpen: (row: BillRow) => void;
}) {
  const [paidShown, setPaidShown] = useState(PAID_PAGE);
  const pending = (group: DueGroup) =>
    view.rows.filter((r) => r.group === group);
  const paid = view.rows.filter((r) => r.bill.status === "paid");
  const cancelled = view.rows.filter((r) => r.bill.status === "cancelled");
  return (
    <>
      <Indicators view={view} />
      {DUE_GROUPS.map((group) => (
        <BillSection
          key={group}
          id={`bills-${group}`}
          title={t.groups[group]}
          rows={pending(group)}
          view={view}
          onOpen={onOpen}
          alert={group === "overdue"}
        />
      ))}
      <BillSection
        id="bills-paid"
        title={t.groups.paid}
        rows={paid.slice(0, paidShown)}
        view={view}
        onOpen={onOpen}
        muted
      />
      {paid.length > paidShown && (
        <Button
          className="-mt-6 mb-10"
          variant="ghost"
          onClick={() => setPaidShown((n) => n + PAID_PAGE)}
        >
          {es.transactions.list.showMore(paid.length - paidShown)}
        </Button>
      )}
      <BillSection
        id="bills-cancelled"
        title={t.groups.cancelled(cancelled.length)}
        rows={cancelled}
        view={view}
        onOpen={onOpen}
        muted
      />
    </>
  );
}

function BillSection({
  id,
  title,
  rows,
  view,
  onOpen,
  alert = false,
  muted = false,
}: {
  id: string;
  title: string;
  rows: BillRow[];
  view: BillsView;
  onOpen: (row: BillRow) => void;
  alert?: boolean;
  muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-title`} className="mb-10" data-testid={id}>
      <h2
        id={`${id}-title`}
        className={cn(
          "mb-3 type-subheading",
          alert && "text-alert-text",
          muted && "text-ink-2",
        )}
      >
        {title}
      </h2>
      <ul className="rounded-md bg-surface">
        {rows.map((row) => (
          <li
            key={row.bill.id}
            className="border-b border-line last:border-b-0"
          >
            <BillLine row={row} view={view} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BillLine({
  row,
  view,
  onOpen,
}: {
  row: BillRow;
  view: BillsView;
  onOpen: (row: BillRow) => void;
}) {
  const { bill } = row;
  const closed = bill.status !== "pending";
  const days = daysUntilDue(bill.dueDate, view.today);
  const category = categoryLabel(row.category, view.allCategories);
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-paper-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring tablet:grid-cols-[7.5rem_1fr_auto_9rem]"
      data-testid="bill-row"
    >
      <span className="order-3 type-body-sm text-ink-2 tablet:order-none">
        <span className="num">{formatDate(bill.dueDate as LocalDate)}</span>
        {!closed && <span className="block type-caption">{t.dueIn(days)}</span>}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate type-body",
            bill.status === "cancelled" && "text-ink-2 line-through",
          )}
        >
          {bill.name}
        </span>
        <span className="block truncate type-caption text-ink-2">
          {[category, row.account?.name].filter(Boolean).join(" · ") || " "}
        </span>
        {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
      </span>
      <span className="order-4 justify-self-end tablet:order-none tablet:justify-self-start">
        <BillStatusBadge row={row} />
      </span>
      <span className={cn("text-right type-amount", closed && "text-ink-2")}>
        <Money
          amount={closed ? bill.amount : row.balance.remaining}
          currency={bill.currency}
        />
        {!closed && row.balance.paid > 0 && (
          <span className="block type-caption text-ink-2">
            <Money amount={bill.amount} currency={bill.currency} />
          </span>
        )}
      </span>
    </button>
  );
}
