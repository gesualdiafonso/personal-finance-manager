import {
  ENTITY_SCHEMAS,
  type Account,
  type Card,
  type Category,
  type Transaction,
} from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { getFinancialSettings, type LocalDb } from "@/services/storage/local-store";
import { exchangeContextOf, type ExchangeContext } from "@/features/exchange/conversion";

export interface CategoryOption {
  category: Category;
  /** "Padre › Hija" for children. */
  label: string;
}

export interface TransactionFormData {
  /** Active accounts only (D4-07). */
  accounts: Account[];
  /** Active cards whose paying account is active (D4-07). */
  cards: Card[];
  /** Active categories by type, most used first then alphabetical. */
  categories: { income: CategoryOption[]; expense: CategoryOption[] };
  /** Primary currency and rate sets, for the estimate of a foreign-currency movement. */
  exchange: ExchangeContext;
}

/** What the new-transaction form needs, in one read-only IndexedDB transaction. */
export async function loadTransactionFormData(
  db: LocalDb,
): Promise<TransactionFormData> {
  const tx = db.transaction(
    ["accounts", "cards", "categories", "transactions"],
    "readonly",
  );
  const [ra, rc, rk, rt] = await Promise.all([
    tx.objectStore("accounts").getAll(),
    tx.objectStore("cards").getAll(),
    tx.objectStore("categories").getAll(),
    tx.objectStore("transactions").getAll(),
  ]);
  await tx.done;
  const ok = <T>(
    name: "accounts" | "cards" | "categories" | "transactions",
    rows: unknown[],
  ) =>
    rows.filter(
      (r) =>
        ENTITY_SCHEMAS[name].safeParse(r).success &&
        (r as { deletedAt: unknown }).deletedAt === null,
    ) as T[];
  const accounts = ok<Account>("accounts", ra)
    .filter((a) => a.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
  const activeIds = new Set(accounts.map((a) => a.id));
  const cards = ok<Card>("cards", rc)
    .filter(
      (c) =>
        c.status === "active" &&
        c.accountId !== null &&
        activeIds.has(c.accountId),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
  const categories = ok<Category>("categories", rk).filter((c) => c.isActive);
  const usage = new Map<string, number>();
  for (const t of ok<Transaction>("transactions", rt))
    if (t.categoryId)
      usage.set(t.categoryId, (usage.get(t.categoryId) ?? 0) + 1);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const options = (type: Category["type"]) =>
    categories
      .filter((c) => c.type === type)
      .map((c) => ({
        category: c,
        label:
          c.parentId && byId.get(c.parentId)
            ? `${byId.get(c.parentId)!.name} › ${c.name}`
            : c.name,
      }))
      .sort(
        (a, b) =>
          (usage.get(b.category.id) ?? 0) - (usage.get(a.category.id) ?? 0) ||
          a.label.localeCompare(b.label, "es-AR"),
      );
  const settings = (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS;
  return {
    accounts,
    cards,
    categories: { income: options("income"), expense: options("expense") },
    exchange: exchangeContextOf(settings),
  };
}
