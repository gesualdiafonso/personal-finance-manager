import { cardTypesOf, deriveAccountBalance } from "@/domain/rules/balances";
import { editImpact, type BalanceImpact } from "@/domain/rules/transactions";
import {
  ENTITY_SCHEMAS,
  type Account,
  type Card,
  type Transaction,
} from "@/domain/schemas";
import type { LocalDb } from "@/services/storage/local-store";

/**
 * Reads what the impact preview needs and asks the domain (editImpact + deriveAccountBalance)
 * how each affected account's current balance changes. Nothing is computed in the component.
 */
export async function loadEditImpact(
  db: LocalDb,
  before: Transaction,
  after: Transaction,
): Promise<{ impact: BalanceImpact[]; accounts: Map<string, Account> }> {
  const tx = db.transaction(["transactions", "accounts", "cards"], "readonly");
  const [rt, ra, rc] = await Promise.all([
    tx.objectStore("transactions").getAll(),
    tx.objectStore("accounts").getAll(),
    tx.objectStore("cards").getAll(),
  ]);
  await tx.done;
  const transactions = rt.filter(
    (t) => ENTITY_SCHEMAS.transactions.safeParse(t).success,
  ) as Transaction[];
  const accounts = ra.filter(
    (a) => ENTITY_SCHEMAS.accounts.safeParse(a).success && a.deletedAt === null,
  ) as Account[];
  const cardTypes = cardTypesOf(
    rc.filter((c) => ENTITY_SCHEMAS.cards.safeParse(c).success) as Card[],
  );
  const impact = editImpact(
    before,
    after,
    accounts,
    transactions,
    (account, txs) => deriveAccountBalance(account, txs, { cardTypes }),
  );
  return { impact, accounts: new Map(accounts.map((a) => [a.id, a])) };
}
