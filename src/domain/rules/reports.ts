import type { CurrencyCode } from "../currency";
import type {
  Account,
  Bill,
  Budget,
  Card,
  Category,
  Goal,
  GoalContribution,
  Recurrence,
  Transaction,
} from "../schemas";
import {
  balanceEffect,
  deriveAccountBalance,
  isCreditCardPurchase,
  type CardTypes,
} from "./balances";
import { billBalance } from "./bills";
import {
  budgetCategoryScope,
  budgetExpenses,
  budgetHistory,
  budgetUsage,
  isBudgetArchived,
  type BudgetHistoryPoint,
  type BudgetUsage,
} from "./budgets";
import { daysBetween } from "./cards";
import {
  dashboardPeriod,
  periodFlow,
  shiftPeriod,
  type CurrencyFlow,
  type DateRange,
} from "./dashboard";
import { goalProgress, liveContributions, type GoalProgress } from "./goals";
import { isRecurrenceRunning, occurrencesBetween } from "./recurrence";

/**
 * Reports & analytics selectors (Step 08). Like the Panel (dashboard.ts) they only COMBINE the
 * rules of the earlier modules and never store anything. The rules every figure follows:
 *
 * - One currency at a time: ARS and USD are never added, and nothing is converted.
 * - Income and expenses: COMPLETED transactions (pending shown apart). Transfers, cancelled
 *   and deleted records never count (incomeAndExpenses via periodFlow).
 * - A credit-card purchase is an expense on its purchase date (D4-08 / OD-8 "Relatórios"). It
 *   never leaves an account in the cash flow: there are no card statements or statement
 *   payments yet (OD-8, later step), so a purchase is never counted twice.
 * - A bill payment is an expense transaction (D5-02): the bill itself never adds an expense.
 * - Goal contributions are not transactions: they never appear as income or expenses.
 * - Amounts are integers in minor units (centavos), always with their currency.
 */

/* ------------------------------------------------------------------------------ */
/* Periods and filters                                                              */
/* ------------------------------------------------------------------------------ */

export const REPORT_GRANULARITIES = [
  "week",
  "month",
  "quarter",
  "year",
  "custom",
] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];
export const REPORT_TYPES = ["all", "income", "expense", "transfer"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_COMPARISONS = ["previous", "lastYear"] as const;
export type ReportComparison = (typeof REPORT_COMPARISONS)[number];
export type { DateRange };

export interface ReportFilters {
  range: DateRange;
  granularity: ReportGranularity;
  comparison: ReportComparison;
  /** A category and its subcategories; null = every category. */
  categoryId: string | null;
  /** Movements of this account (as origin or destination); null = every account. */
  accountId: string | null;
  type: ReportType;
}

const pad = (n: number) => String(n).padStart(2, "0");
const parts = (d: string) =>
  d.split("-").map(Number) as [number, number, number];
const lastDay = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
/** Same day `months` later; a day that does not exist becomes the month's last (31/03 → 28/02). */
export function addMonthsClamped(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const index = m - 1 + months;
  const yy = y + Math.floor(index / 12);
  const mm = (((index % 12) + 12) % 12) + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(d, lastDay(yy, mm)))}`;
}
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const monthEnd = (date: string) => {
  const [y, m] = parts(date);
  return `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
};
const minDate = (a: string, b: string) => (a < b ? a : b);
const maxDate = (a: string, b: string) => (a > b ? a : b);

/** Number of calendar days in a range, both ends included. */
export const rangeDays = (r: DateRange) => daysBetween(r.from, r.to) + 1;

/**
 * The range of a granularity around `anchor` (calendar dates, Buenos Aires). A custom range is
 * returned as given, with the ends swapped if they were typed in the wrong order.
 */
export function reportRange(
  granularity: ReportGranularity,
  anchor: string,
  options: {
    firstDayOfWeek?: "monday" | "sunday";
    custom?: DateRange;
  } = {},
): DateRange {
  if (granularity === "custom") {
    const c = options.custom ?? { from: anchor, to: anchor };
    return c.from <= c.to ? c : { from: c.to, to: c.from };
  }
  return dashboardPeriod(granularity, anchor, options.firstDayOfWeek);
}

