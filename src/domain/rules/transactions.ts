import type { CurrencyCode } from "../currency";
import type { Money } from "../money";
import type { Account, Category, Transaction } from "../schemas";
import { incomeAndExpenses } from "./balances";

/**
 * Transaction list rules (Step 04 §8–9): periods on the Buenos Aires calendar, accent-free
 * search, combinable filters, sorting and the period summary. Pure functions on stored
 * records; the interface only renders their results (no arithmetic in components).
 */

/* ------------------------------------------------------------------------------ */
/* Periods                                                                         */
/* ------------------------------------------------------------------------------ */

export const PERIOD_PRESETS = [
  "today",
  "week",
  "month",
  "prevMonth",
  "last30",
  "last90",
  "year",
  "custom",
  "all",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export interface DateRange {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const parts = (d: string) =>
  d.split("-").map(Number) as [number, number, number];
const fmt = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const utc = (d: string) => {
  const [y, m, day] = parts(d);
  return Date.UTC(y, m - 1, day);
};
const addDays = (d: string, n: number) => fmt(utc(d) + n * 86_400_000);

/**
 * Calendar range of a preset, given TODAY as a Buenos Aires calendar date ("YYYY-MM-DD",
 * from toLocalDate). Pure arithmetic in UTC on calendar dates: the device time zone never
 * decides the financial day (Step 04 §9.3). "all" → null (no date bound).
 */
export function periodRange(
  preset: PeriodPreset,
  today: string,
  options: {
    firstDayOfWeek?: "monday" | "sunday";
    custom?: Partial<DateRange>;
  } = {},
): DateRange | null {
  const [y, m] = parts(today);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const dow = new Date(utc(today)).getUTCDay(); // 0 = Sunday
      const back = options.firstDayOfWeek === "sunday" ? dow : (dow + 6) % 7;
      const from = addDays(today, -back);
      return { from, to: addDays(from, 6) };
    }
    case "month":
      return { from: `${y}-${pad(m)}-01`, to: fmt(Date.UTC(y, m, 0)) };
    case "prevMonth": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: fmt(Date.UTC(py, pm, 0)) };
    }
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "last90":
      return { from: addDays(today, -89), to: today };
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "custom": {
      const from = options.custom?.from || "0000-01-01";
      const to = options.custom?.to || "9999-12-31";
      return from <= to ? { from, to } : { from: to, to: from };
    }
    case "all":
      return null;
  }
}

/* ------------------------------------------------------------------------------ */
/* Search and filters                                                              */
/* ------------------------------------------------------------------------------ */

/** Lower case, no accents, single spaces — "Alimentación" matches "alimentacion". */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface TransactionFilters {
  query: string;
  type: "all" | Transaction["type"];
  accountId: string;
  categoryId: string;
  status: "all" | Transaction["status"];
  currency: "all" | CurrencyCode;
  cardId: string;
}

export const NO_TRANSACTION_FILTERS: TransactionFilters = {
  query: "",
  type: "all",
  accountId: "",
  categoryId: "",
  status: "all",
  currency: "all",
  cardId: "",
};

export function activeFilterCount(f: TransactionFilters): number {
  return (
    Object.keys(NO_TRANSACTION_FILTERS) as (keyof TransactionFilters)[]
  ).filter((k) => f[k].trim() !== NO_TRANSACTION_FILTERS[k]).length;
}

export interface Lookups {
  accounts: ReadonlyMap<string, Pick<Account, "name" | "institution">>;
  categories: ReadonlyMap<string, Pick<Category, "name" | "parentId">>;
}

/** Text searched for one transaction: description, notes, account(s) and institution(s), category (and its parent). */
export function searchableText(t: Transaction, l: Lookups): string {
  const fields: (string | null | undefined)[] = [t.description, t.notes];
  for (const id of [t.accountId, t.destinationAccountId]) {
    const a = id ? l.accounts.get(id) : undefined;
    fields.push(a?.name, a?.institution);
  }
  const c = t.categoryId ? l.categories.get(t.categoryId) : undefined;
  fields.push(c?.name, c?.parentId ? l.categories.get(c.parentId)?.name : null);
  return normalizeText(fields.filter(Boolean).join(" "));
}

/**
 * Every filter combines with AND. A category filter also matches its children. The account
 * filter matches both sides of a transfer. Tombstones never appear.
 */
