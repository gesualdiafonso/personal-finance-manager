import type { CurrencyCode } from "../currency";
import { totalsByCurrency, type Money } from "../money";
import type { Account, Transaction } from "../schemas";
import { deriveAccountBalances, type BalanceMode } from "./balances";

/**
 * Account indicators for the Accounts page (Step 03 §6.2, §13). Derived only from stored
 * records through the central balance rule (deriveAccountBalances) — no parallel arithmetic.
 * Currencies are never added together (D2-02): totals come per currency.
 */
export const BANK_ACCOUNT_TYPES = ["checking", "savings"] as const;

export interface AccountsSummary {
  active: number;
  archived: number;
  /** Active checking and savings accounts. */
  bank: number;
  /** Active cash accounts. */
  cash: number;
  /** Current balance of ACTIVE accounts, one entry per currency, base currency first. */
  balances: Money[];
  /** Current balance of every live account (active and archived), by id. */
  byAccount: Map<string, Money>;
}

export function summarizeAccounts(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  options: { baseCurrency?: CurrencyCode; mode?: BalanceMode } = {},
): AccountsSummary {
  const live = accounts.filter((a) => a.deletedAt === null);
  const active = live.filter((a) => a.status === "active");
  const byAccount = deriveAccountBalances(live, transactions, {
    mode: options.mode ?? "current",
  });
  const totals = totalsByCurrency(active.map((a) => byAccount.get(a.id)!));
  const base = options.baseCurrency ?? "ARS";
  const balances = [...totals.values()].sort((a, b) =>
    a.currency === base
      ? -1
      : b.currency === base
        ? 1
        : a.currency.localeCompare(b.currency),
  );
  return {
    active: active.length,
    archived: live.length - active.length,
    bank: active.filter((a) =>
      (BANK_ACCOUNT_TYPES as readonly string[]).includes(a.accountType),
    ).length,
    cash: active.filter((a) => a.accountType === "cash").length,
    balances,
    byAccount,
  };
}
