import {
  budgetExpenses,
  budgetHistory,
  budgetTiming,
  isBudgetArchived,
  summarizeBudgets,
  topCategories,
  usageOf,
  type BudgetHistoryPoint,
  type BudgetTiming,
  type BudgetUsage,
  type BudgetsSummary,
  type CategorySpending,
} from "@/domain/rules/budgets";
import {
  contributionHistory,
  goalDisplayStatus,
  goalProgress,
  sortGoals,
  summarizeGoals,
  type GoalDisplayStatus,
  type GoalProgress,
  type GoalsSummary,
} from "@/domain/rules/goals";
import {
  ENTITY_SCHEMAS,
  type Account,
  type Budget,
  type Category,
  type FinancialSettings,
  type Goal,
  type GoalContribution,
  type Transaction,
} from "@/domain/schemas";
import type { CurrencyCode } from "@/domain/currency";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { toLocalDate } from "@/lib/formatting/date";
import {
  getFinancialSettings,
  type LocalDb,
} from "@/services/storage/local-store";

export interface BudgetRow {
  budget: Budget;
  usage: BudgetUsage;
  timing: BudgetTiming;
  archived: boolean;
  category: Category | null;
  /** Expenses counted (completed and pending), newest first. */
  expenses: Transaction[];
  history: BudgetHistoryPoint[];
  /** Share of the period already elapsed (0–100), for the "ritmo esperado" marker; null when not current. */
  pace: number | null;
  localOnly: boolean;
}

export interface GoalRow {
  goal: Goal;
  progress: GoalProgress;
  status: GoalDisplayStatus;
  /** Every contribution, cancelled ones included, newest first. */
  contributions: GoalContribution[];
  localOnly: boolean;
}

export interface PlanningView {
  budgets: BudgetRow[];
  goals: GoalRow[];
  budgetSummary: BudgetsSummary;
  goalSummary: GoalsSummary;
  /** Per currency with spending this month, top-level categories with the most spending. */
  topCategories: { currency: CurrencyCode; rows: CategorySpending[] }[];
  /** Active accounts (contribution origin). */
  accounts: Account[];
  allAccounts: Account[];
  /** Active expense categories (budget form). */
  categories: Category[];
  allCategories: Category[];
  /** Transfers and expenses not cancelled, newest first, that no live contribution uses yet (link choices). */
  linkableTransactions: Transaction[];
  settings: FinancialSettings;
  today: string;
  invalid: number;
}

type Store =
  | "accounts"
  | "categories"
  | "budgets"
  | "transactions"
  | "goals"
  | "goalContributions";
const valid = <T>(name: Store, rows: unknown[]) =>
  rows.filter((r) => ENTITY_SCHEMAS[name].safeParse(r).success) as T[];
const notDeleted = <T extends { deletedAt: string | null }>(rows: T[]) =>
  rows.filter((r) => r.deletedAt === null);

function daysInclusive(from: string, to: string): number {
  const ms = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000) + 1;
}

/**
 * One read-only IndexedDB transaction for the whole area. Every figure comes from the domain
 * rules (src/domain/rules/budgets.ts and goals.ts); nothing here compares percentages.
 */