/**
 * The equivalent range to compare with: the previous period of the same kind (the month before,
 * the quarter before…; a custom range → the same number of days right before it), or the same
 * dates one year earlier.
 */
export function comparisonRange(
  range: DateRange,
  granularity: ReportGranularity,
  comparison: ReportComparison,
  firstDayOfWeek: "monday" | "sunday" = "monday",
): DateRange {
  if (comparison === "lastYear") {
    if (granularity === "week") {
      // The same week of the previous year: 52 weeks back keeps the weekday alignment.
      return { from: addDays(range.from, -364), to: addDays(range.to, -364) };
    }
    const from = addMonthsClamped(range.from, -12);
    const to =
      range.to === monthEnd(range.to)
        ? monthEnd(addMonthsClamped(monthStart(range.to), -12))
        : addMonthsClamped(range.to, -12);
    return { from, to };
  }
  if (granularity === "custom") {
    const length = rangeDays(range);
    const to = addDays(range.from, -1);
    return { from: addDays(to, -(length - 1)), to };
  }
  return shiftPeriod(granularity, range, -1, firstDayOfWeek);
}

export type BucketUnit = "day" | "week" | "month";
export interface Bucket extends DateRange {
  unit: BucketUnit;
}

/**
 * Buckets of a range, clipped to it: days up to 31 days, 7-day blocks up to 92 days, calendar
 * months beyond (the first and last month may be partial).
 */
export function bucketsFor(range: DateRange): Bucket[] {
  const days = rangeDays(range);
  const out: Bucket[] = [];
  if (days <= 31) {
    for (let d = range.from; d <= range.to; d = addDays(d, 1))
      out.push({ from: d, to: d, unit: "day" });
  } else if (days <= 92) {
    for (let d = range.from; d <= range.to; d = addDays(d, 7))
      out.push({ from: d, to: minDate(addDays(d, 6), range.to), unit: "week" });
  } else {
    for (let d = range.from; d <= range.to; d = monthStart(addMonthsClamped(monthStart(d), 1)))
      out.push({ from: d, to: minDate(monthEnd(d), range.to), unit: "month" });
  }
  return out;
}

/** The `count` calendar months ending with the month of `date` (oldest first). */
export function monthsEnding(date: string, count: number): Bucket[] {
  const out: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const from = monthStart(addMonthsClamped(monthStart(date), -i));
    out.push({ from, to: monthEnd(from), unit: "month" });
  }
  return out;
}

/** Live (not deleted) and not cancelled. */
const live = (t: Transaction) => t.deletedAt === null && t.status !== "cancelled";
const inRange = (t: { date: string }, r: DateRange) =>
  t.date >= r.from && t.date <= r.to;

/**
 * The movements the category, account and type filters keep (dates are applied separately so
 * the same filters serve the comparison range). Cancelled and deleted records never pass.
 */
export function filterReportTransactions(
  transactions: readonly Transaction[],
  filters: Pick<ReportFilters, "categoryId" | "accountId" | "type">,
  categories: readonly Category[],
): Transaction[] {
  const scope = budgetCategoryScope(filters.categoryId, categories);
  return transactions.filter(
    (t) =>
      live(t) &&
      (filters.type === "all" || t.type === filters.type) &&
      (filters.accountId === null ||
        t.accountId === filters.accountId ||
        t.destinationAccountId === filters.accountId) &&
      (scope === null || (t.categoryId !== null && scope.has(t.categoryId))),
  );
}

/** True when the category or type filter is narrowing the report (account filter aside). */
export const narrowsMovements = (f: Pick<ReportFilters, "categoryId" | "type">) =>
  f.categoryId !== null || f.type !== "all";

/* ------------------------------------------------------------------------------ */
/* Comparisons                                                                      */
/* ------------------------------------------------------------------------------ */

