import type { CurrencyCode } from "../currency";
import type { Budget, Category, Transaction } from "../schemas";

/**
 * Budgets (Step 06). Everything here is pure and derived; nothing is stored.
 *
 * What counts as spending of a budget:
 * - expense transactions only — transfers and income never (a transfer moves money, it does
 *   not spend it);
 * - not cancelled, not deleted;
 * - in the budget's currency only (ARS and USD are never mixed, D2-02);
 * - dated inside [startDate, endDate] (calendar dates in Buenos Aires);
 * - for a category budget: the category and all its subcategories; for a general budget
 *   (categoryId null): every expense, with or without category.
 * - "spent" = completed expenses; pending ones are shown apart as "pending" (they may still be
 *   cancelled) and do not change the state. A credit-card purchase is spending on its purchase
 *   date, whatever its effect on the account (D4-08).
 * A transaction is counted once per budget, however many paths lead to it.
 */

/**
 * Thresholds of the visual states, in percent of the limit — the single place where they are
 * defined (components never compare percentages themselves):
 *   within    < 85 %  (Design System: "dentro do ritmo", forest)
 *   attention ≥ 85 %  (Design System: ">85% warning")
 *   near      ≥ 95 % and up to 100 % (limit reached but not passed; warning)
 *   exceeded  > 100 % (spent more than the limit; alert)
 */
export const BUDGET_THRESHOLDS = { attention: 85, near: 95 } as const;
export const BUDGET_STATES = ["within", "attention", "near", "exceeded"] as const;
export type BudgetState = (typeof BUDGET_STATES)[number];

export type BudgetTiming = "current" | "upcoming" | "past";

export function budgetState(spent: number, limit: number): BudgetState {
  if (spent > limit) return "exceeded";
  // Integer comparison (spent·100 vs limit·threshold): no floating point.
  if (spent * 100 >= limit * BUDGET_THRESHOLDS.near) return limit === 0 ? "within" : "near";
  if (spent * 100 >= limit * BUDGET_THRESHOLDS.attention) return "attention";
  return "within";
}

/** Whole percent used, rounded down (101 % shows as 101). Null for a zero limit. */
export function usedPercent(spent: number, limit: number): number | null {
  if (limit <= 0) return null;
  return Math.floor((spent * 100) / limit);
}

export function budgetTiming(b: Pick<Budget, "startDate" | "endDate">, today: string): BudgetTiming {
  if (today < b.startDate) return "upcoming";
  if (today > b.endDate) return "past";
  return "current";
}

export const isBudgetArchived = (b: Pick<Budget, "status">) => b.status === "archived";

/** The category and every descendant (null for a general budget = no filter). */
export function budgetCategoryScope(categoryId: string | null, categories: readonly Category[]): Set<string> | null {
  if (categoryId === null) return null;
  const scope = new Set([categoryId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId !== null && scope.has(c.parentId) && !scope.has(c.id)) {
        scope.add(c.id);
        grew = true;
      }
    }
  }
  return scope;
}

function countsAsSpending(t: Transaction, currency: string, from: string, to: string, scope: Set<string> | null): boolean {
  if (t.type !== "expense" || t.deletedAt !== null || t.status === "cancelled") return false;
  if (t.currency !== currency || t.date < from || t.date > to) return false;
  return scope === null || (t.categoryId !== null && scope.has(t.categoryId));
}

/** The expenses a budget counts (completed and pending), newest first, each once. */
export function budgetExpenses(
  b: Pick<Budget, "categoryId" | "currency" | "startDate" | "endDate">,
  transactions: readonly Transaction[],
  categories: readonly Category[],
  range: { from: string; to: string } = { from: b.startDate, to: b.endDate },
): Transaction[] {
  const scope = budgetCategoryScope(b.categoryId, categories);
  const seen = new Set<string>();
  return transactions
    .filter((t) => {
      if (seen.has(t.id) || !countsAsSpending(t, b.currency, range.from, range.to, scope)) return false;
      seen.add(t.id);
      return true;
    })
    .sort((x, y) => (x.date === y.date ? y.createdAt.localeCompare(x.createdAt) : y.date.localeCompare(x.date)));
}

export interface BudgetUsage {
  limit: number;
  /** Completed expenses. */
  spent: number;
  /** Pending expenses (not in `spent`). */
  pending: number;
  /** limit − spent; negative when exceeded. */
  remaining: number;
  /** spent − limit when exceeded, else 0. */
  over: number;
  percent: number | null;
  state: BudgetState;
  movements: number;
}

