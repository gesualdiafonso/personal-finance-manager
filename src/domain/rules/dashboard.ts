import type { CurrencyCode } from "../currency";
import type { Account, Bill, Recurrence, Transaction } from "../schemas";
import {
  deriveAccountBalance,
  incomeAndExpenses,
  type CardTypes,
} from "./balances";
import { periodContaining } from "./budgets";
import { occurrencesBetween, isRecurrenceRunning } from "./recurrence";

/**
 * Dashboard selectors (Step 07). They only COMBINE the rules of the earlier modules — balances
 * (balances.ts), income/expenses (incomeAndExpenses), bills (bills.ts), cards (cards.ts),
 * budgets and goals — and never store anything. What each figure means:
 *
 * - Income / expenses / result: completed transactions in the period (pending shown apart),
 *   per currency; transfers and cancelled or deleted records never count (incomeAndExpenses).
 *   A credit-card purchase is an expense on its purchase date (consumption, D4-08); there is no
 *   card-statement payment yet (OD-8 statements are a later step), so nothing is counted twice.
 * - Balances: derived from the accounts (current = completed movements). Never converted.
 * - Goal contributions are not transactions: they never appear as income or expenses.
 * - Bill payments are expense transactions: the bill itself is never added to the expenses.
 */

export const DASHBOARD_GRANULARITIES = [
  "week",
  "month",
  "quarter",
  "year",
] as const;
export type DashboardGranularity = (typeof DASHBOARD_GRANULARITIES)[number];
export interface DateRange {
  from: string;
  to: string;
}

const TO_BUDGET_PERIOD = {
  week: "weekly",
  month: "monthly",
  quarter: "quarterly",
  year: "yearly",
} as const;

const pad = (n: number) => String(n).padStart(2, "0");
const parts = (d: string) =>
  d.split("-").map(Number) as [number, number, number];
function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function addMonths(date: string, months: number): string {
  const [y, m] = parts(date);
  const index = m - 1 + months;
  return `${y + Math.floor(index / 12)}-${pad((((index % 12) + 12) % 12) + 1)}-01`;
}

/** The week, month, quarter or year containing `date` (calendar dates, Buenos Aires). */
export function dashboardPeriod(
  granularity: DashboardGranularity,
  date: string,
  firstDayOfWeek: "monday" | "sunday" = "monday",
): DateRange {
  const r = periodContaining(
    TO_BUDGET_PERIOD[granularity],
    date,
    firstDayOfWeek,
  );
  return { from: r.startDate, to: r.endDate };
}

/** The period `steps` periods before (negative) or after (positive) the one given. */
export function shiftPeriod(
  granularity: DashboardGranularity,
  period: DateRange,
  steps: number,
  firstDayOfWeek: "monday" | "sunday" = "monday",
): DateRange {
  const anchor =
    granularity === "week"
      ? addDays(period.from, 7 * steps)
      : addMonths(
          period.from,
          steps *
            (granularity === "month" ? 1 : granularity === "quarter" ? 3 : 12),
        );
  return dashboardPeriod(granularity, anchor, firstDayOfWeek);
}

export type PeriodTiming = "past" | "current" | "future";
export const periodTiming = (period: DateRange, today: string): PeriodTiming =>
  today > period.to ? "past" : today < period.from ? "future" : "current";

/* ------------------------------------------------------------------------------ */
/* Period summary                                                                   */
/* ------------------------------------------------------------------------------ */

export interface CurrencyFlow {
  currency: CurrencyCode;
  income: number;
  expenses: number;
  /** income − expenses (completed). */
  result: number;
  /** Pending, not included above. */
  pendingIncome: number;
  pendingExpenses: number;
}