export interface Delta {
  /** current − previous. */
  amount: number;
  /**
   * Change in whole percent of the previous value (rounded half away from zero); null when the
   * previous value is zero: a percentage would be meaningless (never shown as +100 %).
   */
  percent: number | null;
}
export function delta(current: number, previous: number): Delta {
  const amount = current - previous;
  if (previous === 0) return { amount, percent: null };
  const raw = (amount * 100) / Math.abs(previous);
  return { amount, percent: Math.sign(raw) * Math.round(Math.abs(raw)) };
}

const byBase =
  (base: CurrencyCode) =>
  (a: CurrencyCode, b: CurrencyCode): number =>
    a === base ? -1 : b === base ? 1 : a.localeCompare(b);

/* ------------------------------------------------------------------------------ */
/* A · Income and expenses                                                          */
/* ------------------------------------------------------------------------------ */

export interface IncomeExpenseRow {
  currency: CurrencyCode;
  current: CurrencyFlow;
  previous: CurrencyFlow;
  income: Delta;
  expenses: Delta;
  result: Delta;
  /** Completed movements counted in the current range (income + expenses). */
  movements: number;
}

const emptyFlow = (currency: CurrencyCode): CurrencyFlow => ({
  currency,
  income: 0,
  expenses: 0,
  result: 0,
  pendingIncome: 0,
  pendingExpenses: 0,
});

/** Completed income, expenses and result per currency, against the comparison range. */
export function incomeExpenseReport(
  filtered: readonly Transaction[],
  range: DateRange,
  previousRange: DateRange,
  baseCurrency: CurrencyCode,
): IncomeExpenseRow[] {
  const now = periodFlow(filtered, range, baseCurrency);
  const before = periodFlow(filtered, previousRange, baseCurrency);
  const currencies = [
    ...new Set([...now, ...before].map((f) => f.currency)),
  ].sort(byBase(baseCurrency));
  return currencies.map((currency) => {
    const current = now.find((f) => f.currency === currency) ?? emptyFlow(currency);
    const previous =
      before.find((f) => f.currency === currency) ?? emptyFlow(currency);
    return {
      currency,
      current,
      previous,
      income: delta(current.income, previous.income),
      expenses: delta(current.expenses, previous.expenses),
      result: delta(current.result, previous.result),
      movements: filtered.filter(
        (t) =>
          t.currency === currency &&
          t.status === "completed" &&
          t.type !== "transfer" &&
          inRange(t, range),
      ).length,
    };
  });
}

export interface FlowPoint extends DateRange {
  income: number;
  expenses: number;
  result: number;
}

/** Completed income and expenses of one currency per bucket (no transfers, no pending). */
export function flowByBucket(
  filtered: readonly Transaction[],
  buckets: readonly DateRange[],
  currency: CurrencyCode,
): FlowPoint[] {
  const own = filtered.filter(
    (t) => t.currency === currency && t.status === "completed",
  );
  return buckets.map((b) => {
    let income = 0;
    let expenses = 0;
    for (const t of own) {
      if (!inRange(t, b)) continue;
      if (t.type === "income") income += t.amount;
      else if (t.type === "expense") expenses += t.amount;
    }
    return { from: b.from, to: b.to, income, expenses, result: income - expenses };
  });
}

/** Currencies with anything to show, the base one first. */
export function reportCurrencies(
  values: Iterable<CurrencyCode>,
  baseCurrency: CurrencyCode,
): CurrencyCode[] {
  return [...new Set(values)].sort(byBase(baseCurrency));
}

/* ------------------------------------------------------------------------------ */
/* C · Categories                                                                   */
/* ------------------------------------------------------------------------------ */

export interface CategoryShare {
  /** Category id (top-level, or the exact one when a category filter is set); null = none. */
  categoryId: string | null;
  amount: number;
  previous: number;
  /** Share of the total in basis points (0–10 000), rounded. */
  share: number;
  delta: Delta;
  movements: number;
}
export interface CategoryBreakdown {
  currency: CurrencyCode;
  kind: "income" | "expense";
  total: number;
  previousTotal: number;
  rows: CategoryShare[];
}

