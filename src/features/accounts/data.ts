import type { Money } from "@/domain/money";
import {
  summarizeAccounts,
  type AccountsSummary,
} from "@/domain/rules/accounts";
import { cardTypesOf } from "@/domain/rules/balances";
import {
  accountSchema,
  ENTITY_SCHEMAS,
  type Account,
  type EntityName,
  type Transaction,
  type Card,
} from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { countReferencesIn } from "@/services/repositories/repositories";
import {
  getFinancialSettings,
  type LocalDb,
} from "@/services/storage/local-store";

export interface AccountRow {
  account: Account;
  balance: Money;
  /** Live records using this account (D2-06: > 0 → archive only, currency locked). */
  references: number;
  /** Changed on this device and not exported yet (Ledger, D1). */
  localOnly: boolean;
}

export interface AccountsView {
  active: AccountRow[];
  archived: AccountRow[];
  summary: AccountsSummary;
  /** Stored records that fail the schema: counted, never rendered (no values shown). */
  invalid: number;
}

const byName = (a: AccountRow, b: AccountRow) =>
  a.account.name.localeCompare(b.account.name, "es-AR");

/**
 * Reads everything the Accounts page needs in one read-only IndexedDB transaction, then
 * derives balances and indicators with the domain rules (Step 02). Nothing is cached.
 */
export async function loadAccountsView(db: LocalDb): Promise<AccountsView> {
  const stores = [
    "accounts",
    "transactions",
    "cards",
    "bills",
    "recurrences",
  ] as const;
  const tx = db.transaction([...stores, "outbox"], "readonly");
  const raw = Object.fromEntries(
    await Promise.all(
      stores.map(async (s) => [s, await tx.objectStore(s).getAll()] as const),
    ),
  ) as Record<(typeof stores)[number], unknown[]>;
  const outbox = await tx.objectStore("outbox").getAll();
  await tx.done;

  let invalid = 0;
  const valid = <N extends EntityName>(name: N, rows: unknown[]) =>
    rows.filter((r) => {
      const ok = ENTITY_SCHEMAS[name].safeParse(r).success;
      if (!ok && name === "accounts") invalid++;
      return ok;
    });
  const accounts = (valid("accounts", raw.accounts) as Account[]).filter(
    (a) => a.deletedAt === null,
  );
  const transactions = valid("transactions", raw.transactions) as Transaction[];
  const settings =
    (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS;
  const summary = summarizeAccounts(accounts, transactions, {
    baseCurrency: settings.baseCurrency,
    cardTypes: cardTypesOf(
      raw.cards.filter(
        (c) => ENTITY_SCHEMAS.cards.safeParse(c).success,
      ) as Card[],
    ),
  });
  const pending = new Set(
    outbox
      .filter((o) => o.exportedIn === null && o.entity === "accounts")
      .map((o) => o.recordId),
  );
  const referrers = {
    transactions: raw.transactions,
    cards: raw.cards,
    bills: raw.bills,
    recurrences: raw.recurrences,
  };

  const rows = accounts.map<AccountRow>((account) => ({
    account,
    balance: summary.byAccount.get(account.id)!,
    references: countReferencesIn(referrers, "accounts", account.id),
    localOnly: pending.has(account.id),
  }));
  return {
    active: rows.filter((r) => r.account.status === "active").sort(byName),
    archived: rows.filter((r) => r.account.status === "archived").sort(byName),
    summary,
    invalid,
  };
}

export { accountSchema };
