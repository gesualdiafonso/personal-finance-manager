import type { Lookups } from "@/domain/rules/transactions";
import {
  ENTITY_SCHEMAS,
  type Account,
  type Card,
  type Category,
  type FinancialSettings,
  type Transaction,
} from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import type { DateRange } from "@/domain/rules/transactions";
import {
  getFinancialSettings,
  type LocalDb,
} from "@/services/storage/local-store";
import { loadTransactionFormData, type TransactionFormData } from "./form-data";

export interface TransactionListData {
  /** Live transactions of the selected period only (read through the `date` index, D4-11). */
  transactions: Transaction[];
  /** Whether this device has any transaction at all (empty state vs. "no results"). */
  anyOnDevice: boolean;
  lookups: Lookups;
  /** For the filter selects: every live account/category/card, archived included (history). */
  accounts: Account[];
  categories: Category[];
  cards: Card[];
  /** Changed here and not exported yet (Ledger: "Solo en este dispositivo"). */
  localOnly: Set<string>;
  settings: FinancialSettings;
  form: TransactionFormData;
}

const valid = <T>(
  name: "accounts" | "cards" | "categories" | "transactions",
  rows: unknown[],
) =>
  rows.filter(
    (r) =>
      ENTITY_SCHEMAS[name].safeParse(r).success &&
      (r as { deletedAt: unknown }).deletedAt === null,
  ) as T[];

/**
 * Reads one period of transactions with an IndexedDB key range on the `date` index — the
 * rest of the history is not loaded (Step 04 §8.5). `range === null` reads everything
 * ("Todo el historial", chosen explicitly by the user).
 */
export async function loadTransactionList(
  db: LocalDb,
  range: DateRange | null,
): Promise<TransactionListData> {
  const tx = db.transaction(
    ["transactions", "accounts", "categories", "cards", "outbox"],
    "readonly",
  );
  const txStore = tx.objectStore("transactions");
  const [rows, count, ra, rk, rc, outbox] = await Promise.all([
    range
      ? txStore.index("date").getAll(IDBKeyRange.bound(range.from, range.to))
      : txStore.getAll(),
    txStore.count(),
    tx.objectStore("accounts").getAll(),
    tx.objectStore("categories").getAll(),
    tx.objectStore("cards").getAll(),
    tx.objectStore("outbox").getAll(),
  ]);
  await tx.done;
  const accounts = valid<Account>("accounts", ra).sort((a, b) =>
    a.name.localeCompare(b.name, "es-AR"),
  );
  const categories = valid<Category>("categories", rk).sort((a, b) =>
    a.name.localeCompare(b.name, "es-AR"),
  );
  const cards = valid<Card>("cards", rc).sort((a, b) =>
    a.name.localeCompare(b.name, "es-AR"),
  );
  return {
    transactions: valid<Transaction>("transactions", rows),
    anyOnDevice: count > 0,
    lookups: {
      accounts: new Map(accounts.map((a) => [a.id, a])),
      categories: new Map(categories.map((c) => [c.id, c])),
    },
    accounts,
    categories,
    cards,
    localOnly: new Set(
      outbox
        .filter((o) => o.exportedIn === null && o.entity === "transactions")
        .map((o) => o.recordId),
    ),
    settings: (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS,
    form: await loadTransactionFormData(db),
  };
}