/**
 * Completed income or expenses of one currency by category, largest first. Without a category
 * filter subcategories roll up to their top-level category; with one, the filtered category's
 * own subcategories are shown. Every movement counts once.
 */
export function categoryBreakdown(
  filtered: readonly Transaction[],
  categories: readonly Category[],
  options: {
    currency: CurrencyCode;
    kind: "income" | "expense";
    range: DateRange;
    previousRange: DateRange;
    rollUp: boolean;
  },
): CategoryBreakdown {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const key = (id: string | null): string | null => {
    if (!options.rollUp) return id;
    let current = id ? byId.get(id) : undefined;
    for (let guard = 0; current && current.parentId !== null && guard < 10; guard++)
      current = byId.get(current.parentId);
    return current?.id ?? id;
  };
  const now = new Map<string | null, { amount: number; movements: number }>();
  const before = new Map<string | null, number>();
  for (const t of filtered) {
    if (t.type !== options.kind || t.currency !== options.currency || t.status !== "completed")
      continue;
    const k = key(t.categoryId);
    if (inRange(t, options.range)) {
      const row = now.get(k) ?? { amount: 0, movements: 0 };
      row.amount += t.amount;
      row.movements++;
      now.set(k, row);
    } else if (inRange(t, options.previousRange)) {
      before.set(k, (before.get(k) ?? 0) + t.amount);
    }
  }
  const total = [...now.values()].reduce((s, r) => s + r.amount, 0);
  const previousTotal = [...before.values()].reduce((s, v) => s + v, 0);
  const keys = new Set([...now.keys(), ...before.keys()]);
  const rows = [...keys]
    .map((categoryId) => {
      const amount = now.get(categoryId)?.amount ?? 0;
      const previous = before.get(categoryId) ?? 0;
      return {
        categoryId,
        amount,
        previous,
        share: total === 0 ? 0 : Math.round((amount * 10_000) / total),
        delta: delta(amount, previous),
        movements: now.get(categoryId)?.movements ?? 0,
      };
    })
    .sort((a, b) => b.amount - a.amount || b.previous - a.previous);
  return { currency: options.currency, kind: options.kind, total, previousTotal, rows };
}

/* ------------------------------------------------------------------------------ */
/* B · Cash flow                                                                    */
/* ------------------------------------------------------------------------------ */

export interface CashFlowPoint extends DateRange {
  /** Completed income into the accounts. */
  inflow: number;
  /** Completed expenses that left the accounts (credit-card purchases do not, D4-08). */
  outflow: number;
  /** Transfers from / to accounts outside the selection (internal ones cancel out). */
  transfersIn: number;
  transfersOut: number;
  /** Change of the accounts' balance: inflow − outflow + transfersIn − transfersOut. */
  net: number;
  /** Derived balance of the accounts at the end of the bucket; null when it starts after today. */
  balance: number | null;
}
export interface CashFlowReport {
  currency: CurrencyCode;
  accountIds: string[];
  /** Balance at the end of the day before the range (completed movements). */
  opening: number;
  /** Balance at the end of the range, or today when the range is still running. */
  closing: number;
  inflow: number;
  outflow: number;
  transfersIn: number;
  transfersOut: number;
  net: number;
  points: CashFlowPoint[];
  positive: number;
  negative: number;
  /** Buckets that already started (the rest are in the future and are not judged). */
  judged: number;
}

/**
 * Money in and out of the accounts of one currency (all live accounts, or just the filtered
 * one), per bucket, with the derived balance line. Only completed movements: this is what the
 * balances say, so balance(end) − balance(start) equals the sum of `net`.
 */
