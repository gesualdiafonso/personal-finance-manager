import {
  billBalance,
  billDisplayStatus,
  dueGroup,
  sortBills,
  summarizeBills,
  type BillBalance,
  type BillDisplayStatus,
  type BillsIndicators,
  type DueGroup,
} from "@/domain/rules/bills";
import {
  ENTITY_SCHEMAS,
  type Account,
  type Bill,
  type Category,
  type FinancialSettings,
  type Recurrence,
  type Transaction,
} from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { toLocalDate } from "@/lib/formatting/date";
import {
  getFinancialSettings,
  type LocalDb,
} from "@/services/storage/local-store";

export interface BillRow {
  bill: Bill;
  balance: BillBalance;
  status: BillDisplayStatus;
  /** Only for pending bills. */
  group: DueGroup | null;
  account: Account | null;
  category: Category | null;
  /** Payments (cancelled ones included) — the history shown in the detail. */
  payments: Transaction[];
  localOnly: boolean;
}

export interface BillsView {
  rows: BillRow[];
  indicators: BillsIndicators;
  /** Active accounts, for the form. */
  accounts: Account[];
  /** Every live account (names in history), archived included. */
  allAccounts: Account[];
  /** Active expense categories, for the form (D5-15). */
  categories: Category[];
  allCategories: Category[];
  recurrences: Recurrence[];
  settings: FinancialSettings;
  today: string;
  invalid: number;
}

const live = <T extends { deletedAt: string | null }>(
  name: "accounts" | "categories" | "bills" | "transactions" | "recurrences",
  rows: unknown[],
) =>
  rows.filter(
    (r) =>
      ENTITY_SCHEMAS[name].safeParse(r).success &&
      (r as { deletedAt: unknown }).deletedAt === null,
  ) as T[];

/**
 * One read-only IndexedDB transaction. Only transactions linked to a bill are kept (there is no
 * `billId` index; the store is read once and filtered — a single user's history is small).
 * Every figure comes from the domain rules in src/domain/rules/bills.ts.
 */
export async function loadBillsView(
  db: LocalDb,
  now: Date = new Date(),
): Promise<BillsView> {
  const tx = db.transaction(
    [
      "bills",
      "accounts",
      "categories",
      "transactions",
      "recurrences",
      "outbox",
    ],
    "readonly",
  );
  const [rawBills, rawAccounts, rawCategories, rawTx, rawRec, outbox] =
    await Promise.all([
      tx.objectStore("bills").getAll(),
      tx.objectStore("accounts").getAll(),
      tx.objectStore("categories").getAll(),
      tx.objectStore("transactions").getAll(),
      tx.objectStore("recurrences").getAll(),
      tx.objectStore("outbox").getAll(),
    ]);
  await tx.done;
  const bills = live<Bill>("bills", rawBills);
  const invalid = rawBills.filter(
    (b) => !ENTITY_SCHEMAS.bills.safeParse(b).success,
  ).length;
  const allAccounts = live<Account>("accounts", rawAccounts).sort((a, b) =>
    a.name.localeCompare(b.name, "es-AR"),
  );
  const allCategories = live<Category>("categories", rawCategories).sort(
    (a, b) => a.name.localeCompare(b.name, "es-AR"),
  );
  const payments = live<Transaction>(
    "transactions",
    rawTx.filter((t) => (t as { billId?: unknown }).billId),
  );
  const settings =
    (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS;
  const today = toLocalDate(now);
  const localOnly = new Set(
    outbox
      .filter((o) => o.exportedIn === null && o.entity === "bills")
      .map((o) => o.recordId),
  );
  const accountById = new Map(allAccounts.map((a) => [a.id, a]));
  const categoryById = new Map(allCategories.map((c) => [c.id, c]));

  const rows: BillRow[] = sortBills(bills).map((bill) => ({
    bill,
    balance: billBalance(bill, payments),
    status: billDisplayStatus(bill, today),
    group: bill.status === "pending" ? dueGroup(bill.dueDate, today) : null,
    account: bill.accountId ? (accountById.get(bill.accountId) ?? null) : null,
    category: bill.categoryId
      ? (categoryById.get(bill.categoryId) ?? null)
      : null,
    payments: payments
      .filter((t) => t.billId === bill.id)
      .sort((a, b) => a.date.localeCompare(b.date)),
    localOnly: localOnly.has(bill.id),
  }));

  const month = today.slice(0, 7);
  return {
    rows,
    indicators: summarizeBills(bills, payments, {
      today,
      period: { from: `${month}-01`, to: `${month}-31` },
      baseCurrency: settings.baseCurrency,
    }),
    accounts: allAccounts.filter((a) => a.status === "active"),
    allAccounts,
    categories: allCategories.filter((c) => c.type === "expense" && c.isActive),
    allCategories,
    recurrences: live<Recurrence>("recurrences", rawRec),
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
