import { AppError } from "@/lib/errors/app-error";
import type { CurrencyCode } from "../currency";
import { addMoney, money, type Money, subtractMoney, totalsByCurrency, zero } from "../money";
import type { Account, Card, Transaction } from "../schemas";

/**
 * Balance rules (decisions D2-03, D2-04, D2-11). Balances are DERIVED, never persisted.
 *
 * Every transaction has exactly one balance effect, so nothing is counted twice:
 *   income    +amount on accountId
 *   expense   −amount on accountId
 *   transfer  −amount on accountId AND +amount on destinationAccountId — ONE record, never
 *             two; never counted as income or expense.
 *
 * Status: `completed` counts in the current balance; `pending` only in the projected
 * balance; `cancelled` never. Tombstoned records (deletedAt) never count.
 *
 * Card purchases (cardId ≠ null): OD-8 is open. Until it is decided they do NOT change the
 * account balance; they are reported separately as "committed on cards" (D2-11).
 */
export type BalanceMode = "current" | "projected";

function counts(t: Transaction, mode: BalanceMode): boolean {
  if (t.deletedAt !== null || t.status === "cancelled") return false;
  return mode === "projected" || t.status === "completed";
}

export interface BalanceOptions {
  mode?: BalanceMode;
  /** Only transactions on or before this calendar date count. */
  asOf?: string;
}

/** Signed effect of one transaction on one account, in that transaction's currency. */
export function balanceEffect(t: Transaction, accountId: string): Money {
  const amount = money(t.amount, t.currency as CurrencyCode);
  if (t.cardId !== null) return zero(amount.currency); // D2-11 (OD-8 open)
  if (t.type === "income" && t.accountId === accountId) return amount;
  if (t.type === "expense" && t.accountId === accountId) return money(-t.amount, amount.currency);
  if (t.type === "transfer") {
    if (t.accountId === accountId) return money(-t.amount, amount.currency);
    if (t.destinationAccountId === accountId) return amount;
  }
  return zero(amount.currency);
}

/** currentBalance (derived): initialBalance plus the effect of every counting transaction. */
export function deriveAccountBalance(account: Account, transactions: readonly Transaction[], options: BalanceOptions = {}): Money {
  const mode = options.mode ?? "current";
  let balance = money(account.initialBalance, account.currency as CurrencyCode);
  for (const t of transactions) {
    if (!counts(t, mode)) continue;
    if (options.asOf && t.date > options.asOf) continue;
    if (t.accountId !== account.id && t.destinationAccountId !== account.id) continue;
    if (t.currency !== account.currency) {
      throw new AppError("CURRENCY_MISMATCH", `Transaction ${t.id} (${t.currency}) touches account ${account.id} (${account.currency})`);
    }
    balance = addMoney(balance, balanceEffect(t, account.id));
  }
  return balance;
}

export function deriveAccountBalances(accounts: readonly Account[], transactions: readonly Transaction[], options: BalanceOptions = {}): Map<string, Money> {
  return new Map(accounts.filter((a) => a.deletedAt === null).map((a) => [a.id, deriveAccountBalance(a, transactions, options)]));
}

/** Income and expense totals per currency. Transfers are excluded by definition (D2-03). */
export function incomeAndExpenses(transactions: readonly Transaction[], range: { from: string; to: string }, mode: BalanceMode = "current") {
  const inRange = transactions.filter((t) => counts(t, mode) && t.date >= range.from && t.date <= range.to);
  const income = totalsByCurrency(inRange.filter((t) => t.type === "income").map((t) => money(t.amount, t.currency as CurrencyCode)));
  const expenses = totalsByCurrency(inRange.filter((t) => t.type === "expense").map((t) => money(t.amount, t.currency as CurrencyCode)));
  const currencies = new Set<CurrencyCode>([...income.keys(), ...expenses.keys()]);
  const net = new Map<CurrencyCode, Money>();
  for (const c of currencies) net.set(c, subtractMoney(income.get(c) ?? zero(c), expenses.get(c) ?? zero(c)));
  return { income, expenses, net };
}

/** Card purchases not cancelled, per card ("committed on cards", D2-11). */
export function committedOnCards(cards: readonly Card[], transactions: readonly Transaction[], mode: BalanceMode = "projected"): Map<string, Money> {
  const out = new Map<string, Money>();
  for (const card of cards) {
    if (card.deletedAt !== null) continue;
    let total = zero(card.currency as CurrencyCode);
    for (const t of transactions) {
      if (t.cardId !== card.id || t.type !== "expense" || !counts(t, mode)) continue;
      total = addMoney(total, money(t.amount, t.currency as CurrencyCode));
    }
    out.set(card.id, total);
  }
  return out;
}
