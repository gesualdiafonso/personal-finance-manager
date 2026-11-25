"use client";

import { CurrencyOptions } from "@/features/exchange/currency-options";
import { useState } from "react";
import {
  activeFilterCount,
  PERIOD_PRESETS,
  SORT_ORDERS,
  type PeriodPreset,
  type SortOrder,
  type TransactionFilters,
} from "@/domain/rules/transactions";
import type { Account, Card, Category } from "@/domain/schemas";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";

const t = es.transactions.list;

export interface ListState {
  filters: TransactionFilters;
  period: PeriodPreset;
  custom: { from: string; to: string };
  order: SortOrder;
}

/**
 * Search, period, filters and sorting. Search, period and order stay visible; the other
 * filters fold behind "Más filtros" on the phone (they are always open from the tablet up).
 */
export function FiltersBar({
  state,
  onChange,
  onClear,
  accounts,
  categories,
  cards,
  results,
}: {
  state: ListState;
  onChange: (next: ListState) => void;
  onClear: () => void;
  accounts: Account[];
  categories: Category[];
  cards: Card[];
  results: number;
}) {
  const [more, setMore] = useState(false);
  const { filters } = state;
  const setFilter = <K extends keyof TransactionFilters>(
    k: K,
    v: TransactionFilters[K],
  ) => onChange({ ...state, filters: { ...filters, [k]: v } });
  const extra = activeFilterCount({ ...filters, query: "" });
  const anything = activeFilterCount(filters) > 0 || state.period !== "month";
  const byId = new Map(categories.map((c) => [c.id, c]));
  const categoryLabel = (c: Category) =>
    c.parentId && byId.get(c.parentId)
      ? `${byId.get(c.parentId)!.name} › ${c.name}`
      : c.name;
  const sortedCategories = [...categories].sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      categoryLabel(a).localeCompare(categoryLabel(b), "es-AR"),
  );

  return (
    <div
      role="search"
      aria-label={t.searchRegion}
      className="mb-6 grid gap-4"
      data-testid="filters"
    >
      <div className="grid gap-4 tablet:grid-cols-[2fr_1fr_1fr]">
        <Field label={t.search}>
          {(p) => (
            <Input
              {...p}
              type="search"
              value={filters.query}
              onChange={(e) => setFilter("query", e.target.value)}
              placeholder={t.searchPlaceholder}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label={t.period}>
          {(p) => (
            <Select
              {...p}
              value={state.period}
              onChange={(e) =>
                onChange({ ...state, period: e.target.value as PeriodPreset })
              }
            >
              {PERIOD_PRESETS.map((k) => (
                <option key={k} value={k}>
                  {t.periods[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t.sort}>
          {(p) => (
            <Select
              {...p}
              value={state.order}
              onChange={(e) =>
                onChange({ ...state, order: e.target.value as SortOrder })
              }
            >
              {SORT_ORDERS.map((k) => (
                <option key={k} value={k}>
                  {t.sorts[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {state.period === "custom" && (
        <div className="grid grid-cols-2 gap-4 tablet:max-w-md">
          <Field label={t.from}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={state.custom.from}
                onChange={(e) =>
                  onChange({
                    ...state,
                    custom: { ...state.custom, from: e.target.value },
                  })
                }
              />
            )}
          </Field>
          <Field label={t.to}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={state.custom.to}
                onChange={(e) =>
                  onChange({
                    ...state,
                    custom: { ...state.custom, to: e.target.value },
                  })
                }
              />
            )}
          </Field>
        </div>
      )}

      <Button
        variant="ghost"
        className="justify-self-start tablet:hidden"
        aria-expanded={more}
        onClick={() => setMore((m) => !m)}
      >
        {t.moreFilters(extra)}
      </Button>

      <div
        className={cn(
          "grid-cols-2 gap-4 tablet:grid tablet:grid-cols-3 desktop:grid-cols-6",
          more ? "grid" : "hidden",
        )}
        data-testid="more-filters"
      >
        <Field label={t.type}>
          {(p) => (
            <Select
              {...p}
              value={filters.type}
              onChange={(e) =>
                setFilter("type", e.target.value as TransactionFilters["type"])
              }
            >
              <option value="all">{t.all}</option>
              {(["income", "expense", "transfer"] as const).map((k) => (
                <option key={k} value={k}>
                  {es.movements.typeFilters[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t.account}>
          {(p) => (
            <Select
              {...p}
              value={filters.accountId}
              onChange={(e) => setFilter("accountId", e.target.value)}
            >
              <option value="">{t.allFem}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t.category}>
          {(p) => (
            <Select
              {...p}
              value={filters.categoryId}
              onChange={(e) => setFilter("categoryId", e.target.value)}
            >
              <option value="">{t.allFem}</option>
              {sortedCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c)} ·{" "}
                  {c.type === "income"
                    ? es.movements.types.income
                    : es.movements.types.expense}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t.status}>
          {(p) => (
            <Select
              {...p}
              value={filters.status}
              onChange={(e) =>
                setFilter(
                  "status",
                  e.target.value as TransactionFilters["status"],
                )
              }
            >
              <option value="all">{t.all}</option>
              {(["completed", "pending", "cancelled"] as const).map((k) => (
                <option key={k} value={k}>
                  {es.movements.statusFilters[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t.currency}>
          {(p) => (
            <Select
              {...p}
              value={filters.currency}
              onChange={(e) =>
                setFilter(
                  "currency",
                  e.target.value as TransactionFilters["currency"],
                )
              }
            >
              <option value="all">{t.allFem}</option>
              <CurrencyOptions value={filters.currency} short />
            </Select>
          )}
        </Field>
        <Field label={t.card}>
          {(p) => (
            <Select
              {...p}
              value={filters.cardId}
              onChange={(e) => setFilter("cardId", e.target.value)}
            >
              <option value="">{t.allFem}</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.lastFourDigits ? ` ··${c.lastFourDigits}` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className="type-body-sm text-ink-2"
          role="status"
          data-testid="results-count"
        >
          {t.results(results)}
        </span>
        {anything && (
          <Button variant="ghost" onClick={onClear}>
            {t.clear}
          </Button>
        )}
      </div>
    </div>
  );
}
