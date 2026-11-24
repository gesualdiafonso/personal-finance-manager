"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/shared/money";
import { Badge, LocalOnlyMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackProvider, useFeedback } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { mutate, useLocalQuery } from "@/hooks/use-local-data";
import { AREAS } from "@/lib/config/navigation";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { AccountSheet } from "./account-sheet";
import { loadAccountsView, type AccountRow, type AccountsView } from "./data";

const t = es.accounts;

/**
 * Accounts (Patrimonio · "¿Dónde está el dinero?"). Collection page: header with the one
 * primary action, the balance per currency as the single hero (O-02, D3-08), the other
 * indicators as one line of facts (no KPI cards, P-05/P-13), then the list — a table on
 * desktop, a list on the phone (O-12). Archived accounts stay listed in their own section.
 */
export function AccountsPage() {
  return (
    <FeedbackProvider>
      <AccountsContent />
    </FeedbackProvider>
  );
}

function AccountsContent() {
  const query = useLocalQuery(loadAccountsView, []);
  const [sheet, setSheet] = useState<{ open: boolean; row: AccountRow | null }>(
    { open: false, row: null },
  );
  const openCreate = () => setSheet({ open: true, row: null });
  const openEdit = (row: AccountRow) => setSheet({ open: true, row });
  const hasAccounts =
    query.status === "ready" &&
    query.data.active.length + query.data.archived.length > 0;

  return (
    <>
      <PageHeader
        label={t.label}
        title={AREAS.accounts.label}
        actions={
          hasAccounts && (
            <Button variant="primary" onClick={openCreate}>
              {t.newAccount}
            </Button>
          )
        }
      />
      <p className="-mt-4 mb-8 max-w-[60ch] type-body text-ink-2 desktop:-mt-8 desktop:mb-10">
        {t.description}
      </p>

      {query.status === "loading" && <LoadingState />}
      {query.status === "error" && (
        <section role="alert" className="max-w-[60ch]">
          <p className="type-body text-alert-text">
            {query.error.code === "STORAGE_UNAVAILABLE"
              ? t.storageUnavailable
              : t.loadError}
          </p>
          <Button className="mt-4" onClick={query.reload}>
            {es.common.retry}
          </Button>
        </section>
      )}
      {query.status === "ready" && (
        <>
          {query.data.invalid > 0 && (
            <p role="alert" className="mb-6 type-body-sm text-alert-text">
              {t.invalidRecords(query.data.invalid)}
            </p>
          )}
          {hasAccounts ? (
            <AccountsBody view={query.data} onEdit={openEdit} />
          ) : (
            <EmptyState onCreate={openCreate} />
          )}
        </>
      )}

      <AccountSheet
        open={sheet.open}
        row={sheet.row}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

function LoadingState() {
  return (
    <div data-testid="accounts-loading" aria-busy="true">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-12 w-72" />
      <Skeleton className="mt-4 h-4 w-80" />
      <div className="mt-10 grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section
      aria-labelledby="sin-cuentas"
      className="max-w-[60ch]"
      data-testid="accounts-empty"
    >
      <h2 id="sin-cuentas" className="type-heading">
        {t.empty.title}
      </h2>
      <p className="mt-2 mb-5 type-body text-ink-2">{t.empty.body}</p>
      <Button variant="primary" onClick={onCreate}>
        {t.empty.action}
      </Button>
    </section>
  );
}

function AccountsBody({
  view,
  onEdit,
}: {
  view: AccountsView;
  onEdit: (row: AccountRow) => void;
}) {
  const { summary } = view;
  const [hero, ...others] = summary.balances;
  const facts = [
    t.facts.active(summary.active),
    t.facts.bank(summary.bank),
    t.facts.cash(summary.cash),
    t.facts.archived(summary.archived),
  ];
  return (
    <>
      <section
        aria-labelledby="saldo-cuentas"
        className="mb-12 max-w-[720px]"
        data-testid="accounts-summary"
      >
        <h2 id="saldo-cuentas" className="type-label text-ink-2">
          {t.currentBalance}
        </h2>
        {hero ? (
          <p
            className="mt-3 type-display-hero-mobile desktop:type-display-hero"
            data-testid="hero-balance"
          >
            <Money amount={hero.amount} currency={hero.currency} cents="auto" />
          </p>
        ) : (
          <p className="mt-3 type-display-hero-mobile text-ink-2 desktop:type-display-hero">
            —
          </p>
        )}
        {others.length > 0 && (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="type-label text-ink-2">{t.otherCurrency}</span>
            {others.map((m) => (
              <Money
                key={m.currency}
                amount={m.amount}
                currency={m.currency}
                cents="auto"
                className="type-amount-lg"
              />
            ))}
          </div>
        )}
        <p
          className="mt-4 type-body-sm text-ink-2"
          data-testid="accounts-facts"
        >
          {facts.join(" · ")}
        </p>
        <p className="mt-1 max-w-[60ch] type-caption text-ink-2">
          {t.balanceNote}
        </p>
      </section>

      <AccountsList
        rows={view.active}
        onEdit={onEdit}
        testId="accounts-active"
      />

      {view.archived.length > 0 && (
        <section aria-labelledby="archivadas" className="mt-12">
          <h2 id="archivadas" className="mb-3 type-subheading text-ink-2">
            {t.archivedSection(view.archived.length)}
          </h2>
          <AccountsList
            rows={view.archived}
            onEdit={onEdit}
            testId="accounts-archived"
          />
        </section>
      )}
    </>
  );
}

function StatusBadge({ row }: { row: AccountRow }) {
  return (
    <Badge tone={row.account.status === "active" ? "positive" : "neutral"}>
      {t.status[row.account.status]}
    </Badge>
  );
}

function ArchiveButton({ row }: { row: AccountRow }) {
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);
  const archived = row.account.status === "archived";
  return (
    <Button
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await mutate((r) =>
            r.accounts.update(
              row.account.id,
              { status: archived ? "active" : "archived" },
              row.account.rev,
            ),
          );
          feedback(archived ? t.unarchived : t.archived);
        } catch {
          feedback(t.form.errors.saveFailed, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {archived ? t.unarchive : t.archive}
    </Button>
  );
}

function AccountsList({
  rows,
  onEdit,
  testId,
}: {
  rows: AccountRow[];
  onEdit: (row: AccountRow) => void;
  testId: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div data-testid={testId}>
      {/* Tablet and desktop: table. */}
      <table className="hidden w-full border-collapse overflow-hidden rounded-md bg-surface tablet:table">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="px-4 py-3 type-label text-ink-2">
              {t.columns.account}
            </th>
            <th
              scope="col"
              className="hidden px-4 py-3 type-label text-ink-2 desktop:table-cell"
            >
              {t.columns.type}
            </th>
            <th scope="col" className="px-4 py-3 type-label text-ink-2">
              {t.columns.currency}
            </th>
            <th scope="col" className="px-4 py-3 type-label text-ink-2">
              {t.columns.status}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right type-label text-ink-2"
            >
              {t.columns.balance}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right type-label text-ink-2"
            >
              <span className="sr-only">{t.columns.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.account.id}
              data-testid="account-row"
              className="border-b border-line last:border-b-0 hover:bg-surface-hover"
            >
              <td className="px-4 py-3">
                <Link
                  href={`${AREAS.accounts.href}/${row.account.id}`}
                  className={cn(
                    "type-body underline-offset-4 hover:underline",
                    row.account.status === "archived" && "text-ink-2",
                  )}
                >
                  {row.account.name}
                </Link>
                <div className="type-body-sm text-ink-2">
                  {row.account.institution}
                  {/* Tablet: the type column is hidden, so the type joins this line. */}
                  <span className="desktop:hidden">
                    {row.account.institution ? " · " : ""}
                    {t.types[row.account.accountType]}
                  </span>
                </div>
                {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
              </td>
              <td className="hidden px-4 py-3 type-body-sm desktop:table-cell">
                {t.types[row.account.accountType]}
              </td>
              <td className="px-4 py-3 type-body-sm">{row.account.currency}</td>
              <td className="px-4 py-3">
                <StatusBadge row={row} />
              </td>
              <td className="px-4 py-3 text-right type-amount">
                <Money
                  amount={row.balance.amount}
                  currency={row.balance.currency}
                />
              </td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                <Button
                  variant="ghost"
                  onClick={() => onEdit(row)}
                  aria-label={`${es.common.edit}: ${row.account.name}`}
                >
                  {es.common.edit}
                </Button>
                <ArchiveButton row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phone: list; a tap opens the bottom sheet. */}
      <ul className="tablet:hidden">
        {rows.map((row) => (
          <li
            key={row.account.id}
            data-testid="account-item"
            className="border-b border-line"
          >
            <Link
              href={`${AREAS.accounts.href}/${row.account.id}`}
              className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate type-body",
                    row.account.status === "archived" && "text-ink-2",
                  )}
                >
                  {row.account.name}
                </span>
                <span className="block type-caption text-ink-2">
                  {[
                    row.account.institution,
                    t.types[row.account.accountType],
                    row.account.currency,
                    row.account.status === "archived"
                      ? t.status.archived
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
              </span>
              <Money
                amount={row.balance.amount}
                currency={row.balance.currency}
                cents="auto"
                className="shrink-0 type-amount"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
