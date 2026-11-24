import {
  ENTITY_SCHEMAS,
  type Account,
  type Bill,
  type Budget,
  type Card,
  type Category,
  type Goal,
  type GoalContribution,
  type Recurrence,
  type Transaction,
} from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { toLocalDate } from "@/lib/formatting/date";
import type { ReportInput } from "@/services/reports/build-report";
import { getFinancialSettings, type LocalDb } from "@/services/storage/local-store";

export interface ReportsData extends ReportInput {
  /** Nothing recorded on this device yet. */
  empty: boolean;
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
 * One read-only IndexedDB transaction over the module stores (like the Panel). Only valid,
 * live records reach the report; nothing is written or cached. Any change re-reads the page
 * (useLocalQuery listens to notifyDataChanged); changing a filter recomputes without a read.
 */
export async function loadReports(db: LocalDb, now: Date = new Date()): Promise<ReportsData> {
  const tx = db.transaction(STORES, "readonly");
  const raw = await Promise.all(STORES.map((s) => tx.objectStore(s).getAll() as Promise<unknown[]>));
  await tx.done;
  const live = <T>(name: Store) =>
    raw[STORES.indexOf(name)]!.filter(
      (r) => ENTITY_SCHEMAS[name].safeParse(r).success && (r as { deletedAt: unknown }).deletedAt === null,
    ) as T[];
  const byName = <T extends { name: string }>(list: T[]) => list.sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
  const accounts = byName(live<Account>("accounts"));
  const cards = byName(live<Card>("cards"));
  const categories = byName(live<Category>("categories"));
  const transactions = live<Transaction>("transactions");
  const bills = live<Bill>("bills");
  const budgets = live<Budget>("budgets");
  const goals = live<Goal>("goals");
  return {
    accounts,
    cards,
    categories,
    transactions,
    bills,
    recurrences: live<Recurrence>("recurrences"),
    budgets,
    goals,
    contributions: live<GoalContribution>("goalContributions"),
    settings: (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS,
    today: toLocalDate(now),
    empty:
      accounts.length === 0 &&
      transactions.length === 0 &&
      cards.length === 0 &&
      budgets.length === 0 &&
      goals.length === 0 &&
      bills.length === 0,
  };
}
