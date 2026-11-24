"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
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
import { MovementList } from "../movements/movement-list";
import { AccountSheet } from "./account-sheet";
import { loadAccountDetail, type AccountDetail } from "./detail-data";

const t = es.accounts;
const d = es.detail;

/**
 * Account detail (collection → detail, arquitetura.md): breadcrumb, summary header with the
 * current balance as hero, the account's facts, linked cards and the filtered statement.
 */
export function AccountDetailPage() {
  return (
    <FeedbackProvider>
      <AccountDetailContent />
    </FeedbackProvider>
  );
}

export function Facts({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 tablet:grid-cols-3">
      {children}
    </dl>
  );
}
export function Fact({
  term,
  children,
  testId,
}: {
  term: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <dt className="type-label text-ink-2">{term}</dt>
      <dd className="mt-1 type-body">{children}</dd>
    </div>
  );
}
export const isoDay = (iso: string) =>
  formatDate(iso.slice(0, 10) as LocalDate, "form");

function AccountDetailContent() {
  const id = useDetailId();
  const query = useLocalQuery(
    (db) => (id ? loadAccountDetail(db, id) : Promise.resolve(undefined)),
    [id],
  );
  const [editing, setEditing] = useState(false);
  const crumb = (
    <Breadcrumb
      parent={{ href: AREAS.accounts.href, label: AREAS.accounts.label }}
    />
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
        <PageHeader label={crumb} title={AREAS.accounts.label} />
        <p role="alert" className="type-body text-alert-text">
          {query.error.code === "STORAGE_UNAVAILABLE"
            ? t.storageUnavailable
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
        <PageHeader label={crumb} title={AREAS.accounts.label} />
        <p className="type-body text-ink-2" data-testid="detail-not-found">
          {d.notFoundAccount}
        </p>
        <Button asChild className="mt-4">
          <Link href={AREAS.accounts.href}>{d.backToAccounts}</Link>
        </Button>
      </>
    );
  }
  const { row, projected, cards, movements } = detail;
  const a = row.account;
  return (
    <>
      <PageHeader
        label={crumb}
        title={a.name}
        actions={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {es.common.edit}
          </Button>
        }
      />
      <section
        aria-label={t.currentBalance}
        className="mb-12 grid gap-8 desktop:grid-cols-12"
        data-testid="account-detail"
      >
        <div className="desktop:col-span-5">
          <h2 className="type-label text-ink-2">{t.currentBalance}</h2>
          <p
            className="mt-3 type-display-hero-mobile desktop:type-display-hero"
            data-testid="detail-balance"
          >
            <Money
              amount={row.balance.amount}
              currency={a.currency}
              cents="auto"
            />
          </p>
          <p
            className="mt-2 type-body-sm text-ink-2"
            data-testid="detail-projected"
          >
            {d.projected}:{" "}
            <Money amount={projected.amount} currency={a.currency} /> ·{" "}
            {d.projectedHelp}
          </p>
          {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
        </div>
        <div className="desktop:col-span-7 desktop:border-l desktop:border-line desktop:pl-8">
          <Facts>
            <Fact term={t.initialBalance} testId="detail-initial">
              <Money amount={a.initialBalance} currency={a.currency} />
            </Fact>
            <Fact term={d.currency}>{es.common.currencies[a.currency]}</Fact>
            <Fact term={d.type}>{t.types[a.accountType]}</Fact>
            <Fact term={d.institution}>{a.institution ?? d.none}</Fact>
            <Fact term={d.status}>
              <Badge tone={a.status === "active" ? "positive" : "neutral"}>
                {t.status[a.status]}
              </Badge>
            </Fact>
            <Fact term={d.createdAt}>{isoDay(a.createdAt)}</Fact>
            <Fact term={d.updatedAt}>{isoDay(a.updatedAt)}</Fact>
          </Facts>
        </div>
      </section>

      <section
        aria-labelledby="tarjetas-asociadas"
        className="mb-12"
        data-testid="linked-cards"
      >
        <h2 id="tarjetas-asociadas" className="mb-3 type-subheading">
          {d.linkedCards}
        </h2>
        {cards.length === 0 ? (
          <p className="type-body text-ink-2">{d.noLinkedCards}</p>
        ) : (
          <ul>
            {cards.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4 border-b border-line py-3"
              >
                <Link
                  href={`${AREAS.cards.href}/${c.id}`}
                  className="type-body underline-offset-4 hover:underline"
                >
                  {c.name}
                  {c.lastFourDigits && (
                    <span className="num text-ink-2">
                      {" "}
                      ··{c.lastFourDigits}
                    </span>
                  )}
                </Link>
                <span className="type-body-sm text-ink-2">
                  {es.cards.types[c.cardType]} · {es.cards.status[c.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Reconciliation detail={detail} />
      <MovementList movements={movements} />
      <AccountSheet
        open={editing}
        row={row}
        onClose={() => setEditing(false)}
      />
    </>
  );
}

/** "Cómo se calcula el saldo": the auditable breakdown of the current balance (D4-17). */
function Reconciliation({ detail }: { detail: AccountDetail }) {
  const r = detail.reconciliation;
  const h = d.how;
  const c = detail.row.account.currency;
  const rows: [string, number, "explicit" | "negative"][] = [
    [h.initial, r.initial.amount, "negative"],
    [h.income, r.income.amount, "explicit"],
    [h.expenses, -r.expenses.amount, "explicit"],
    [h.transfersIn, r.transfersIn.amount, "explicit"],
    [h.transfersOut, -r.transfersOut.amount, "explicit"],
  ];
  return (
    <section aria-labelledby="como-se-calcula" className="mb-12 max-w-xl" data-testid="reconciliation">
      <h2 id="como-se-calcula" className="mb-3 type-subheading">
        {d.howTitle}
      </h2>
      <dl>
        {rows.map(([label, amount, sign]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-line py-2">
            <dt className="type-body-sm text-ink-2">{label}</dt>
            <dd className="type-amount">
              <Money amount={amount} currency={c} sign={amount === 0 ? "negative" : sign} />
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="type-body font-semibold">{h.result}</dt>
          <dd className="type-amount font-semibold" data-testid="reconciliation-result">
            <Money amount={r.rebuilt.amount} currency={c} />
          </dd>
        </div>
      </dl>
      <p className="type-caption text-ink-2">{h.excluded(r.excluded.pending, r.excluded.cancelled, r.excluded.creditCardPurchases)}</p>
      <p className={r.matches ? "type-caption text-ink-2" : "type-caption text-alert-text"} data-testid="reconciliation-status">
        {r.matches ? h.ok : h.mismatch}
      </p>
    </section>
  );
}