export function cashFlowReport(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  options: {
    range: DateRange;
    buckets: readonly DateRange[];
    currency: CurrencyCode;
    today: string;
    accountId: string | null;
    cardTypes?: CardTypes;
  },
): CashFlowReport {
  const { range, currency, today, cardTypes } = options;
  const scope = accounts.filter(
    (a) =>
      a.deletedAt === null &&
      a.currency === currency &&
      (options.accountId === null || a.id === options.accountId),
  );
  const ids = new Set(scope.map((a) => a.id));
  const relevant = transactions.filter(
    (t) =>
      t.currency === currency &&
      t.deletedAt === null &&
      t.status === "completed" &&
      (ids.has(t.accountId) || (t.destinationAccountId !== null && ids.has(t.destinationAccountId))),
  );
  const balanceAt = (date: string) =>
    scope.reduce(
      (sum, a) =>
        sum + deriveAccountBalance(a, relevant, { mode: "current", asOf: date, cardTypes }).amount,
      0,
    );
  const effectOf = (t: Transaction) =>
    [...ids].reduce((s, id) => s + balanceEffect(t, id, cardTypes).amount, 0);
  const points = options.buckets.map((b) => {
    let inflow = 0;
    let outflow = 0;
    let transfersIn = 0;
    let transfersOut = 0;
    for (const t of relevant) {
      if (!inRange(t, b)) continue;
      if (t.type === "income") inflow += effectOf(t);
      else if (t.type === "expense") outflow -= effectOf(t);
      else {
        const e = effectOf(t);
        if (e > 0) transfersIn += e;
        else transfersOut -= e;
      }
    }
    return {
      from: b.from,
      to: b.to,
      inflow,
      outflow,
      transfersIn,
      transfersOut,
      net: inflow - outflow + transfersIn - transfersOut,
      balance: b.from > today || scope.length === 0 ? null : balanceAt(minDate(b.to, today)),
    };
  });
  const sum = (k: "inflow" | "outflow" | "transfersIn" | "transfersOut" | "net") =>
    points.reduce((s, p) => s + p[k], 0);
  const judged = points.filter((p) => p.from <= today);
  return {
    currency,
    accountIds: [...ids],
    opening: balanceAt(addDays(range.from, -1)),
    closing: balanceAt(minDate(range.to, maxDate(today, addDays(range.from, -1)))),
    inflow: sum("inflow"),
    outflow: sum("outflow"),
    transfersIn: sum("transfersIn"),
    transfersOut: sum("transfersOut"),
    net: sum("net"),
    points,
    positive: judged.filter((p) => p.net > 0).length,
    negative: judged.filter((p) => p.net < 0).length,
    judged: judged.length,
  };
}

export interface ExpectedRow {
  currency: CurrencyCode;
  pendingIncome: number;
  pendingExpenses: number;
  /** What is left to pay on pending bills due in the range. */
  billsDue: number;
  /** Planned expense occurrences in the range not yet represented by a bill or transaction. */
  recurring: number;
}

/**
 * What is still expected in the range (never part of the totals; shown as "previsto"): pending
 * transactions, what is left on pending bills due in it, and expense recurrences from today on
 * not yet materialised. A pending bill payment is already "paid" for the bill (D5-02), so it is
 * only counted as a pending expense; an occurrence with a bill or transaction is skipped.
 */
export function expectedInRange(
  transactions: readonly Transaction[],
  bills: readonly Bill[],
  recurrences: readonly Recurrence[],
  options: { range: DateRange; today: string; baseCurrency: CurrencyCode; accountId: string | null },
): ExpectedRow[] {
  const { range, today, accountId } = options;
  const rows = new Map<CurrencyCode, ExpectedRow>();
  const row = (currency: CurrencyCode) => {
    let r = rows.get(currency);
    if (!r) {
      r = { currency, pendingIncome: 0, pendingExpenses: 0, billsDue: 0, recurring: 0 };
      rows.set(currency, r);
    }
    return r;
  };
  for (const t of transactions) {
    if (t.deletedAt !== null || t.status !== "pending" || !inRange(t, range)) continue;
    if (accountId !== null && t.accountId !== accountId) continue;
    if (t.type === "income") row(t.currency).pendingIncome += t.amount;
    else if (t.type === "expense") row(t.currency).pendingExpenses += t.amount;
  }
  for (const bill of bills) {
    if (bill.deletedAt !== null || bill.status !== "pending" || !inRange({ date: bill.dueDate }, range)) continue;
    if (accountId !== null && bill.accountId !== accountId) continue;
    const { remaining } = billBalance(bill, transactions);
    if (remaining > 0) row(bill.currency).billsDue += remaining;
  }
  const materialized = new Set<string>([
    ...bills
      .filter((b) => b.deletedAt === null && b.recurrenceId && b.occurrenceDate)
      .map((b) => `${b.recurrenceId}|${b.occurrenceDate}`),
    ...transactions
      .filter((t) => t.recurrenceId && t.deletedAt === null)
      .map((t) => `${t.recurrenceId}|${t.date}`),
  ]);
  const from = maxDate(range.from, today);
  if (from <= range.to) {
    for (const r of recurrences) {
      if (r.type !== "expense" || !isRecurrenceRunning(r)) continue;
      if (accountId !== null && r.accountId !== accountId) continue;
      for (const date of occurrencesBetween(r, from, range.to, 400)) {
        if (!materialized.has(`${r.id}|${date}`)) row(r.currency).recurring += r.amount;
      }
    }
  }
  return [...rows.values()]
    .filter((r) => r.pendingIncome + r.pendingExpenses + r.billsDue + r.recurring > 0)
    .sort((a, b) => byBase(options.baseCurrency)(a.currency, b.currency));
}

