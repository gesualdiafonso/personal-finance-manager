"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cardTypesOf } from "@/domain/rules/balances";
import {
  filterTransactions,
  NO_TRANSACTION_FILTERS,
  periodRange,
  sortTransactions,
  summarizeTransactions,
} from "@/domain/rules/transactions";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FeedbackProvider } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { mutate, useLocalQuery } from "@/hooks/use-local-data";
import { AREAS } from "@/lib/config/navigation";
import { toLocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { ensureDefaultCategories } from "@/services/repositories/repositories";
import { getFinancialSettings } from "@/services/storage/local-store";
import { FiltersBar, type ListState } from "./filters-bar";
import { Ledger } from "./ledger";
import { loadTransactionList } from "./list-data";
import { NEW_TRANSACTION_EVENT } from "./new-transaction";
import { TransactionsSummary } from "./summary";
import { TransactionSheet } from "./transaction-sheet";
import { TransactionDetailSheet } from "./transaction-detail";
import type { Transaction } from "@/domain/schemas";

const t = es.transactions;
const INITIAL: ListState = {
  filters: NO_TRANSACTION_FILTERS,
  period: "month",
  custom: { from: "", to: "" },
  order: "dateDesc",
};

/**
 * Transactions (D4-10…D4-15): header with the one primary action, search/period/filters/order,
 * the summary of what is listed (per currency) and the Ledger. Only the selected period is read
 * from IndexedDB; search waits 250 ms after the last key; filters, sorting and totals are domain
 * functions over the loaded period, so the list and the totals always agree.
 */
export function TransactionsPage() {
  return (
    <FeedbackProvider>
      <TransactionsContent />
    </FeedbackProvider>
  );
}

function TransactionsContent() {
  const [state, setState] = useState<ListState>(INITIAL);
  const [today, setToday] = useState<string | null>(null);
  const query = useDebouncedValue(state.filters.query, 250);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openSheet = useCallback(() => setOpen(true), []);

  // "Today" is a Buenos Aires calendar date, read on the client only (never at build time).
  useEffect(() => {
    const id = setTimeout(() => setToday(toLocalDate(new Date())), 0);
    return () => clearTimeout(id);
  }, []);

  // The week starts on the day set in Financial Settings (default Monday).
  const settings = useLocalQuery((db) => getFinancialSettings(db), []);
  const firstDayOfWeek =
    settings.status === "ready"
      ? (settings.data?.firstDayOfWeek ??
        DEFAULT_FINANCIAL_SETTINGS.firstDayOfWeek)
      : undefined;
  const range =
    today && firstDayOfWeek
      ? periodRange(state.period, today, {
          custom: state.custom,
          firstDayOfWeek,
        })
      : undefined;
  const from = range === undefined ? "pending" : (range?.from ?? "");
  const to = range === undefined ? "pending" : (range?.to ?? "");
  const data = useLocalQuery(
    (db) =>
      range === undefined
        ? Promise.resolve(undefined)
        : loadTransactionList(db, range),
    [from, to],
  );

  // Initial categories, once per device with none (D4-09).
  useEffect(() => {
    void mutate((_r, db) => ensureDefaultCategories({ db })).catch(
      () => undefined,
    );
  }, []);

  // Global "Nueva transacción" (D4-15): the event on this page, the hash when arriving.
  useEffect(() => {
    window.addEventListener(NEW_TRANSACTION_EVENT, openSheet);
    if (window.location.hash === "#nueva") {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
      window.dispatchEvent(new Event(NEW_TRANSACTION_EVENT));
    }
    return () => window.removeEventListener(NEW_TRANSACTION_EVENT, openSheet);
  }, [openSheet]);

  const loaded = data.status === "ready" ? data.data : undefined;
  const listed = useMemo(() => {
    if (!loaded) return null;
    const filtered = filterTransactions(
      loaded.transactions,
      { ...state.filters, query },
      loaded.lookups,
    );
    return {
      rows: sortTransactions(filtered, state.order),
      totals: summarizeTransactions(
        filtered,
        state.filters.status,
        loaded.settings.baseCurrency,
      ),
      cardTypes: cardTypesOf(loaded.cards),
    };
  }, [loaded, state.filters, state.order, query]);

  const hasAccounts = Boolean(loaded && loaded.form.accounts.length > 0);
  const loading =
    data.status === "loading" || (data.status === "ready" && !loaded);

  return (
    <>
      <PageHeader
        title={AREAS.transactions.label}
        actions={
          loaded &&
          hasAccounts &&
          loaded.anyOnDevice && (
            <Button variant="primary" onClick={openSheet}>
              {t.newTransaction}
            </Button>
          )
        }
      />
      <p className="-mt-4 mb-8 max-w-[60ch] type-body text-ink-2 desktop:-mt-8 desktop:mb-10">
        {t.description}
      </p>

      {loading && !loaded && (
        <div data-testid="transactions-loading" aria-busy="true">
          <Skeleton className="mb-6 h-10 w-full" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="mb-3 h-12 w-full" />
          ))}
        </div>
      )}
      {data.status === "error" && (
        <section role="alert">
          <p className="type-body text-alert-text">
            {data.error.code === "STORAGE_UNAVAILABLE"
              ? es.accounts.storageUnavailable
              : t.loadError}
          </p>
          <Button className="mt-4" onClick={data.reload}>
            {es.common.retry}
          </Button>
        </section>
      )}
      {loaded && !hasAccounts && !loaded.anyOnDevice && (
        <section className="max-w-[60ch]" data-testid="transactions-empty">
          <h2 className="type-heading">{t.empty.needAccountTitle}</h2>
          <p className="mt-2 mb-5 type-body text-ink-2">
            {t.empty.needAccountBody}
          </p>
          <Button asChild variant="primary">
            <Link href={AREAS.accounts.href}>{t.empty.needAccountAction}</Link>
          </Button>
        </section>
      )}
      {loaded && hasAccounts && !loaded.anyOnDevice && (
        <section className="max-w-[60ch]" data-testid="transactions-empty">
          <h2 className="type-heading">{t.empty.title}</h2>
          <p className="mt-2 mb-5 type-body text-ink-2">{t.empty.body}</p>
          <Button variant="primary" onClick={openSheet}>
            {t.empty.action}
          </Button>
        </section>
      )}
      {loaded && loaded.anyOnDevice && listed && today && (
        <>
          <FiltersBar
            state={state}
            onChange={setState}
            onClear={() => setState(INITIAL)}
            accounts={loaded.accounts}
            categories={loaded.categories}
            cards={loaded.cards}
            results={listed.rows.length}
          />
          <TransactionsSummary
            totals={listed.totals}
            status={state.filters.status}
          />
          {listed.rows.length === 0 ? (
            <div data-testid="transactions-no-results">
              <p className="type-body text-ink-2">{t.list.noResults}</p>
              <Button className="mt-3" onClick={() => setState(INITIAL)}>
                {t.list.clear}
              </Button>
            </div>
          ) : (
            <Ledger
              key={`${from}|${to}|${state.order}|${JSON.stringify(state.filters)}`}
              transactions={listed.rows}
              order={state.order}
              lookups={loaded.lookups}
              cardTypes={listed.cardTypes}
              localOnly={loaded.localOnly}
              today={today}
              onOpen={(tx: Transaction) => setSelectedId(tx.id)}
            />
          )}
        </>
      )}

      {loaded && hasAccounts && (
        <TransactionSheet
          open={open}
          data={loaded.form}
          onClose={() => setOpen(false)}
        />
      )}
      {loaded && listed && (
        <TransactionDetailSheet
          // Always the stored version: after an edit the list re-reads it (fresh rev).
          transaction={
            selectedId
              ? (loaded.transactions.find((x) => x.id === selectedId) ?? null)
              : null
          }
          context={{
            accounts: loaded.accounts,
            categories: loaded.categories,
            cards: loaded.cards,
            cardTypes: listed.cardTypes,
            form: loaded.form,
          }}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