export function usageOf(limit: number, expenses: readonly Transaction[]): BudgetUsage {
  let spent = 0;
  let pending = 0;
  for (const t of expenses) {
    if (t.status === "completed") spent += t.amount;
    else pending += t.amount;
  }
  return {
    limit,
    spent,
    pending,
    remaining: limit - spent,
    over: Math.max(0, spent - limit),
    percent: usedPercent(spent, limit),
    state: budgetState(spent, limit),
    movements: expenses.length,
  };
}

export function budgetUsage(b: Budget, transactions: readonly Transaction[], categories: readonly Category[]): BudgetUsage {
  return usageOf(b.amount, budgetExpenses(b, transactions, categories));
}

/* ------------------------------------------------------------------------------ */
/* Periods                                                                          */
/* ------------------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");
const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function monthRange(y: number, m: number, months: number): { startDate: string; endDate: string } {
  const endIndex = m - 1 + months - 1;
  const ey = y + Math.floor(endIndex / 12);
  const em = (endIndex % 12) + 1;
  return { startDate: fmt(y, m, 1), endDate: fmt(ey, em, lastDay(ey, em)) };
}

/**
 * The period that contains `date`: weekly starts on the configured first day of the week;
 * monthly, quarterly (Jan/Apr/Jul/Oct) and yearly follow the calendar. Custom keeps the date.
 */
export function periodContaining(period: Budget["period"], date: string, firstDayOfWeek: "monday" | "sunday" = "monday"): { startDate: string; endDate: string } {
  const [y, m, d] = parts(date);
  switch (period) {
    case "weekly": {
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
      const back = firstDayOfWeek === "monday" ? (weekday + 6) % 7 : weekday;
      const startDate = addDays(date, -back);
      return { startDate, endDate: addDays(startDate, 6) };
    }
    case "monthly":
      return monthRange(y, m, 1);
    case "quarterly":
      return monthRange(y, m - ((m - 1) % 3), 3);
    case "yearly":
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    case "custom":
      return { startDate: date, endDate: date };
  }
}

/** The fixed end date for a period starting on `startDate` (null for custom: the user sets it). */
export function periodEnd(period: Budget["period"], startDate: string): string | null {
  const [y, m] = parts(startDate);
  switch (period) {
    case "weekly":
      return addDays(startDate, 6);
    case "monthly":
      return monthRange(y, m, 1).endDate;
    case "quarterly":
      return monthRange(y, m, 3).endDate;
    case "yearly":
      return `${y}-12-31`;
    case "custom":
      return null;
  }
}

/** The `count` periods before this budget's, oldest first (same length; custom shifts by its own length). */
export function previousPeriods(b: Pick<Budget, "period" | "startDate" | "endDate">, count: number): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const [y, m] = parts(b.startDate);
  for (let i = count; i >= 1; i--) {
    switch (b.period) {
      case "weekly": {
        const from = addDays(b.startDate, -7 * i);
        out.push({ from, to: addDays(from, 6) });
        break;
      }
      case "monthly":
      case "quarterly":
      case "yearly": {
        const step = b.period === "monthly" ? 1 : b.period === "quarterly" ? 3 : 12;
        const index = m - 1 - step * i;
        const yy = y + Math.floor(index / 12);
        const mm = (((index % 12) + 12) % 12) + 1;
        const r = monthRange(yy, mm, step);
        out.push({ from: r.startDate, to: r.endDate });
        break;
      }
      case "custom": {
        const [sy, sm, sd] = parts(b.startDate);
        const [ey, em, ed] = parts(b.endDate);
        const length = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
        const from = addDays(b.startDate, -length * i);
        out.push({ from, to: addDays(from, length - 1) });
        break;
      }
    }
  }
  return out;
}

export interface BudgetHistoryPoint {
  from: string;
  to: string;
  spent: number;
  state: BudgetState;
  /** True for the budget's own period. */
  current: boolean;
}

/** Spending of the same scope in the previous periods, against the same limit, then this period. */
export function budgetHistory(b: Budget, transactions: readonly Transaction[], categories: readonly Category[], count = 5): BudgetHistoryPoint[] {
  const ranges = [...previousPeriods(b, count), { from: b.startDate, to: b.endDate }];
  return ranges.map((r, i) => {
    const usage = usageOf(b.amount, budgetExpenses(b, transactions, categories, r));
    return { from: r.from, to: r.to, spent: usage.spent, state: usage.state, current: i === ranges.length - 1 };
  });
}