/** Completed income, expenses and result per currency, plus the pending ones apart. */
export function periodFlow(
  transactions: readonly Transaction[],
  period: DateRange,
  baseCurrency: CurrencyCode,
): CurrencyFlow[] {
  const done = incomeAndExpenses(transactions, period, "current");
  const all = incomeAndExpenses(transactions, period, "projected");
  const currencies = new Set<CurrencyCode>([
    ...all.income.keys(),
    ...all.expenses.keys(),
  ]);
  return [...currencies]
    .sort((a, b) =>
      a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b),
    )
    .map((currency) => {
      const income = done.income.get(currency)?.amount ?? 0;
      const expenses = done.expenses.get(currency)?.amount ?? 0;
      return {
        currency,
        income,
        expenses,
        result: income - expenses,
        pendingIncome: (all.income.get(currency)?.amount ?? 0) - income,
        pendingExpenses: (all.expenses.get(currency)?.amount ?? 0) - expenses,
      };
    });
}

/* ------------------------------------------------------------------------------ */
/* Flow chart                                                                       */
/* ------------------------------------------------------------------------------ */

export interface FlowBucket {
  from: string;
  to: string;
  income: number;
  expenses: number;
  /** Sum of the currency's active account balances at the end of the bucket; null after today. */
  balance: number | null;
}

/**
 * Buckets of the period: days for a week or a month, weeks for a quarter, months for a year.
 * Income and expenses are completed ones of one currency; the balance line is the derived
 * balance of the active accounts of that currency at each bucket's end (never projected).
 */
export function flowSeries(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  options: {
    period: DateRange;
    granularity: DashboardGranularity;
    currency: CurrencyCode;
    today: string;
    cardTypes?: CardTypes;
    firstDayOfWeek?: "monday" | "sunday";
  },
): FlowBucket[] {
  const { period, granularity, currency, today } = options;
  const ranges: DateRange[] = [];
  if (granularity === "week" || granularity === "month") {
    for (let d = period.from; d <= period.to; d = addDays(d, 1))
      ranges.push({ from: d, to: d });
  } else if (granularity === "quarter") {
    for (let d = period.from; d <= period.to; d = addDays(d, 7))
      ranges.push({
        from: d,
        to: addDays(d, 6) > period.to ? period.to : addDays(d, 6),
      });
  } else {
    for (let d = period.from; d <= period.to; d = addMonths(d, 1))
      ranges.push(dashboardPeriod("month", d));
  }
  const own = accounts.filter(
    (a) =>
      a.deletedAt === null && a.status === "active" && a.currency === currency,
  );
  const relevant = transactions.filter((t) => t.currency === currency);
  return ranges.map((r) => {
    const flow = incomeAndExpenses(relevant, r, "current");
    const balance =
      r.from > today || own.length === 0
        ? null
        : own.reduce(
            (sum, a) =>
              sum +
              deriveAccountBalance(a, relevant, {
                mode: "current",
                asOf: r.to < today ? r.to : today,
                cardTypes: options.cardTypes,
              }).amount,
            0,
          );
    return {
      from: r.from,
      to: r.to,
      income: flow.income.get(currency)?.amount ?? 0,
      expenses: flow.expenses.get(currency)?.amount ?? 0,
      balance,
    };
  });
}

/** Balance per currency of the active accounts on a date (the hero for a past period). */
export function balancesAt(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  date: string,
  baseCurrency: CurrencyCode,
  cardTypes?: CardTypes,
): { currency: CurrencyCode; amount: number }[] {
  const totals = new Map<CurrencyCode, number>();
  for (const a of accounts.filter(
    (x) => x.deletedAt === null && x.status === "active",
  )) {
    const b = deriveAccountBalance(a, transactions, {
      mode: "current",
      asOf: date,
      cardTypes,
    });
    totals.set(b.currency, (totals.get(b.currency) ?? 0) + b.amount);
  }
  return [...totals.entries()]
    .sort(([a], [b]) =>
      a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b),
    )
    .map(([currency, amount]) => ({ currency, amount }));
}

