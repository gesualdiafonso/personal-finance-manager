import {
  ENTITY_SCHEMAS,
  type Category,
  type Transaction,
} from "@/domain/schemas";
import type { LocalDb } from "@/services/storage/local-store";
import { movementsOfCard, type Movement } from "../movements/movements";
import { loadCardsView, type CardRow, type CardsView } from "./data";

export interface CardDetail {
  row: CardRow;
  accounts: CardsView["accounts"];
  movements: Movement[];
}

/** One card with its schedule, committed amount and purchases; null if missing or deleted. */
export async function loadCardDetail(
  db: LocalDb,
  id: string,
  now: Date = new Date(),
): Promise<CardDetail | null> {
  const view = await loadCardsView(db, now);
  const row = [
    ...view.credit,
    ...view.debit,
    ...view.prepaid,
    ...view.archived,
  ].find((r) => r.card.id === id);
  if (!row) return null;
  const tx = db.transaction(["transactions", "categories"], "readonly");
  const [rawTx, rawCategories] = await Promise.all([
    tx.objectStore("transactions").getAll(),
    tx.objectStore("categories").getAll(),
  ]);
  await tx.done;
  const transactions = rawTx.filter(
    (t) => ENTITY_SCHEMAS.transactions.safeParse(t).success,
  ) as Transaction[];
  const categories = rawCategories.filter(
    (c) => ENTITY_SCHEMAS.categories.safeParse(c).success,
  ) as Category[];
  return {
    row,
    accounts: view.accounts,
    movements: movementsOfCard(
      id,
      transactions,
      categories,
      new Map([[row.card.id, row.card.cardType]]),
    ),
  };
}