/* ------------------------------------------------------------------------------ */
/* D · Accounts                                                                     */
/* ------------------------------------------------------------------------------ */

export interface AccountReportRow {
  account: Account;
  opening: number;
  closing: number;
  income: number;
  /** Expenses that left the account (debit / prepaid purchases included). */
  expenses: number;
  /** Credit-card purchases charged to this account: expenses, but not out of it yet (D4-08). */
  creditPurchases: number;
  transfersIn: number;
  transfersOut: number;
  /** Completed operations in the range, by type. */
  operations: { income: number; expense: number; transfer: number };
  /** Pending operations in the range (not in any figure above). */
  pending: number;
}

/** Per live account: balances at both ends and what moved it in the range (completed only). */
export function accountsReport(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  options: { range: DateRange; today: string; accountId: string | null; cardTypes?: CardTypes },
): AccountReportRow[] {
  const { range, today, cardTypes } = options;
  const end = minDate(range.to, maxDate(today, addDays(range.from, -1)));
  return accounts
    .filter((a) => a.deletedAt === null && (options.accountId === null || a.id === options.accountId))
    .map((account) => {
      const own = transactions.filter(
        (t) =>
          t.deletedAt === null &&
          t.currency === account.currency &&
          (t.accountId === account.id || t.destinationAccountId === account.id),
      );
      const row: AccountReportRow = {
        account,
        opening: deriveAccountBalance(account, own, { mode: "current", asOf: addDays(range.from, -1), cardTypes }).amount,
        closing: deriveAccountBalance(account, own, { mode: "current", asOf: end, cardTypes }).amount,
        income: 0,
        expenses: 0,
        creditPurchases: 0,
        transfersIn: 0,
        transfersOut: 0,
        operations: { income: 0, expense: 0, transfer: 0 },
        pending: 0,
      };
      for (const t of own) {
        if (!inRange(t, range) || t.status === "cancelled") continue;
        if (t.status === "pending") {
          row.pending++;
          continue;
        }
        row.operations[t.type]++;
        if (t.type === "income") row.income += t.amount;
        else if (t.type === "expense") {
          if (isCreditCardPurchase(t, cardTypes)) row.creditPurchases += t.amount;
          else row.expenses += t.amount;
        } else if (t.destinationAccountId === account.id) row.transfersIn += t.amount;
        else row.transfersOut += t.amount;
      }
      return row;
    });
}

/* ------------------------------------------------------------------------------ */
/* E · Cards                                                                        */
/* ------------------------------------------------------------------------------ */

export interface CardUsagePoint extends DateRange {
  /** Credit card: purchases (not cancelled) up to the end of the bucket. */
  committed: number;
  /** committed / limit, whole percent rounded down; null without a credit limit. */
  utilization: number | null;
}
export interface CardReportRow {
  card: Card;
  /** Completed purchases in the range. */
  purchases: number;
  purchasesCount: number;
  /** Pending purchases in the range (not in `purchases`). */
  pendingPurchases: number;
  previousPurchases: number;
  delta: Delta;
  /** Credit card: committed at the end of the range (pending purchases included, D2-11). */
  committed: number | null;
  utilization: number | null;
  points: CardUsagePoint[];
}

