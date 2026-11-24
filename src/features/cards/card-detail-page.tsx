"use client";

import Link from "next/link";
import { useState } from "react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/shared/money";
import { Badge, LocalOnlyMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackProvider } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { useDetailId } from "@/hooks/use-detail-id";
import { useLocalQuery } from "@/hooks/use-local-data";
import { AREAS } from "@/lib/config/navigation";
import { formatDate, type LocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { Fact, Facts, isoDay } from "../accounts/account-detail-page";
import { MovementList } from "../movements/movement-list";
import { CardSheet } from "./card-sheet";
import { loadCardDetail } from "./detail-data";

const t = es.cards;
const d = es.detail;

/**
 * Card detail. The Design System organises it by statement (open, closed, paid); statements
 * depend on open decision OD-8, so this step shows the card's facts, the next closing and due
 * dates, the committed amount (D2-11) and its purchases. The limit is labelled as a limit.
 */
export function CardDetailPage() {
  return (
    <FeedbackProvider>
      <CardDetailContent />
    </FeedbackProvider>
  );
}

function CardDetailContent() {
  const id = useDetailId();
  const query = useLocalQuery(
    (db) => (id ? loadCardDetail(db, id) : Promise.resolve(undefined)),
    [id],
  );
  const [editing, setEditing] = useState(false);
  const crumb = (
    <Breadcrumb parent={{ href: AREAS.cards.href, label: AREAS.cards.label }} />
  );

  if (
    query.status === "loading" ||
    (query.status === "ready" && query.data === undefined)
  ) {
    return (
      <div data-testid="detail-loading" aria-busy="true">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-10 w-72" />
        <Skeleton className="mt-10 h-12 w-64" />
      </div>
    );
  }
  if (query.status === "error") {
    return (
      <>
        <PageHeader label={crumb} title={AREAS.cards.label} />
        <p role="alert" className="type-body text-alert-text">
          {query.error.code === "STORAGE_UNAVAILABLE"
            ? es.accounts.storageUnavailable
            : t.loadError}
        </p>
        <Button className="mt-4" onClick={query.reload}>
          {es.common.retry}
        </Button>
      </>
    );
  }
  const detail = query.data;
  if (!detail) {
    return (
      <>
        <PageHeader label={crumb} title={AREAS.cards.label} />
        <p className="type-body text-ink-2" data-testid="detail-not-found">
          {d.notFoundCard}
        </p>
        <Button asChild className="mt-4">
          <Link href={AREAS.cards.href}>{d.backToCards}</Link>
        </Button>
      </>
    );
  }
  const { row, accounts, movements } = detail;
  const c = row.card;
  const credit = c.cardType === "credit";
  return (
    <>
      <PageHeader
        label={crumb}
        title={
          <>
            {c.name}
            {c.lastFourDigits && (
              <span className="text-ink-2"> ··{c.lastFourDigits}</span>
            )}
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {es.common.edit}
          </Button>
        }
      />
      <section
        aria-label={t.columns.committed}
        className="mb-12 grid gap-8 desktop:grid-cols-12"
        data-testid="card-detail"
      >
        <div className="desktop:col-span-5">
          <h2 className="type-label text-ink-2">{t.columns.committed}</h2>
          <p
            className="mt-3 type-display-hero-mobile desktop:type-display-hero"
            data-testid="detail-committed"
          >
            <Money
              amount={row.committed.amount}
              currency={c.currency}
              cents="auto"
            />
          </p>
          <p className="mt-2 max-w-[48ch] type-caption text-ink-2">
            {t.committedNote}
          </p>
          {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
        </div>
        <div className="desktop:col-span-7 desktop:border-l desktop:border-line desktop:pl-8">
          <Facts>
            <Fact term={d.type}>{t.types[c.cardType]}</Fact>
            <Fact term={d.account}>
              {row.account ? (
                <Link
                  href={`${AREAS.accounts.href}/${row.account.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {row.account.name}
                </Link>
              ) : (
                <Badge tone="late">{t.noAccount}</Badge>
              )}
            </Fact>
            <Fact term={d.currency}>{es.common.currencies[c.currency]}</Fact>
            {credit && (
              <>
                <Fact term={d.limit} testId="detail-limit">
                  {c.creditLimit !== null ? (
                    <Money
                      amount={c.creditLimit}
                      currency={c.currency}
                      cents="auto"
                    />
                  ) : (
                    d.none
                  )}
                </Fact>
                <Fact term={d.closing}>
                  {c.closingDay !== null ? t.day(c.closingDay) : d.none}
                </Fact>
                <Fact term={d.due}>
                  {c.dueDay !== null ? t.day(c.dueDay) : d.none}
                </Fact>
                <Fact term={d.nextClosing} testId="detail-next-closing">
                  {row.schedule.nextClosing
                    ? formatDate(row.schedule.nextClosing as LocalDate)
                    : d.none}
                </Fact>
                <Fact term={d.nextDue} testId="detail-next-due">
                  {row.schedule.nextDue ? (
                    <>
                      {formatDate(row.schedule.nextDue as LocalDate)}
                      {c.status === "active" &&
                        row.schedule.daysToDue !== null &&
                        row.schedule.daysToDue <= 7 && (
                          <>
                            {" "}
                            <Badge
                              tone={
                                row.schedule.daysToDue <= 2 ? "late" : "soon"
                              }
                            >
                              {t.dueIn(row.schedule.daysToDue)}
                            </Badge>
                          </>
                        )}
                    </>
                  ) : (
                    d.none
                  )}
                </Fact>
              </>
            )}
            <Fact term={d.status}>
              <Badge tone={c.status === "active" ? "positive" : "neutral"}>
                {t.status[c.status]}
              </Badge>
            </Fact>
            <Fact term={d.createdAt}>{isoDay(c.createdAt)}</Fact>
            <Fact term={d.updatedAt}>{isoDay(c.updatedAt)}</Fact>
          </Facts>
          {credit && (
            <p className="mt-3 type-caption text-ink-2">{t.limitNote}</p>
          )}
        </div>
      </section>

      <MovementList movements={movements} showTypeFilter={false} />
      <CardSheet
        open={editing}
        row={row}
        accounts={accounts}
        onClose={() => setEditing(false)}
      />
    </>
  );
}