/* ------------------------------------------------------------------------------ */
/* Recent movements and what comes next                                             */
/* ------------------------------------------------------------------------------ */

/** Latest live, non-cancelled transactions (pending included and marked), newest first. */
export function recentTransactions(
  transactions: readonly Transaction[],
  limit = 8,
): Transaction[] {
  return transactions
    .filter((t) => t.deletedAt === null && t.status !== "cancelled")
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, limit);
}

export interface UpcomingItem {
  kind: "bill" | "recurrence";
  id: string;
  name: string;
  date: string;
  /** Bills: what is left to pay; recurrences: the planned amount. */
  amount: number;
  currency: CurrencyCode;
  overdue: boolean;
}

/**
 * What is due: pending bills (overdue ones first, with what is left to pay) and the next
 * expense occurrences of running recurrences within `days`. An occurrence already represented
 * by a bill (recurrenceId + occurrenceDate) or a transaction (recurrenceId + date) is skipped,
 * so the same obligation never shows twice.
 */
export function upcomingObligations(
  bills: readonly { bill: Bill; remaining: number }[],
  recurrences: readonly Recurrence[],
  transactions: readonly Transaction[],
  options: { today: string; days?: number; limit?: number },
): UpcomingItem[] {
  const { today, days = 30, limit = 6 } = options;
  const horizon = addDays(today, days);
  const items: UpcomingItem[] = bills
    .filter(
      ({ bill }) =>
        bill.deletedAt === null &&
        bill.status === "pending" &&
        bill.dueDate <= horizon,
    )
    .map(({ bill, remaining }) => ({
      kind: "bill",
      id: bill.id,
      name: bill.name,
      date: bill.dueDate,
      amount: remaining,
      currency: bill.currency,
      overdue: bill.dueDate < today,
    }));
  const materialized = new Set<string>([
    ...bills
      .filter(({ bill }) => bill.recurrenceId && bill.occurrenceDate)
      .map(({ bill }) => `${bill.recurrenceId}|${bill.occurrenceDate}`),
    ...transactions
      .filter((t) => t.recurrenceId && t.deletedAt === null)
      .map((t) => `${t.recurrenceId}|${t.date}`),
  ]);
  for (const r of recurrences) {
    if (r.type !== "expense" || !isRecurrenceRunning(r)) continue;
    for (const date of occurrencesBetween(r, today, horizon, 5)) {
      if (materialized.has(`${r.id}|${date}`)) continue;
      items.push({
        kind: "recurrence",
        id: r.id,
        name: r.description,
        date,
        amount: r.amount,
        currency: r.currency,
        overdue: false,
      });
    }
  }
  return items
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "es-AR"),
    )
    .slice(0, limit);
}

/** Sum of pending expense transactions per currency (scheduled, not yet in the balance). */
export function pendingExpenses(
  transactions: readonly Transaction[],
  baseCurrency: CurrencyCode,
): { currency: CurrencyCode; amount: number }[] {
  const totals = new Map<CurrencyCode, number>();
  for (const t of transactions) {
    if (t.deletedAt !== null || t.status !== "pending" || t.type !== "expense")
      continue;
    totals.set(t.currency, (totals.get(t.currency) ?? 0) + t.amount);
  }
  return [...totals.entries()]
    .sort(([a], [b]) =>
      a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b),
    )
    .map(([currency, amount]) => ({ currency, amount }));
}

/** Share of a period already elapsed on `today` (0–100, whole percent), for the "ritmo" marker. */
export function periodElapsedPercent(period: DateRange, today: string): number {
  if (today < period.from) return 0;
  if (today >= period.to) return 100;
  const day = (d: string) => {
    const [y, m, dd] = parts(d);
    return Date.UTC(y, m - 1, dd) / 86_400_000;
  };
  const total = day(period.to) - day(period.from) + 1;
  return Math.floor(((day(today) - day(period.from) + 1) * 100) / total);
}