/**
 * Purchases per card in the range (category, account and type filters apply) and, for credit
 * cards, the committed amount and the use of the limit over time. Statement payments do not
 * exist yet (OD-8), so nothing is ever subtracted from "committed" and nothing counts twice.
 */
export function cardsReport(
  cards: readonly Card[],
  filtered: readonly Transaction[],
  allTransactions: readonly Transaction[],
  options: { range: DateRange; previousRange: DateRange; buckets: readonly DateRange[]; today: string },
): CardReportRow[] {
  const { range, previousRange, today } = options;
  return cards
    .filter((c) => c.deletedAt === null)
    .map((card) => {
      const purchases = filtered.filter((t) => t.cardId === card.id && t.type === "expense");
      let amount = 0;
      let count = 0;
      let pending = 0;
      let previous = 0;
      for (const t of purchases) {
        if (inRange(t, range)) {
          if (t.status === "completed") {
            amount += t.amount;
            count++;
          } else pending += t.amount;
        } else if (inRange(t, previousRange) && t.status === "completed") previous += t.amount;
      }
      const isCredit = card.cardType === "credit";
      const credit = allTransactions.filter((t) => t.cardId === card.id && t.type === "expense" && live(t));
      const committedAt = (date: string) => credit.reduce((s, t) => (t.date <= date ? s + t.amount : s), 0);
      const use = (c: number) =>
        card.creditLimit !== null && card.creditLimit > 0 ? Math.floor((c * 100) / card.creditLimit) : null;
      const committed = isCredit ? committedAt(range.to) : null;
      return {
        card,
        purchases: amount,
        purchasesCount: count,
        pendingPurchases: pending,
        previousPurchases: previous,
        delta: delta(amount, previous),
        committed,
        utilization: committed === null ? null : use(committed),
        points: isCredit
          ? options.buckets
              .filter((b) => b.from <= today)
              .map((b) => {
                const c = committedAt(b.to);
                return { from: b.from, to: b.to, committed: c, utilization: use(c) };
              })
          : [],
      };
    });
}

/* ------------------------------------------------------------------------------ */
/* F · Budgets                                                                      */
/* ------------------------------------------------------------------------------ */

export interface BudgetReportRow {
  budget: Budget;
  category: Category | null;
  /** Usage over the budget's own period (budgets.ts). */
  usage: BudgetUsage;
  /** The previous period of the same budget against the same limit, then this one. */
  history: BudgetHistoryPoint[];
  previousSpent: number | null;
  delta: Delta | null;
  /** The budget's period is not over yet: its figures can still change. */
  running: boolean;
}
export interface BudgetTotals {
  currency: CurrencyCode;
  budgeted: number;
  /** Completed spending, each expense counted once even under a parent and a child budget. */
  spent: number;
  exceeded: number;
  count: number;
}

/** Non-archived budgets whose period overlaps the range, by usage (highest first). */
export function budgetsReport(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  categories: readonly Category[],
  options: { range: DateRange; today: string; baseCurrency: CurrencyCode },
): { rows: BudgetReportRow[]; totals: BudgetTotals[] } {
  const { range, today } = options;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chosen = budgets.filter(
    (b) => b.deletedAt === null && !isBudgetArchived(b) && b.startDate <= range.to && b.endDate >= range.from,
  );
  const rows = chosen
    .map((budget) => {
      const history = budgetHistory(budget, transactions, categories, 1);
      const prev = history.length > 1 ? history[0]!.spent : null;
      const usage = budgetUsage(budget, transactions, categories);
      return {
        budget,
        category: budget.categoryId ? (byId.get(budget.categoryId) ?? null) : null,
        usage,
        history,
        previousSpent: prev,
        delta: prev === null ? null : delta(usage.spent, prev),
        running: budget.endDate >= today,
      };
    })
    .sort(
      (a, b) =>
        (b.usage.percent ?? 0) - (a.usage.percent ?? 0) ||
        a.budget.name.localeCompare(b.budget.name, "es-AR"),
    );
  const currencies = reportCurrencies(chosen.map((b) => b.currency), options.baseCurrency);
  const totals = currencies.map((currency) => {
    const own = chosen.filter((b) => b.currency === currency);
    const counted = new Map<string, number>();
    for (const b of own)
      for (const t of budgetExpenses(b, transactions, categories))
        if (t.status === "completed") counted.set(t.id, t.amount);
    return {
      currency,
      budgeted: own.reduce((s, b) => s + b.amount, 0),
      spent: [...counted.values()].reduce((s, v) => s + v, 0),
      exceeded: rows.filter((r) => r.budget.currency === currency && r.usage.state === "exceeded").length,
      count: own.length,
    };
  });
  return { rows, totals };
}

