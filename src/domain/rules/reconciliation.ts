import {
  addMoney,
  equalsMoney,
  money,
  subtractMoney,
  zero,
  type Money,
} from "../money";
import type { Account, Transaction } from "../schemas";
import {
  deriveAccountBalance,
  isCreditCardPurchase,
  type CardTypes,
} from "./balances";

/**
 * Account reconciliation (Step 04 §14.3, D4-17). Rebuilds the current balance as an
 * explicit breakdown — initial balance + completed income − completed expenses + transfers
 * in − transfers out — and checks it against the central derivation. It is a CHECK, not a
 * second source of truth: nothing here is stored.
 */
export interface Reconciliation {
  initial: Money;
  income: Money;
  expenses: Money;
  transfersIn: Money;
  transfersOut: Money;
  /** = initial + income − expenses + transfersIn − transfersOut */
  rebuilt: Money;
  /** deriveAccountBalance(account, …) */
  derived: Money;
  matches: boolean;
  /** Not in the current balance, by rule. */
  excluded: { pending: number; cancelled: number; creditCardPurchases: number };
  /** Movements touching this account in another currency (should never exist, D2-02). */
  currencyProblems: string[];
}

export function reconcileAccount(
  account: Account,
  transactions: readonly Transaction[],
  cardTypes?: CardTypes,
): Reconciliation {
  const c = account.currency;
  let income = zero(c);
  let expenses = zero(c);
  let transfersIn = zero(c);
  let transfersOut = zero(c);
  const excluded = { pending: 0, cancelled: 0, creditCardPurchases: 0 };
  const currencyProblems: string[] = [];
  for (const t of transactions) {
    if (t.deletedAt !== null) continue;
    const touches =
      t.accountId === account.id || t.destinationAccountId === account.id;
    if (!touches) continue;
    if (t.currency !== c) {
      currencyProblems.push(t.id);
      continue;
    }
    if (t.status === "cancelled") {
      excluded.cancelled++;
      continue;
    }
    if (t.status === "pending") {
      excluded.pending++;
      continue;
    }
    const amount = money(t.amount, c);
    if (t.type === "income") income = addMoney(income, amount);
    else if (t.type === "expense") {
      if (isCreditCardPurchase(t, cardTypes)) excluded.creditCardPurchases++;
      else expenses = addMoney(expenses, amount);
    } else if (t.destinationAccountId === account.id)
      transfersIn = addMoney(transfersIn, amount);
    else transfersOut = addMoney(transfersOut, amount);
  }
  const initial = money(account.initialBalance, c);
  const rebuilt = subtractMoney(
    addMoney(subtractMoney(addMoney(initial, income), expenses), transfersIn),
    transfersOut,
  );
  let derived: Money;
  try {
    derived = deriveAccountBalance(account, transactions, { cardTypes });
  } catch {
    derived = rebuilt; // a currency problem is reported above; the derivation refuses mixed currencies
  }
  return {
    initial,
    income,
    expenses,
    transfersIn,
    transfersOut,
    rebuilt,
    derived,
    matches: equalsMoney(rebuilt, derived) && currencyProblems.length === 0,
    excluded,
    currencyProblems,
  };
}