export async function loadPlanningView(
  db: LocalDb,
  now: Date = new Date(),
): Promise<PlanningView> {
  const stores: Store[] = [
    "accounts",
    "categories",
    "budgets",
    "transactions",
    "goals",
    "goalContributions",
  ];
  const tx = db.transaction([...stores, "outbox"], "readonly");
  const [rawAccounts, rawCategories, rawBudgets, rawTx, rawGoals, rawContrib] =
    (await Promise.all(
      stores.map((s) => tx.objectStore(s).getAll()),
    )) as unknown[][] as [
      unknown[],
      unknown[],
      unknown[],
      unknown[],
      unknown[],
      unknown[],
    ];
  const outbox = await tx.objectStore("outbox").getAll();
  await tx.done;

  const budgets = notDeleted(valid<Budget>("budgets", rawBudgets));
  const goals = notDeleted(valid<Goal>("goals", rawGoals));
  const contributions = notDeleted(
    valid<GoalContribution>("goalContributions", rawContrib),
  );
  const transactions = notDeleted(valid<Transaction>("transactions", rawTx));
  const allAccounts = notDeleted(valid<Account>("accounts", rawAccounts)).sort(
    (a, b) => a.name.localeCompare(b.name, "es-AR"),
  );
  const allCategories = notDeleted(
    valid<Category>("categories", rawCategories),
  ).sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
  const invalid =
    rawBudgets.length -
    valid("budgets", rawBudgets).length +
    rawGoals.length -
    valid("goals", rawGoals).length +
    rawContrib.length -
    valid("goalContributions", rawContrib).length;
  const settings =
    (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS;
  const today = toLocalDate(now);
  const localOnly = new Set(
    outbox
      .filter(
        (o) =>
          o.exportedIn === null &&
          (o.entity === "budgets" || o.entity === "goals"),
      )
      .map((o) => o.recordId),
  );
  const categoryById = new Map(allCategories.map((c) => [c.id, c]));

  const budgetRows: BudgetRow[] = budgets
    .map((budget) => {
      const expenses = budgetExpenses(budget, transactions, allCategories);
      const timing = budgetTiming(budget, today);
      return {
        budget,
        usage: usageOf(budget.amount, expenses),
        timing,
        archived: isBudgetArchived(budget),
        category: budget.categoryId
          ? (categoryById.get(budget.categoryId) ?? null)
          : null,
        expenses,
        history: budgetHistory(budget, transactions, allCategories),
        pace:
          timing === "current"
            ? Math.floor(
                (daysInclusive(budget.startDate, today) * 100) /
                  daysInclusive(budget.startDate, budget.endDate),
              )
            : null,
        localOnly: localOnly.has(budget.id),
      };
    })
    .sort(
      (a, b) =>
        a.budget.startDate.localeCompare(b.budget.startDate) ||
        a.budget.name.localeCompare(b.budget.name, "es-AR"),
    );

  const goalRows: GoalRow[] = sortGoals(goals).map((goal) => {
    const progress = goalProgress(goal, contributions, today);
    return {
      goal,
      progress,
      status: goalDisplayStatus(goal, progress),
      contributions: contributionHistory(goal.id, contributions),
      localOnly: localOnly.has(goal.id),
    };
  });

  const month = today.slice(0, 7);
  const monthRange = { from: `${month}-01`, to: `${month}-31` };
  const currencies = [
    ...new Set(
      transactions
        .filter((t) => t.type === "expense" && t.date.startsWith(month))
        .map((t) => t.currency),
    ),
  ].sort((a, b) =>
    a === settings.baseCurrency
      ? -1
      : b === settings.baseCurrency
        ? 1
        : a.localeCompare(b),
  );
  const linked = new Set(
    contributions
      .filter((c) => c.cancelledAt === null && c.transactionId)
      .map((c) => c.transactionId),
  );

  return {
    budgets: budgetRows,
    goals: goalRows,
    budgetSummary: summarizeBudgets(budgets, transactions, allCategories, {
      today,
      baseCurrency: settings.baseCurrency,
    }),
    goalSummary: summarizeGoals(goals, contributions, {
      today,
      baseCurrency: settings.baseCurrency,
    }),
    topCategories: currencies
      .map((currency) => ({
        currency,
        rows: topCategories(transactions, allCategories, {
          currency,
          ...monthRange,
          budgets,
        }),
      }))
      .filter((x) => x.rows.length > 0),
    accounts: allAccounts.filter((a) => a.status === "active"),
    allAccounts,
    categories: allCategories.filter((c) => c.type === "expense" && c.isActive),
    allCategories,
    linkableTransactions: transactions
      .filter(
        (t) =>
          (t.type === "transfer" || t.type === "expense") &&
          t.status !== "cancelled" &&
          !linked.has(t.id),
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      )
      .slice(0, 50),
    settings,
    today,
    invalid,
  };
}

/** "Hogar › Luz" for a subcategory, the name otherwise. */
export function categoryLabel(
  category: Category | null,
  all: readonly Category[],
): string | null {
  if (!category) return null;
  const parent = category.parentId
    ? all.find((c) => c.id === category.parentId)
    : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}