/* ------------------------------------------------------------------------------ */
/* G · Goals                                                                        */
/* ------------------------------------------------------------------------------ */

export interface GoalReportRow {
  goal: Goal;
  progress: GoalProgress;
  /** Live contributions dated in the range. */
  contributedInRange: number;
  contributionsInRange: number;
  /**
   * Observed saving pace: live contributions of the last 90 days up to today, per 30 days.
   * Null when there are fewer than two contributions in that window (not enough to say).
   */
  pacePerMonth: number | null;
  /** Estimated date to reach the target at the observed pace (an estimate, never a promise). */
  estimatedDate: string | null;
}

export interface GoalSeriesPoint extends DateRange {
  contributed: number;
  /** Saved at the end of the bucket: initial amounts + live contributions up to then. */
  accumulated: number;
}

/** Goals that were not cancelled (active, completed, archived ones keep their history). */
export function goalsReport(
  goals: readonly Goal[],
  contributions: readonly GoalContribution[],
  options: { range: DateRange; today: string },
): GoalReportRow[] {
  const { range, today } = options;
  const windowFrom = addDays(today, -89);
  return goals
    .filter((g) => g.deletedAt === null && g.status !== "cancelled")
    .map((goal) => {
      const own = liveContributions(goal.id, contributions);
      const progress = goalProgress(goal, contributions, today);
      const recent = own.filter((c) => c.date >= windowFrom && c.date <= today);
      const pacePerMonth = recent.length >= 2 ? Math.floor((recent.reduce((s, c) => s + c.amount, 0) * 30) / 90) : null;
      let estimatedDate: string | null = null;
      if (goal.status === "active" && !progress.reached && pacePerMonth !== null && pacePerMonth > 0) {
        estimatedDate = addMonthsClamped(today, Math.ceil(progress.remaining / pacePerMonth));
      }
      const inside = own.filter((c) => inRange(c, range));
      return {
        goal,
        progress,
        contributedInRange: inside.reduce((s, c) => s + c.amount, 0),
        contributionsInRange: inside.length,
        pacePerMonth,
        estimatedDate,
      };
    });
}

/** Contributions per bucket and the accumulated saved amount, for the goals of one currency. */
export function goalSeries(
  goals: readonly Goal[],
  contributions: readonly GoalContribution[],
  options: { buckets: readonly DateRange[]; currency: CurrencyCode; today: string },
): GoalSeriesPoint[] {
  const own = goals.filter((g) => g.deletedAt === null && g.status !== "cancelled" && g.currency === options.currency);
  const all = own.flatMap((g) => liveContributions(g.id, contributions));
  return options.buckets
    .filter((b) => b.from <= options.today)
    .map((b) => ({
      from: b.from,
      to: b.to,
      contributed: all.filter((c) => inRange(c, b)).reduce((s, c) => s + c.amount, 0),
      // The initial amount counts from the goal's start date; contributions from their own date.
      accumulated:
        own.reduce((s, g) => (g.startDate <= b.to ? s + g.initialAmount : s), 0) +
        all.filter((c) => c.date <= b.to).reduce((s, c) => s + c.amount, 0),
    }));
}
