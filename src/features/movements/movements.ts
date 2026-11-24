import { money, type Money } from "@/domain/money";
import { isCreditCardPurchase, type CardTypes } from "@/domain/rules/balances";
import type { Account, Category, Transaction } from "@/domain/schemas";

/**
 * Movements of one account or card, read-only (Step 03 §12). Transactions are created in
 * Step 04; here they are only listed and filtered. The signed amount is the direction for
 * the account (income +, expense −, transfer out −, transfer in +); a CREDIT-card purchase keeps
 * its sign but is marked, because it does not change the account balance (D4-08). Debit and
 * prepaid purchases are ordinary account expenses.
 */
export interface Movement {
  tx: Transaction;
  signed: Money;
  /** Credit-card purchase: shown, but not part of the account balance (D4-08). */
  viaCard: boolean;
  /** Transfers: the other account. */
  counterpart: Account | null;
  category: Category | null;
}

export function movementsOfAccount(
  accountId: string,
  txs: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
  cardTypes?: CardTypes,
): Movement[] {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  return txs
    .filter(
      (t) =>
        t.deletedAt === null &&
        (t.accountId === accountId || t.destinationAccountId === accountId),
    )
    .map((tx) => {
      const incoming =
        tx.type === "income" ||
        (tx.type === "transfer" && tx.destinationAccountId === accountId);
      const otherId =
        tx.type === "transfer"
          ? tx.accountId === accountId
            ? tx.destinationAccountId
            : tx.accountId
          : null;
      return {
        tx,
        signed: money(incoming ? tx.amount : -tx.amount, tx.currency),
        viaCard: isCreditCardPurchase(tx, cardTypes),
        counterpart: otherId ? (accountById.get(otherId) ?? null) : null,
        category: tx.categoryId
          ? (categoryById.get(tx.categoryId) ?? null)
          : null,
      };
    })
    .sort(byDateDesc);
}

export function movementsOfCard(
  cardId: string,
  txs: readonly Transaction[],
  categories: readonly Category[],
  cardTypes?: CardTypes,
): Movement[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  return txs
    .filter((t) => t.deletedAt === null && t.cardId === cardId)
    .map((tx) => ({
      tx,
      signed: money(tx.type === "income" ? tx.amount : -tx.amount, tx.currency),
      viaCard: isCreditCardPurchase(tx, cardTypes),
      counterpart: null,
      category: tx.categoryId
        ? (categoryById.get(tx.categoryId) ?? null)
        : null,
    }))
    .sort(byDateDesc);
}

function byDateDesc(a: Movement, b: Movement): number {
  return a.tx.date === b.tx.date
    ? b.tx.createdAt.localeCompare(a.tx.createdAt)
    : b.tx.date.localeCompare(a.tx.date);
}

export interface MovementFilters {
  /** "YYYY-MM" or "all". */
  period: string;
  type: "all" | Transaction["type"];
  status: "all" | Transaction["status"];
}

export const NO_FILTERS: MovementFilters = {
  period: "all",
  type: "all",
  status: "all",
};

export function filterMovements(
  list: readonly Movement[],
  f: MovementFilters,
): Movement[] {
  return list.filter(
    (m) =>
      (f.period === "all" || m.tx.date.startsWith(f.period)) &&
      (f.type === "all" || m.tx.type === f.type) &&
      (f.status === "all" || m.tx.status === f.status),
  );
}

/** Months that have movements, newest first. */
export function movementPeriods(list: readonly Movement[]): string[] {
  return [...new Set(list.map((m) => m.tx.date.slice(0, 7)))].sort().reverse();
}
