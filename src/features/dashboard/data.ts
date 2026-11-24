import {
  summarizeAccounts,
  type AccountsSummary,
} from "@/domain/rules/accounts";
import { cardTypesOf, type CardTypes } from "@/domain/rules/balances";
import {
  billBalance,
  summarizeBills,
  type BillsIndicators,
} from "@/domain/rules/bills";
import {
  budgetTiming,
  budgetUsage,
  isBudgetArchived,
  type BudgetUsage,
} from "@/domain/rules/budgets";
import {
  cardSchedule,
  summarizeCards,
  type CardsSummary,
} from "@/domain/rules/cards";
import {
  pendingExpenses,
  recentTransactions,
  upcomingObligations,
  type UpcomingItem,
} from "@/domain/rules/dashboard";
import {
  goalProgress,
  sortGoals,
  type GoalProgress,
} from "@/domain/rules/goals";
import { zero, type Money } from "@/domain/money";
import {
  ENTITY_SCHEMAS,
  type Account,
  type Bill,
  type Budget,
  type Card,
  type Category,
  type FinancialSettings,
  type Goal,
  type GoalContribution,
  type Recurrence,
  type Transaction,
} from "@/domain/schemas";
import type { CurrencyCode } from "@/domain/currency";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { toLocalDate } from "@/lib/formatting/date";
import {
  getFinancialSettings,
  type LocalDb,
} from "@/services/storage/local-store";
import {
  loadTransactionFormData,
  type TransactionFormData,
} from "../transactions/form-data";

export interface DashboardBudget {
  budget: Budget;
  usage: BudgetUsage;
  category: Category | null;
}
export interface DashboardGoal {
  goal: Goal;
  progress: GoalProgress;
}
export interface DashboardCard {
  card: Card;
  committed: Money;
  /** creditLimit − committed (credit cards with a limit only). */
  available: number | null;
  nextDue: string | null;
}

export interface DashboardData {
  /** Live records (validated); the period-dependent figures are computed from them in the page. */
  accounts: Account[];
  activeAccounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  cards: Card[];
  cardTypes: CardTypes;
  accountsSummary: AccountsSummary;
  cardsSummary: CardsSummary;
  dashboardCards: DashboardCard[];
  bills: BillsIndicators;
  pending: { currency: CurrencyCode; amount: number }[];
  upcoming: UpcomingItem[];
  recent: Transaction[];
  budgets: DashboardBudget[];
  goals: DashboardGoal[];
  settings: FinancialSettings;
  today: string;
  /** Nothing at all on this device yet (first use). */
  empty: boolean;
  /** For the transaction detail sheet (edit/cancel from the dashboard). */
  form: TransactionFormData;
}

type Store =
  | "accounts"
  | "cards"
  | "categories"
  | "transactions"
  | "bills"
  | "recurrences"
  | "budgets"
  | "goals"
  | "goalContributions";
const STORES: Store[] = [
  "accounts",
  "cards",
  "categories",
  "transactions",
  "bills",
  "recurrences",
  "budgets",
  "goals",
  "goalContributions",
];

/**
 * One read-only IndexedDB transaction over the module stores, then the existing domain
 * selectors. Nothing is written or cached: after any change the page re-reads (useLocalQuery
 * listens to notifyDataChanged), so every indicator follows the data.
 */
export async function loadDashboard(
  db: LocalDb,
  now: Date = new Date(),
): Promise<DashboardData> {
  const tx = db.transaction(STORES, "readonly");
  const raw = await Promise.all(
    STORES.map((s) => tx.objectStore(s).getAll() as Promise<unknown[]>),
  );
  await tx.done;
  const live = <T>(name: Store) =>
    raw[STORES.indexOf(name)]!.filter(
      (r) =>
        ENTITY_SCHEMAS[name].safeParse(r).success &&
        (r as { deletedAt: unknown }).deletedAt === null,
    ) as T[];
  const accounts = live<Account>("accounts").sort((a, b) =>
    a.name.localeCompare(b.name, "es-AR"),
  );
  const cards = live<Card>("cards").sort((a, b) =>
    a.name.localeCompare(b.name, "es-AR"),
  );
  const categories = live<Category>("categories");
  const transactions = live<Transaction>("transactions");
  const bills = live<Bill>("bills");
  const recurrences = live<Recurrence>("recurrences");
  const budgets = live<Budget>("budgets");
  const goals = live<Goal>("goals");
  const contributions = live<GoalContribution>("goalContributions");
  const settings =
    (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS;
  const form = await loadTransactionFormData(db);
  const today = toLocalDate(now);
  const base = settings.baseCurrency;
  const cardTypes = cardTypesOf(cards);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const month = today.slice(0, 7);
  const cardsSummary = summarizeCards(cards, transactions, {
    today,
    baseCurrency: base,
    soonDays: 10,
  });

  return {
    accounts,
    activeAccounts: accounts.filter((a) => a.status === "active"),
    transactions,
    categories,
    cards,
    cardTypes,
    accountsSummary: summarizeAccounts(accounts, transactions, {
      baseCurrency: base,
      mode: "current",
      cardTypes,
    }),
    cardsSummary,
    dashboardCards: cards
      .filter((c) => c.status === "active")
      .map((card) => {
        const committed =
          cardsSummary.committedByCard.get(card.id) ?? zero(card.currency);
        return {
          card,
          committed,
          available:
            card.cardType === "credit" && card.creditLimit !== null
              ? card.creditLimit - committed.amount
              : null,
          nextDue: cardSchedule(card, today).nextDue,
        };
      }),
    bills: summarizeBills(bills, transactions, {
      today,
      period: { from: `${month}-01`, to: `${month}-31` },
      baseCurrency: base,
    }),
    pending: pendingExpenses(transactions, base),
    upcoming: upcomingObligations(
      bills.map((bill) => ({
        bill,
        remaining: billBalance(bill, transactions).remaining,
      })),
      recurrences,
      transactions,
      { today },
    ),
    recent: recentTransactions(transactions),
    budgets: budgets
      .filter(
        (b) => !isBudgetArchived(b) && budgetTiming(b, today) === "current",
      )
      .map((budget) => ({
        budget,
        usage: budgetUsage(budget, transactions, categories),
        category: budget.categoryId
          ? (categoryById.get(budget.categoryId) ?? null)
          : null,
      }))
      .sort(
        (a, b) =>
          (b.usage.percent ?? 0) - (a.usage.percent ?? 0) ||
          a.budget.name.localeCompare(b.budget.name, "es-AR"),
      ),
    goals: sortGoals(
      goals.filter((g) => g.status === "active" && g.archivedAt === null),
    ).map((goal) => ({
      goal,
      progress: goalProgress(goal, contributions, today),
    })),
    settings,
    today,
    empty:
      accounts.length === 0 &&
      transactions.length === 0 &&
      cards.length === 0 &&
      bills.length === 0 &&
      budgets.length === 0 &&
      goals.length === 0,
    form,
  };
}
