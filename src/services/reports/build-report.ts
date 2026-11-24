import type { CurrencyCode } from "@/domain/currency";
import { cardTypesOf } from "@/domain/rules/balances";
import { periodTiming, type PeriodTiming } from "@/domain/rules/dashboard";
import {
  accountsReport,
  budgetsReport,
  bucketsFor,
  cardsReport,
  cashFlowReport,
  categoryBreakdown,
  comparisonRange,
  expectedInRange,
  filterReportTransactions,
  flowByBucket,
  goalSeries,
  goalsReport,
  incomeExpenseReport,
  monthsEnding,
  narrowsMovements,
  reportCurrencies,
  type AccountReportRow,
  type Bucket,
  type BudgetReportRow,
  type BudgetTotals,
  type CardReportRow,
  type CashFlowReport,
  type CategoryBreakdown,
  type DateRange,
  type ExpectedRow,
  type FlowPoint,
  type GoalReportRow,
  type GoalSeriesPoint,
  type IncomeExpenseRow,
  type ReportFilters,
} from "@/domain/rules/reports";
import type {
  Account,
  Bill,
  Budget,
  Card,
  Category,
  FinancialSettings,
  Goal,
  GoalContribution,
  Recurrence,
  Transaction,
} from "@/domain/schemas";

/**
 * Builds the whole report for one set of filters from the records already read (one pass over
 * the selectors in src/domain/rules/reports.ts). The page, the CSV/JSON exporters and the
 * printable view all render THIS object, so they always show the same figures.
 */

export interface ReportInput {
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  transactions: Transaction[];
  bills: Bill[];
  recurrences: Recurrence[];
  budgets: Budget[];
  goals: Goal[];
  contributions: GoalContribution[];
  settings: FinancialSettings;
  today: string;
}

export interface PerCurrency<T> {
  currency: CurrencyCode;
  points: T[];
}

export interface Report {
  filters: ReportFilters;
  range: DateRange;
  previousRange: DateRange;
  timing: PeriodTiming;
  baseCurrency: CurrencyCode;
  /** Every currency with something to show, base first. Never added together. */
  currencies: CurrencyCode[];
  buckets: Bucket[];
  incomeExpenses: IncomeExpenseRow[];
  /** Completed income and expenses per bucket of the range. */
  evolution: PerCurrency<FlowPoint>[];
  /** The 12 calendar months ending with the range's last month. */
  monthly: PerCurrency<FlowPoint>[];
  categories: CategoryBreakdown[];
  cashFlow: CashFlowReport[];
  expected: ExpectedRow[];
  accounts: AccountReportRow[];
  cards: CardReportRow[];
  budgets: { rows: BudgetReportRow[]; totals: BudgetTotals[] };
  goals: GoalReportRow[];
  goalSeries: PerCurrency<GoalSeriesPoint>[];
  /** The movements behind the figures: filtered, in the range, not cancelled, oldest first. */
  transactions: Transaction[];
  /** What makes the figures provisional or partial (shown next to them, never hidden). */
  reliability: {
    /** The range has not ended: figures can still change. */
    partial: boolean;
    /** There are pending movements in the range (shown apart, not in the totals). */
    pending: boolean;
    /** Category or type filter active: accounts, cash flow, budgets and goals ignore it. */
    narrowed: boolean;
  };
  lookups: {
    account: (id: string | null) => string | null;
    category: (id: string | null) => string | null;
    card: (id: string | null) => string | null;
  };
}

export function buildReport(input: ReportInput, filters: ReportFilters): Report {
  const { today, settings } = input;
  const base = settings.baseCurrency;
  const range = filters.range;
  const previousRange = comparisonRange(range, filters.granularity, filters.comparison, settings.firstDayOfWeek);
  const buckets = bucketsFor(range);
  const cardTypes = cardTypesOf(input.cards);
  const filtered = filterReportTransactions(input.transactions, filters, input.categories);
  const incomeExpenses = incomeExpenseReport(filtered, range, previousRange, base);

  const accountCurrencies = new Set(
    input.accounts.filter((a) => filters.accountId === null || a.id === filters.accountId).map((a) => a.currency),
  );
  const currencies = reportCurrencies(
    [
      ...incomeExpenses.map((r) => r.currency),
      ...accountCurrencies,
      ...input.cards.filter((c) => c.status === "active").map((c) => c.currency),
      ...input.budgets.filter((b) => b.startDate <= range.to && b.endDate >= range.from).map((b) => b.currency),
      ...input.goals.filter((g) => g.status !== "cancelled").map((g) => g.currency),
    ],
    base,
  );
  const months = monthsEnding(range.to, 12);
  const inRange = (t: Transaction) => t.date >= range.from && t.date <= range.to;
  const name = <T extends { id: string; name: string }>(list: readonly T[]) => {
    const map = new Map(list.map((x) => [x.id, x.name]));
    return (id: string | null) => (id === null ? null : (map.get(id) ?? null));
  };

  return {
    filters,
    range,
    previousRange,
    timing: periodTiming(range, today),
    baseCurrency: base,
    currencies,
    buckets,
    incomeExpenses,
    evolution: currencies.map((currency) => ({ currency, points: flowByBucket(filtered, buckets, currency) })),
    monthly: currencies.map((currency) => ({ currency, points: flowByBucket(filtered, months, currency) })),
    categories: currencies.flatMap((currency) =>
      (["expense", "income"] as const).map((kind) =>
        categoryBreakdown(filtered, input.categories, {
          currency,
          kind,
          range,
          previousRange,
          rollUp: filters.categoryId === null,
        }),
      ),
    ),
    cashFlow: currencies.map((currency) =>
      cashFlowReport(input.accounts, input.transactions, {
        range,
        buckets,
        currency,
        today,
        accountId: filters.accountId,
        cardTypes,
      }),
    ),
    expected: expectedInRange(input.transactions, input.bills, input.recurrences, {
      range,
      today,
      baseCurrency: base,
      accountId: filters.accountId,
    }),
    accounts: accountsReport(input.accounts, input.transactions, {
      range,
      today,
      accountId: filters.accountId,
      cardTypes,
    }),
    cards: cardsReport(input.cards, filtered, input.transactions, { range, previousRange, buckets, today }),
    budgets: budgetsReport(input.budgets, input.transactions, input.categories, { range, today, baseCurrency: base }),
    goals: goalsReport(input.goals, input.contributions, { range, today }),
    goalSeries: currencies.map((currency) => ({
      currency,
      points: goalSeries(input.goals, input.contributions, { buckets, currency, today }),
    })),
    transactions: filtered
      .filter(inRange)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
    reliability: {
      partial: range.to >= today,
      pending: filtered.some((t) => t.status === "pending" && inRange(t)),
      narrowed: narrowsMovements(filters),
    },
    lookups: {
      account: name(input.accounts),
      category: name(input.categories),
      card: name(input.cards),
    },
  };
}
