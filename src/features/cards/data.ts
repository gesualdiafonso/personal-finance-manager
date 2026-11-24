import type { Money } from "@/domain/money";
import {
  cardSchedule,
  summarizeCards,
  type CardSchedule,
  type CardsSummary,
} from "@/domain/rules/cards";
import {
  ENTITY_SCHEMAS,
  type Account,
  type Card,
  type Transaction,
} from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { toLocalDate } from "@/lib/formatting/date";
import { countReferencesIn } from "@/services/repositories/repositories";
import {
  getFinancialSettings,
  type LocalDb,
} from "@/services/storage/local-store";

export interface CardRow {
  card: Card;
  /** Paying account (null only for cards migrated from 1.x, D3-03). */
  account: Account | null;
  committed: Money;
  schedule: CardSchedule;
  /** Live transactions using this card (D2-06: > 0 → archive only, account locked). */
  references: number;
  localOnly: boolean;
}

export interface CardsView {
  credit: CardRow[];
  debit: CardRow[];
  prepaid: CardRow[];
  archived: CardRow[];
  summary: CardsSummary;
  /** Accounts a card can be attached to (active ones), for the form. */
  accounts: Account[];
  today: string;
  invalid: number;
}

const byName = (a: CardRow, b: CardRow) =>
  a.card.name.localeCompare(b.card.name, "es-AR");

/** One read-only IndexedDB transaction; indicators through the domain rules only. */
export async function loadCardsView(
  db: LocalDb,
  now: Date = new Date(),
): Promise<CardsView> {
  const tx = db.transaction(
    ["cards", "accounts", "transactions", "outbox"],
    "readonly",
  );
  const [rawCards, rawAccounts, rawTx, outbox] = await Promise.all([
    tx.objectStore("cards").getAll(),
    tx.objectStore("accounts").getAll(),
    tx.objectStore("transactions").getAll(),
    tx.objectStore("outbox").getAll(),
  ]);
  await tx.done;
  const cards = rawCards.filter(
    (c) => ENTITY_SCHEMAS.cards.safeParse(c).success && c.deletedAt === null,
  ) as Card[];
  const invalid =
    rawCards.length -
    rawCards.filter((c) => ENTITY_SCHEMAS.cards.safeParse(c).success).length;
  const accounts = rawAccounts.filter(
    (a) => ENTITY_SCHEMAS.accounts.safeParse(a).success && a.deletedAt === null,
  ) as Account[];
  const transactions = rawTx.filter(
    (t) => ENTITY_SCHEMAS.transactions.safeParse(t).success,
  ) as Transaction[];
  const settings =
    (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS;
  const today = toLocalDate(now);
  const summary = summarizeCards(cards, transactions, {
    today,
    baseCurrency: settings.baseCurrency,
  });
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const pending = new Set(
    outbox
      .filter((o) => o.exportedIn === null && o.entity === "cards")
      .map((o) => o.recordId),
  );

  const rows = cards.map<CardRow>((card) => ({
    card,
    account: card.accountId ? (accountById.get(card.accountId) ?? null) : null,
    committed: summary.committedByCard.get(card.id)!,
    schedule: cardSchedule(card, today),
    references: countReferencesIn({ transactions: rawTx }, "cards", card.id),
    localOnly: pending.has(card.id),
  }));
  const active = rows.filter((r) => r.card.status === "active").sort(byName);
  return {
    credit: active.filter((r) => r.card.cardType === "credit"),
    debit: active.filter((r) => r.card.cardType === "debit"),
    prepaid: active.filter((r) => r.card.cardType === "prepaid"),
    archived: rows.filter((r) => r.card.status === "inactive").sort(byName),
    summary,
    accounts: accounts
      .filter((a) => a.status === "active")
      .sort((a, b) => a.name.localeCompare(b.name, "es-AR")),
    today,
    invalid,
  };
}
