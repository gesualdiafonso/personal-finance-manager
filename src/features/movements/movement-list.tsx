"use client";

import { useMemo, useState } from "react";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import {
  formatDate,
  formatMonthTitle,
  type LocalDate,
} from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import {
  filterMovements,
  movementPeriods,
  NO_FILTERS,
  type Movement,
  type MovementFilters,
} from "./movements";

const t = es.movements;

/**
 * Read-only statement of one account or card with period, type and status filters
 * (Step 03 §12; Ledger: 5 columns on desktop, list on the phone). Filters live in the page
 * state only — nothing is stored.
 */
export function MovementList({
  movements,
  showTypeFilter = true,
}: {
  movements: Movement[];
  showTypeFilter?: boolean;
}) {
  const [filters, setFilters] = useState<MovementFilters>(NO_FILTERS);
  const periods = useMemo(() => movementPeriods(movements), [movements]);
  const shown = useMemo(
    () => filterMovements(movements, filters),
    [movements, filters],
  );

  return (
    <section aria-labelledby="movimientos" data-testid="movements">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="movimientos" className="type-subheading">
          {t.title}
        </h2>
        <span className="type-body-sm text-ink-2" data-testid="movements-count">
          {t.count(shown.length)}
        </span>
      </div>

      {movements.length === 0 ? (
        <p className="max-w-[60ch] type-body text-ink-2">{t.empty}</p>
      ) : (
        <>
          <div
            role="group"
            aria-label={t.filtersLabel}
            className="mb-5 grid gap-4 tablet:grid-cols-3"
          >
            <Field label={t.period}>
              {(p) => (
                <Select
                  {...p}
                  value={filters.period}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, period: e.target.value }))
                  }
                >
                  <option value="all">{t.allPeriods}</option>
                  {periods.map((ym) => (
                    <option key={ym} value={ym}>
                      {formatMonthTitle(`${ym}-01` as LocalDate)}{" "}
                      {ym.slice(0, 4)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {showTypeFilter && (
              <Field label={t.type}>
                {(p) => (
                  <Select
                    {...p}
                    value={filters.type}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        type: e.target.value as MovementFilters["type"],
                      }))
                    }
                  >
                    <option value="all">{t.all}</option>
                    {(["income", "expense", "transfer"] as const).map((k) => (
                      <option key={k} value={k}>
                        {t.typeFilters[k]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label={t.status}>
              {(p) => (
                <Select
                  {...p}
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      status: e.target.value as MovementFilters["status"],
                    }))
                  }
                >
                  <option value="all">{t.all}</option>
                  {(["completed", "pending", "cancelled"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t.statusFilters[k]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {shown.length === 0 ? (
            <div>
              <p className="type-body text-ink-2">{t.noMatch}</p>
              <Button className="mt-3" onClick={() => setFilters(NO_FILTERS)}>
                {t.clear}
              </Button>
            </div>
          ) : (
            <>
              <table className="hidden w-full border-collapse rounded-md bg-surface tablet:table">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="px-4 py-3 type-label text-ink-2">
                      {t.columns.date}
                    </th>
                    <th scope="col" className="px-4 py-3 type-label text-ink-2">
                      {t.columns.description}
                    </th>
                    <th
                      scope="col"
                      className="hidden px-4 py-3 type-label text-ink-2 desktop:table-cell"
                    >
                      {t.columns.type}
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
                  {shown.map((m) => (
                    <tr
                      key={m.tx.id}
                      data-testid="movement-row"
                      className="border-b border-line last:border-b-0"
                    >
                      <td className="px-4 py-3 type-body-sm whitespace-nowrap">
                        {formatDate(m.tx.date as LocalDate)}
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={cn(
                            "type-body",
                            m.tx.status === "cancelled" &&
                              "text-ink-2 line-through",
                          )}
                        >
                          {m.tx.description}
                        </div>
                        <Meta m={m} />
                      </td>
                      <td className="hidden px-4 py-3 type-body-sm desktop:table-cell">
                        {t.types[m.tx.type]}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge m={m} />
                      </td>
                      <td className="px-4 py-3 text-right type-amount">
                        <Money
                          amount={m.signed.amount}
                          currency={m.signed.currency}
                          sign="explicit"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="tablet:hidden">
                {shown.map((m) => (
                  <li
                    key={m.tx.id}
                    data-testid="movement-item"
                    className="flex items-start justify-between gap-4 border-b border-line py-3"
                  >
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "truncate type-body",
                          m.tx.status === "cancelled" &&
                            "text-ink-2 line-through",
                        )}
                      >
                        {m.tx.description}
                      </div>
                      <div className="type-caption text-ink-2">
                        {formatDate(m.tx.date as LocalDate)} ·{" "}
                        {t.types[m.tx.type]}
                      </div>
                      <Meta m={m} />
                      {m.tx.status !== "completed" && <StatusBadge m={m} />}
                    </div>
                    <Money
                      amount={m.signed.amount}
                      currency={m.signed.currency}
                      sign="explicit"
                      cents="auto"
                      className="shrink-0 type-amount"
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Meta({ m }: { m: Movement }) {
  const parts = [
    m.category?.name,
    m.counterpart
      ? m.signed.amount < 0
        ? t.transferTo(m.counterpart.name)
        : t.transferFrom(m.counterpart.name)
      : null,
    m.viaCard ? t.viaCard : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <div className="type-caption text-ink-2">{parts.join(" · ")}</div>;
}

function StatusBadge({ m }: { m: Movement }) {
  const tone =
    m.tx.status === "completed"
      ? "positive"
      : m.tx.status === "pending"
        ? "soon"
        : "neutral";
  return <Badge tone={tone}>{t.statuses[m.tx.status]}</Badge>;
}