export function filterTransactions(
  list: readonly Transaction[],
  f: TransactionFilters,
  l: Lookups,
): Transaction[] {
  const words = normalizeText(f.query).split(" ").filter(Boolean);
  return list.filter((t) => {
    if (t.deletedAt !== null) return false;
    if (f.type !== "all" && t.type !== f.type) return false;
    if (f.status !== "all" && t.status !== f.status) return false;
    if (f.currency !== "all" && t.currency !== f.currency) return false;
    if (
      f.accountId &&
      t.accountId !== f.accountId &&
      t.destinationAccountId !== f.accountId
    )
      return false;
    if (f.cardId && t.cardId !== f.cardId) return false;
    if (f.categoryId) {
      const c = t.categoryId ? l.categories.get(t.categoryId) : undefined;
      if (t.categoryId !== f.categoryId && c?.parentId !== f.categoryId)
        return false;
    }
    if (words.length > 0) {
      const text = searchableText(t, l);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------------------ */
/* Sorting (never changes stored data)                                             */
/* ------------------------------------------------------------------------------ */

export const SORT_ORDERS = [
  "dateDesc",
  "dateAsc",
  "amountDesc",
  "amountAsc",
  "description",
] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export function sortTransactions(
  list: readonly Transaction[],
  order: SortOrder,
): Transaction[] {
  const byNewest = (a: Transaction, b: Transaction) =>
    b.date.localeCompare(a.date) ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.id.localeCompare(b.id);
  const copy = [...list];
  switch (order) {
    case "dateDesc":
      return copy.sort(byNewest);
    case "dateAsc":
      return copy.sort((a, b) => -byNewest(a, b));
    // Amounts of different currencies are only compared as numbers for ordering, never added.
    case "amountDesc":
      return copy.sort((a, b) => b.amount - a.amount || byNewest(a, b));
    case "amountAsc":
      return copy.sort((a, b) => a.amount - b.amount || byNewest(a, b));
    case "description":
      return copy.sort(
        (a, b) =>
          a.description.localeCompare(b.description, "es-AR", {
            sensitivity: "base",
          }) || byNewest(a, b),
      );
  }
}

/* ------------------------------------------------------------------------------ */
/* Summary of what is listed                                                       */
/* ------------------------------------------------------------------------------ */

export interface CurrencySummary {
  currency: CurrencyCode;
  income: Money;
  expenses: Money;
  net: Money;
}

/**
 * Totals of the listed (already filtered) transactions, per currency, through the central
 * rule (incomeAndExpenses): transfers never count; cancelled never count; pending count only
 * when the status filter asks for pending — otherwise only completed movements count
 * (D4-02, D4-14). The base currency comes first.
 */
export function summarizeTransactions(
  list: readonly Transaction[],
  statusFilter: TransactionFilters["status"],
  baseCurrency: CurrencyCode = "ARS",
): CurrencySummary[] {
  const countable = list.filter(
    (t) =>
      t.status === "completed" ||
      (statusFilter === "pending" && t.status === "pending"),
  );
  const r = incomeAndExpenses(
    countable,
    { from: "0000-01-01", to: "9999-12-31" },
    "projected",
  );
  const currencies = [
    ...new Set([...r.income.keys(), ...r.expenses.keys()]),
  ].sort((a, b) =>
    a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b),
  );
  const zero = (c: CurrencyCode): Money =>
    ({ amount: 0, currency: c }) as Money;
  return currencies.map((c) => ({
    currency: c,
    income: r.income.get(c) ?? zero(c),
    expenses: r.expenses.get(c) ?? zero(c),
    net: r.net.get(c)!,
  }));
}

/** Signed amount as listed: income +, expense −, transfer unsigned (it is neither). */
export function listedAmount(t: Transaction): {
  amount: number;
  sign: "explicit" | "negative";
} {
  if (t.type === "income") return { amount: t.amount, sign: "explicit" };
  if (t.type === "expense") return { amount: -t.amount, sign: "explicit" };
  return { amount: t.amount, sign: "negative" };
}

/* ------------------------------------------------------------------------------ */
/* Edit, cancel and delete policy (D4-01, D4-03, D4-04, D4-05)                     */
/* ------------------------------------------------------------------------------ */

/** Fields a user may change. The type never changes; a cancelled movement only takes notes. */
export const EDITABLE_FIELDS = [
  "description",
  "amount",
  "currency",
  "categoryId",
  "accountId",
  "destinationAccountId",
  "cardId",
  "date",
  "status",
  "notes",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export function editableFields(
  t: Pick<Transaction, "status">,
): readonly EditableField[] {
  return t.status === "cancelled" ? ["notes"] : EDITABLE_FIELDS;
}

/** Cancel: any movement not cancelled yet. Cancelling is final (D4-03). */
export const canCancel = (t: Pick<Transaction, "status" | "deletedAt">) =>
  t.deletedAt === null && t.status !== "cancelled";
/** Delete (tombstone): only pending or cancelled movements; a completed one is cancelled first (D4-04). */
export const canDelete = (t: Pick<Transaction, "status" | "deletedAt">) =>
  t.deletedAt === null && t.status !== "completed";

export interface BalanceImpact {
  accountId: string;
  before: Money;
  after: Money;
}

/**
 * Effect of replacing `before` with `after` on every account either version touches, through
 * the central derivation (Step 04 §6.6): old account, new account, both sides of a transfer.
 * Accounts whose balance does not change are left out.
 */
export function editImpact(
  before: Transaction,
  after: Transaction,
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  derive: (account: Account, txs: readonly Transaction[]) => Money,
): BalanceImpact[] {
  const ids = new Set(
    [
      before.accountId,
      before.destinationAccountId,
      after.accountId,
      after.destinationAccountId,
    ].filter((x): x is string => Boolean(x)),
  );
  const replaced = transactions.map((t) => (t.id === before.id ? after : t));
  const out: BalanceImpact[] = [];
  for (const id of ids) {
    const account = accounts.find((a) => a.id === id);
    if (!account) continue;
    const b = derive(account, transactions);
    const a = derive(account, replaced);
    if (b.amount !== a.amount) out.push({ accountId: id, before: b, after: a });
  }
  return out;
}
