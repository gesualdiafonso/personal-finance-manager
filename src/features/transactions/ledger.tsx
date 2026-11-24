"use client";

import { Fragment, useState } from "react";
import { isCreditCardPurchase, type CardTypes } from "@/domain/rules/balances";
import {
  listedAmount,
  summarizeTransactions,
  type Lookups,
  type SortOrder,
} from "@/domain/rules/transactions";
import type { Transaction } from "@/domain/schemas";
import { Money } from "@/components/shared/money";
import { Badge, LocalOnlyMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatRelativeDay,
  type LocalDate,
} from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";

const t = es.transactions.list;
const PAGE = 100;

/**
 * The statement (Ledger): grouped by day when sorted by date, with the day's net per currency
 * (income − expenses; transfers are neither). Desktop 5 columns (Date · Description with
 * category · Account · Status · Amount), tablet 4 (account joins the description line), list
 * on the phone (O-16). Renders the first 100 rows and adds 100 at a time (D4-11).
 */
export function Ledger({
  transactions,
  order,
  lookups,
  cardTypes,
  localOnly,
  today,
  onOpen,
}: {
  transactions: Transaction[];
  order: SortOrder;
  lookups: Lookups;
  cardTypes: CardTypes;
  localOnly: Set<string>;
  today: string;
  onOpen?: (t: Transaction) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const shown = transactions.slice(0, limit);
  const byDay = order === "dateDesc" || order === "dateAsc";
  const groups: { day: string | null; rows: Transaction[] }[] = [];
  for (const tx of shown) {
    const day = byDay ? tx.date : null;
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(tx);
    else groups.push({ day, rows: [tx] });
  }
  const accountName = (id: string | null) =>
    id ? (lookups.accounts.get(id)?.name ?? "—") : "—";
  const categoryName = (tx: Transaction) => {
    const c = tx.categoryId ? lookups.categories.get(tx.categoryId) : undefined;
    if (!c) return null;
    const parent = c.parentId ? lookups.categories.get(c.parentId) : undefined;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  const accountText = (tx: Transaction) =>
    tx.type === "transfer"
      ? t.transfer(
          accountName(tx.accountId),
          accountName(tx.destinationAccountId),
        )
      : accountName(tx.accountId);

  return (
    <div data-testid="ledger">
      <table className="hidden w-full border-collapse overflow-hidden rounded-md bg-surface tablet:table">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="w-28 px-4 py-3 type-label text-ink-2">
              {t.columns.date}
            </th>
            <th scope="col" className="px-4 py-3 type-label text-ink-2">
              {t.columns.description}
            </th>
            <th
              scope="col"
              className="hidden px-4 py-3 type-label text-ink-2 desktop:table-cell"
            >
              {t.columns.account}
            </th>
            <th scope="col" className="px-4 py-3 type-label text-ink-2">
              {t.columns.status}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right type-label text-ink-2"
            >
              {t.columns.amount}
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <Fragment key={g.day ?? `g${gi}`}>
              {g.day && (
                <tr className="bg-paper-2" data-testid="ledger-day">
                  <th
                    scope="rowgroup"
                    colSpan={3}
                    className="px-4 py-2 text-left type-label text-ink-2"
                  >
                    {dayLabel(g.day, today)}
                  </th>
                  <td
                    colSpan={2}
                    className="px-4 py-2 text-right type-body-sm text-ink-2"
                  >
                    <DayNet rows={g.rows} />
                  </td>
                </tr>
              )}
              {g.rows.map((tx) => {
                const amount = listedAmount(tx);
                const category = categoryName(tx);
                return (
                  <tr
                    key={tx.id}
                    data-testid="ledger-row"
                    onClick={onOpen ? () => onOpen(tx) : undefined}
                    className={cn(
                      "border-b border-line last:border-b-0",
                      onOpen && "cursor-pointer hover:bg-surface-hover",
                    )}
                  >
                    <td className="px-4 py-3 type-body-sm whitespace-nowrap text-ink-2">
                      {formatDate(tx.date as LocalDate)}
                    </td>
                    <td className="px-4 py-3">
                      {onOpen ? (
                        <button
                          type="button"
                          onClick={(e) => (e.stopPropagation(), onOpen(tx))}
                          className={descriptionClass(tx)}
                        >
                          {tx.description}
                        </button>
                      ) : (
                        <span className={descriptionClass(tx)}>
                          {tx.description}
                        </span>
                      )}
                      <div className="type-caption text-ink-2">
                        {[
                          category,
                          isCreditCardPurchase(tx, cardTypes)
                            ? t.creditCard
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {/* Tablet: the account column is hidden, so the account joins this line. */}
                        <span className="desktop:hidden">
                          {category || isCreditCardPurchase(tx, cardTypes)
                            ? " · "
                            : ""}
                          {accountText(tx)}
                        </span>
                      </div>
                      {localOnly.has(tx.id) && (
                        <LocalOnlyMark label={es.common.localOnly} />
                      )}
                    </td>
                    <td className="hidden px-4 py-3 type-body-sm desktop:table-cell">
                      {accountText(tx)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tx={tx} />
                    </td>
                    <td className="px-4 py-3 text-right type-amount whitespace-nowrap">
                      <Money
                        amount={amount.amount}
                        currency={tx.currency}
                        sign={amount.sign}
                      />
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="tablet:hidden">
        {groups.map((g, gi) => (
          <section
            key={g.day ?? `g${gi}`}
            aria-label={
              g.day ? formatDate(g.day as LocalDate, "long") : undefined
            }
          >
            {g.day && (
              <div className="flex items-baseline justify-between bg-paper-2 px-3 py-1.5 type-label text-ink-2">
                <span>{dayLabel(g.day, today)}</span>
                <DayNet rows={g.rows} />
              </div>
            )}
            <ul>
              {g.rows.map((tx) => {
                const amount = listedAmount(tx);
                const Wrapper = onOpen ? "button" : "div";
                return (
                  <li
                    key={tx.id}
                    data-testid="ledger-item"
                    className="border-b border-line"
                  >
                    <Wrapper
                      {...(onOpen
                        ? { type: "button" as const, onClick: () => onOpen(tx) }
                        : {})}
                      className="flex min-h-14 w-full items-start justify-between gap-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-focus-ring"
                    >
                      <span className="min-w-0">
                        <span
                          className={cn("block truncate", descriptionClass(tx))}
                        >
                          {tx.description}
                        </span>
                        <span className="block type-caption text-ink-2">
                          {[categoryName(tx), accountText(tx)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {tx.status !== "completed" && <StatusBadge tx={tx} />}
                        {localOnly.has(tx.id) && (
                          <LocalOnlyMark label={es.common.localOnly} />
                        )}
                      </span>
                      <Money
                        amount={amount.amount}
                        currency={tx.currency}
                        sign={amount.sign}
                        cents="auto"
                        className="shrink-0 type-amount"
                      />
                    </Wrapper>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {transactions.length > limit && (
        <Button className="mt-4" onClick={() => setLimit((n) => n + PAGE)}>
          {t.showMore(transactions.length - limit)}
        </Button>
      )}
    </div>
  );
}

/** "Hoy · 24 nov", "Ayer · 23 nov", "martes · 18 nov", or just "2 nov" for older days. */
function dayLabel(day: string, today: string): string {
  const absolute = formatDate(day as LocalDate);
  const relative = formatRelativeDay(day as LocalDate, today as LocalDate);
  return relative === absolute ? absolute : `${relative} · ${absolute}`;
}

function descriptionClass(tx: Transaction) {
  return cn(
    "text-left type-body",
    tx.status === "cancelled" && "text-ink-2 line-through",
  );
}

function StatusBadge({ tx }: { tx: Transaction }) {
  if (tx.status === "completed")
    return (
      <span className="type-body-sm text-ink-2">
        {es.movements.statuses.completed}
      </span>
    );
  return (
    <Badge tone={tx.status === "pending" ? "soon" : "neutral"}>
      {es.movements.statuses[tx.status]}
    </Badge>
  );
}

/** Net of the day per currency, through the same domain rule as the summary (completed only; transfers are neither). */
function DayNet({ rows }: { rows: Transaction[] }) {
  const nets = summarizeTransactions(rows, "all").map((s) => s.net);
  if (nets.length === 0) return null;
  return (
    <span className="inline-flex gap-3">
      {nets.map((m) => (
        <Money
          key={m.currency}
          amount={m.amount}
          currency={m.currency}
          sign="explicit"
          cents="auto"
        />
      ))}
    </span>
  );
}