/* ------------------------------------------------------------------------------ */
/* Categories with the most spending                                                */
/* ------------------------------------------------------------------------------ */

export interface CategorySpending {
  /** Top-level category id, or null for expenses without category. */
  categoryId: string | null;
  spent: number;
  /** Limit of a current, active budget for exactly this category (same currency), if any. */
  budgeted: number | null;
}

/** Completed expenses of one currency in a range, rolled up to top-level categories, largest first. */
export function topCategories(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  options: { currency: CurrencyCode; from: string; to: string; budgets?: readonly Budget[]; limit?: number },
): CategorySpending[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const root = (id: string | null): string | null => {
    let current = id ? byId.get(id) : undefined;
    for (let guard = 0; current && current.parentId !== null && guard < 10; guard++) current = byId.get(current.parentId);
    return current?.id ?? id;
  };
  const totals = new Map<string | null, number>();
  for (const t of transactions) {
    if (!countsAsSpending(t, options.currency, options.from, options.to, null) || t.status !== "completed") continue;
    const key = root(t.categoryId);
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }
  const limitFor = (categoryId: string | null) => {
    if (categoryId === null) return null;
    const b = (options.budgets ?? []).find(
      (x) => x.deletedAt === null && !isBudgetArchived(x) && x.categoryId === categoryId && x.currency === options.currency && x.startDate <= options.to && x.endDate >= options.from,
    );
    return b ? b.amount : null;
  };
  return [...totals.entries()]
    .map(([categoryId, spent]) => ({ categoryId, spent, budgeted: limitFor(categoryId) }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, options.limit ?? 5);
}

/* ------------------------------------------------------------------------------ */
/* Module summary                                                                   */
/* ------------------------------------------------------------------------------ */

export interface BudgetCurrencySummary {
  currency: CurrencyCode;
  /**
   * "categories": the sum of the current category budgets, and their spending counted once
   * (a parent and a child budget never count the same expense twice).
   * "general": the currency has only general budgets; their limits and spending.
   */
  scope: "categories" | "general";
  budgeted: number;
  spent: number;
}

export interface BudgetsSummary {
  byCurrency: BudgetCurrencySummary[];
  active: number;
  exceeded: number;
  attention: number;
}

/** Current (today inside the period), non-archived budgets only. */
export function summarizeBudgets(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  categories: readonly Category[],
  options: { today: string; baseCurrency: CurrencyCode },
): BudgetsSummary {
  const current = budgets.filter((b) => b.deletedAt === null && !isBudgetArchived(b) && budgetTiming(b, options.today) === "current");
  const currencies = [...new Set(current.map((b) => b.currency))].sort((a, b) =>
    a === options.baseCurrency ? -1 : b === options.baseCurrency ? 1 : a.localeCompare(b),
  );
  const byCurrency = currencies.map((currency) => {
    const own = current.filter((b) => b.currency === currency);
    const categoryBudgets = own.filter((b) => b.categoryId !== null);
    const chosen = categoryBudgets.length > 0 ? categoryBudgets : own;
    const counted = new Map<string, number>();
    for (const b of chosen) for (const t of budgetExpenses(b, transactions, categories)) if (t.status === "completed") counted.set(t.id, t.amount);
    return {
      currency,
      scope: categoryBudgets.length > 0 ? ("categories" as const) : ("general" as const),
      budgeted: chosen.reduce((s, b) => s + b.amount, 0),
      spent: [...counted.values()].reduce((s, v) => s + v, 0),
    };
  });
  let exceeded = 0;
  let attention = 0;
  for (const b of current) {
    const state = budgetUsage(b, transactions, categories).state;
    if (state === "exceeded") exceeded++;
    else if (state !== "within") attention++;
  }
  return { byCurrency, active: current.length, exceeded, attention };
}

/**
 * Two live, active budgets of the same scope, currency and period type must not overlap:
 * the same expense would be budgeted twice (the repository refuses it).
 */
export function overlappingBudget(candidate: Budget, budgets: readonly Budget[]): Budget | null {
  if (isBudgetArchived(candidate) || candidate.deletedAt !== null) return null;
  return (
    budgets.find(
      (b) =>
        b.id !== candidate.id &&
        b.deletedAt === null &&
        !isBudgetArchived(b) &&
        b.categoryId === candidate.categoryId &&
        b.currency === candidate.currency &&
        b.period === candidate.period &&
        b.startDate <= candidate.endDate &&
        b.endDate >= candidate.startDate,
    ) ?? null
  );
}
