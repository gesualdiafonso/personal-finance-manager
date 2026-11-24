"use client";

import Link from "next/link";
import { useState } from "react";
import type { Money as MoneyValue } from "@/domain/money";
import { ObligationsSwitcher } from "@/components/layout/obligations-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/shared/money";
import { Badge, LocalOnlyMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackProvider, useFeedback } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { mutate, useLocalQuery } from "@/hooks/use-local-data";
import { AREAS } from "@/lib/config/navigation";
import { formatDate, type LocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { CardSheet } from "./card-sheet";
import { loadCardsView, type CardRow, type CardsView } from "./data";

const t = es.cards;

/**
 * Cards (Obligaciones · "¿Cuánto debo en las tarjetas y cuándo cierra?"). The hero is the
 * amount committed on cards per currency (D2-11); the credit limit is shown apart and
 * labelled as a limit, never as available money (FIN-02). Credit, debit and prepaid cards
 * are listed in separate sections; archived cards stay visible below.
 */
export function CardsPage() {
  return (
    <FeedbackProvider>
      <CardsContent />
    </FeedbackProvider>
  );
}

function CardsContent() {
  const query = useLocalQuery((db) => loadCardsView(db), []);
  const [sheet, setSheet] = useState<{ open: boolean; row: CardRow | null }>({
    open: false,
    row: null,
  });
  const data = query.status === "ready" ? query.data : null;
  const total = data
    ? data.credit.length +
      data.debit.length +
      data.prepaid.length +
      data.archived.length
    : 0;
  const openCreate = () => setSheet({ open: true, row: null });
  const openEdit = (row: CardRow) => setSheet({ open: true, row });

  return (
    <>
      <PageHeader
        label={es.nav.groups.obligations}
        title={AREAS.cards.label}
        actions={
          total > 0 && (
            <Button variant="primary" onClick={openCreate}>
              {t.newCard}
            </Button>
          )
        }
      />
      <ObligationsSwitcher current="cards" />
      <p className="-mt-4 mb-8 max-w-[60ch] type-body text-ink-2 desktop:-mt-8 desktop:mb-10">
        {t.description}
      </p>

      {query.status === "loading" && (
        <div data-testid="cards-loading" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-12 w-64" />
          <div className="mt-10 grid gap-3">
            {[0, 1].map((i) => (
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
      {data && (
        <>
          {data.invalid > 0 && (
            <p role="alert" className="mb-6 type-body-sm text-alert-text">
              {t.invalidRecords(data.invalid)}
            </p>
          )}
          {total === 0 ? (
            <EmptyState
              hasAccounts={data.accounts.length > 0}
              onCreate={openCreate}
            />
          ) : (
            <CardsBody view={data} onEdit={openEdit} />
          )}
          <CardSheet
            open={sheet.open}
            row={sheet.row}
            accounts={data.accounts}
            onClose={() => setSheet((s) => ({ ...s, open: false }))}
          />
        </>
      )}
    </>
  );
}

function EmptyState({
  hasAccounts,
  onCreate,
}: {
  hasAccounts: boolean;
  onCreate: () => void;
}) {
  return (
    <section
      aria-labelledby="sin-tarjetas"
      className="max-w-[60ch]"
      data-testid="cards-empty"
    >
      <h2 id="sin-tarjetas" className="type-heading">
        {hasAccounts ? t.empty.title : t.empty.needAccountTitle}
      </h2>
      <p className="mt-2 mb-5 type-body text-ink-2">
        {hasAccounts ? t.empty.body : t.empty.needAccountBody}
      </p>
      {hasAccounts ? (
        <Button variant="primary" onClick={onCreate}>
          {t.empty.action}
        </Button>
      ) : (
        <Button asChild variant="primary">
          <Link href={AREAS.accounts.href}>{t.empty.needAccountAction}</Link>
        </Button>
      )}
    </section>
  );
}

function MoneyLine({ values }: { values: MoneyValue[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-3">
      {values.map((m) => (
        <Money
          key={m.currency}
          amount={m.amount}
          currency={m.currency}
          cents="auto"
        />
      ))}
    </span>
  );
}

function CardsBody({
  view,
  onEdit,
}: {
  view: CardsView;
  onEdit: (row: CardRow) => void;
}) {
  const { summary } = view;
  const [hero, ...others] = summary.committed;
  return (
    <>
      <section
        aria-labelledby="comprometido"
        className="mb-12 grid gap-8 desktop:grid-cols-12"
        data-testid="cards-summary"
      >
        <div className="desktop:col-span-7">
          <h2 id="comprometido" className="type-label text-ink-2">
            {t.committed}
          </h2>
          <p
            className="mt-3 type-display-hero-mobile desktop:type-display-hero"
            data-testid="hero-committed"
          >
            {hero ? (
              <Money
                amount={hero.amount}
                currency={hero.currency}
                cents="auto"
              />
            ) : (
              <span className="text-ink-2">$ 0</span>
            )}
          </p>
          {others.length > 0 && (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4">
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
          <p className="mt-4 type-body-sm text-ink-2" data-testid="cards-facts">
            {[
              t.facts.active(summary.active),
              t.facts.archived(summary.archived),
            ].join(" · ")}
          </p>
          <p className="mt-1 max-w-[60ch] type-caption text-ink-2">
            {t.committedNote}
          </p>
        </div>
        <div className="grid content-start gap-6 desktop:col-span-5 desktop:border-l desktop:border-line desktop:pl-8">
          {summary.creditLimits.length > 0 && (
            <div data-testid="cards-limit">
              <h3 className="type-label text-ink-2">{t.limitTotal}</h3>
              <p className="mt-1 type-amount-lg">
                <MoneyLine values={summary.creditLimits} />
              </p>
              <p className="type-caption text-ink-2">{t.limitNote}</p>
            </div>
          )}
          {summary.dueSoon.length > 0 && (
            <div data-testid="cards-due-soon">
              <h3 className="type-label text-ink-2">{t.dueSoonTitle}</h3>
              <ul className="mt-2 grid gap-2">
                {summary.dueSoon.map(({ card, dueDate, days }) => (
                  <li
                    key={card.id}
                    className="flex flex-wrap items-center justify-between gap-2 type-body-sm"
                  >
                    <span>
                      {card.name}
                      {card.lastFourDigits && (
                        <span className="num text-ink-2">
                          {" "}
                          ··{card.lastFourDigits}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-ink-2">
                        {formatDate(dueDate as LocalDate)}
                      </span>
                      <Badge tone={days <= 2 ? "late" : "soon"}>
                        {t.dueIn(days)}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <CardSection
        title={t.groups.credit}
        rows={view.credit}
        credit
        onEdit={onEdit}
        testId="cards-credit"
      />
      <CardSection
        title={t.groups.debit}
        rows={view.debit}
        onEdit={onEdit}
        testId="cards-debit"
      />
      <CardSection
        title={t.groups.prepaid}
        rows={view.prepaid}
        onEdit={onEdit}
        testId="cards-prepaid"
      />
      <CardSection
        title={t.archivedSection(view.archived.length)}
        rows={view.archived}
        credit
        onEdit={onEdit}
        testId="cards-archived"
        muted
      />
    </>
  );
}

function ArchiveButton({ row }: { row: CardRow }) {
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);
  const archived = row.card.status === "inactive";
  return (
    <Button
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await mutate((r) =>
            r.cards.update(
              row.card.id,
              { status: archived ? "active" : "inactive" },
              row.card.rev,
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

function CardName({ row, link = false }: { row: CardRow; link?: boolean }) {
  const name = (
    <span
      className={cn(
        "type-body",
        row.card.status === "inactive" && "text-ink-2",
      )}
    >
      {row.card.name}
    </span>
  );
  return (
    <>
      {link ? (
        <Link
          href={`${AREAS.cards.href}/${row.card.id}`}
          className="underline-offset-4 hover:underline"
        >
          {name}
        </Link>
      ) : (
        name
      )}
      {row.card.lastFourDigits && (
        <span className="num type-body text-ink-2">
          {" "}
          ··{row.card.lastFourDigits}
        </span>
      )}
    </>
  );
}

function AccountLine({ row }: { row: CardRow }) {
  if (!row.account) return <Badge tone="late">{t.noAccount}</Badge>;
  return (
    <span className="type-body-sm text-ink-2">
      {row.account.name} · {row.card.currency}
    </span>
  );
}

function CardSection({
  title,
  rows,
  credit = false,
  muted = false,
  onEdit,
  testId,
}: {
  title: string;
  rows: CardRow[];
  credit?: boolean;
  muted?: boolean;
  onEdit: (row: CardRow) => void;
  testId: string;
}) {
  if (rows.length === 0) return null;
  const headingId = `${testId}-title`;
  return (
    <section aria-labelledby={headingId} className="mb-10" data-testid={testId}>
      <h2
        id={headingId}
        className={cn("mb-3 type-subheading", muted && "text-ink-2")}
      >
        {title}
      </h2>
      <table className="hidden w-full border-collapse rounded-md bg-surface tablet:table">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="px-4 py-3 type-label text-ink-2">
              {t.columns.card}
            </th>
            {credit && (
              <>
                <th
                  scope="col"
                  className="hidden px-4 py-3 type-label text-ink-2 desktop:table-cell"
                >
                  {t.columns.closing}
                </th>
                <th scope="col" className="px-4 py-3 type-label text-ink-2">
                  {t.columns.due}
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 text-right type-label text-ink-2 desktop:table-cell"
                >
                  {t.columns.limit}
                </th>
              </>
            )}
            <th
              scope="col"
              className="px-4 py-3 text-right type-label text-ink-2"
            >
              {t.columns.committed}
            </th>
            <th scope="col" className="px-4 py-3 type-label text-ink-2">
              {t.columns.status}
            </th>
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">{t.columns.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.card.id}
              data-testid="card-row"
              className="border-b border-line last:border-b-0 hover:bg-surface-hover"
            >
              <td className="px-4 py-3">
                <div>
                  <CardName row={row} link />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AccountLine row={row} />
                  {muted && (
                    <span className="type-body-sm text-ink-2">
                      · {t.types[row.card.cardType]}
                    </span>
                  )}
                </div>
                {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
              </td>
              {credit && (
                <>
                  <td className="hidden px-4 py-3 type-body-sm desktop:table-cell">
                    {row.card.closingDay !== null
                      ? t.day(row.card.closingDay)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 type-body-sm">
                    {row.card.dueDay !== null ? t.day(row.card.dueDay) : "—"}
                    {row.card.status === "active" &&
                      row.schedule.daysToDue !== null &&
                      row.schedule.daysToDue <= 7 && (
                        <div>
                          <Badge
                            tone={row.schedule.daysToDue <= 2 ? "late" : "soon"}
                          >
                            {t.dueIn(row.schedule.daysToDue)}
                          </Badge>
                        </div>
                      )}
                  </td>
                  <td className="hidden px-4 py-3 text-right type-amount desktop:table-cell">
                    {row.card.creditLimit !== null ? (
                      <Money
                        amount={row.card.creditLimit}
                        currency={row.card.currency}
                        cents="auto"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </>
              )}
              <td className="px-4 py-3 text-right type-amount">
                <Money
                  amount={row.committed.amount}
                  currency={row.committed.currency}
                />
              </td>
              <td className="px-4 py-3">
                <Badge
                  tone={row.card.status === "active" ? "positive" : "neutral"}
                >
                  {t.status[row.card.status]}
                </Badge>
              </td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                <Button
                  variant="ghost"
                  onClick={() => onEdit(row)}
                  aria-label={`${es.common.edit}: ${row.card.name}`}
                >
                  {es.common.edit}
                </Button>
                <ArchiveButton row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="tablet:hidden">
        {rows.map((row) => (
          <li
            key={row.card.id}
            data-testid="card-item"
            className="border-b border-line"
          >
            <Link
              href={`${AREAS.cards.href}/${row.card.id}`}
              className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              <span className="min-w-0">
                <span className="block truncate">
                  <CardName row={row} />
                </span>
                <span className="block">
                  <AccountLine row={row} />
                </span>
                {row.card.cardType === "credit" && row.card.dueDay !== null && (
                  <span className="block type-caption text-ink-2">
                    {t.columns.closing} {t.day(row.card.closingDay!)} ·{" "}
                    {t.columns.due} {t.day(row.card.dueDay)}
                  </span>
                )}
                {row.card.status === "active" &&
                  row.schedule.daysToDue !== null &&
                  row.schedule.daysToDue <= 7 && (
                    <Badge tone={row.schedule.daysToDue <= 2 ? "late" : "soon"}>
                      {t.dueIn(row.schedule.daysToDue)}
                    </Badge>
                  )}
                {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
              </span>
              <Money
                amount={row.committed.amount}
                currency={row.committed.currency}
                cents="auto"
                className="shrink-0 type-amount"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
