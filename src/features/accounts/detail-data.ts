import { cardTypesOf, deriveAccountBalance } from "@/domain/rules/balances";
import {
  reconcileAccount,
  type Reconciliation,
} from "@/domain/rules/reconciliation";
import type { Money } from "@/domain/money";
import {
  ENTITY_SCHEMAS,
  type Account,
  type Card,
  type Category,
  type Transaction,
} from "@/domain/schemas";
import type { LocalDb } from "@/services/storage/local-store";
import { movementsOfAccount, type Movement } from "../movements/movements";
import { loadAccountsView, type AccountRow } from "./data";

export interface AccountDetail {
  row: AccountRow;
  projected: Money;
  /** Breakdown of the current balance, checked against the derivation (D4-17). */
  reconciliation: Reconciliation;
  cards: Card[];
  movements: Movement[];
}

/** One account with its derived balances, linked cards and movements; null if missing or deleted. */
export async function loadAccountDetail(
  db: LocalDb,
  id: string,
): Promise<AccountDetail | null> {
  const view = await loadAccountsView(db);
  const row = [...view.active, ...view.archived].find(
    (r) => r.account.id === id,
  );
  if (!row) return null;
  const tx = db.transaction(
    ["transactions", "cards", "categories", "accounts"],
    "readonly",
  );
  const [rawTx, rawCards, rawCategories, rawAccounts] = await Promise.all([
    tx.objectStore("transactions").getAll(),
    tx.objectStore("cards").getAll(),
    tx.objectStore("categories").getAll(),
    tx.objectStore("accounts").getAll(),
  ]);
  await tx.done;
  const transactions = rawTx.filter(
    (t) => ENTITY_SCHEMAS.transactions.safeParse(t).success,
  ) as Transaction[];
  const accounts = rawAccounts.filter(
    (a) => ENTITY_SCHEMAS.accounts.safeParse(a).success,
  ) as Account[];
  const categories = rawCategories.filter(
    (c) => ENTITY_SCHEMAS.categories.safeParse(c).success,
  ) as Category[];
  const cards = (
    rawCards.filter((c) => ENTITY_SCHEMAS.cards.safeParse(c).success) as Card[]
  )
    .filter((c) => c.deletedAt === null && c.accountId === id)
    .sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
  const cardTypes = cardTypesOf(
    rawCards.filter((c) => ENTITY_SCHEMAS.cards.safeParse(c).success) as Card[],
  );
  return {
    row,
    reconciliation: reconcileAccount(row.account, transactions, cardTypes),
    projected: deriveAccountBalance(row.account, transactions, {
      mode: "projected",
      cardTypes: cardTypesOf(
        rawCards.filter(
          (c) => ENTITY_SCHEMAS.cards.safeParse(c).success,
        ) as Card[],
      ),
    }),
    cards,
    movements: movementsOfAccount(
      id,
      transactions,
      accounts,
      categories,
      cardTypesOf(
        rawCards.filter(
          (c) => ENTITY_SCHEMAS.cards.safeParse(c).success,
        ) as Card[],
      ),
    ),
  };
}
