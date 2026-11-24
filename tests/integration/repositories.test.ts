import { asLocalDate } from "@/lib/formatting/date";
import { describe, expect, it } from "vitest";
import { CLEAR_CONFIRMATION, clearLocalData, createRepositories, unitOfWork, type Input } from "@/services/repositories/repositories";
import { checkLocalIntegrity, countPendingOperations, importPublication, openLocalStore } from "@/services/storage/local-store";
import { sampleId as ID, samplePublication } from "../helpers/sample-data";

const ARS_ACCOUNT = ID(1);
const USD_ACCOUNT = ID(15);
const EXPENSE_CAT = ID(3);
const INCOME_CAT = ID(4);
const CARD = ID(6);

const fixedNow = () => new Date("2026-11-24T12:00:00Z");

async function setup() {
  const db = await openLocalStore();
  const { dataSet, files } = await samplePublication(2);
  await importPublication(db, dataSet, files);
  return { db, repos: createRepositories({ db, now: fixedNow }) };
}

const expense = (over: Partial<Input<"transactions">> = {}): Input<"transactions"> => ({
  type: "expense",
  description: "EJEMPLO-FICTICIO Compra",
  amount: 123456,
  currency: "ARS",
  categoryId: EXPENSE_CAT,
  accountId: ARS_ACCOUNT,
  destinationAccountId: null,
  cardId: null,
  date: asLocalDate("2026-11-24"),
  status: "completed",
  notes: null,
  billId: null,
  recurrenceId: null,
  ...over,
});

describe("create", () => {
  it("sets control fields, validates and records an outbox operation", async () => {
    const { db, repos } = await setup();
    const t = await repos.transactions.create(expense());
    expect(t).toMatchObject({ rev: 1, deletedAt: null, createdAt: "2026-11-24T09:00:00-03:00" });
    expect(t.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    const [op] = await db.getAll("outbox");
    expect(op).toMatchObject({ op: "create", entity: "transactions", recordId: t.id, baseRev: null, exportedIn: null });
    expect(await checkLocalIntegrity(db)).toEqual({ ok: true, problems: [] });
    db.close();
  });

  it("rejects decimals, zero, negative amounts and card numbers", async () => {
    const { db, repos } = await setup();
    await expect(repos.transactions.create(expense({ amount: 10.5 }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repos.transactions.create(expense({ amount: 0 }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repos.transactions.create(expense({ amount: -1 }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repos.transactions.create(expense({ notes: "tarjeta 4111 1111 1111 1111" }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await countPendingOperations(db)).toBe(0);
    db.close();
  });

  it("rejects missing references and cross-currency records (D2-02)", async () => {
    const { db, repos } = await setup();
    await expect(repos.transactions.create(expense({ accountId: ID(999) }))).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    await expect(repos.transactions.create(expense({ currency: "USD" }))).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
    await expect(
      repos.transactions.create(expense({ type: "transfer", categoryId: null, destinationAccountId: USD_ACCOUNT })),
    ).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
    db.close();
  });

  it("rejects a category of the wrong type and a card from another account", async () => {
    const { db, repos } = await setup();
    await expect(repos.transactions.create(expense({ categoryId: INCOME_CAT }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repos.transactions.create(expense({ cardId: CARD, accountId: ID(2) }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    db.close();
  });

  it("stores a transfer as ONE record (D2-03)", async () => {
    const { db, repos } = await setup();
    await repos.transactions.create(expense({ type: "transfer", categoryId: null, destinationAccountId: ID(2) }));
    expect(await countPendingOperations(db)).toBe(1);
    db.close();
  });

  it("prevents duplicate ids and possible duplicates", async () => {
    const { db, repos } = await setup();
    const t = await repos.transactions.create(expense());
    await expect(repos.transactions.create({ ...expense({ description: "otra" }), id: t.id })).rejects.toMatchObject({ code: "DUPLICATE_ID" });
    await expect(repos.transactions.create(expense({ description: "  ejemplo-ficticio  COMPRA " }))).rejects.toMatchObject({ code: "POSSIBLE_DUPLICATE", details: [t.id] });
    await repos.transactions.create(expense(), { allowPossibleDuplicate: true });
    expect((await repos.transactions.getAll()).length).toBe(9);
    db.close();
  });

  it("enforces the category tree (same type, max depth 2)", async () => {
    const { db, repos } = await setup();
    const base = { icon: null, color: null, isDefault: false, isActive: true };
    await expect(repos.categories.create({ ...base, name: "Nieta", type: "expense", parentId: ID(16) })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repos.categories.create({ ...base, name: "Hija", type: "income", parentId: EXPENSE_CAT })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await repos.categories.create({ ...base, name: "Hija", type: "expense", parentId: EXPENSE_CAT });
    db.close();
  });
});

describe("update and delete", () => {
  it("increments rev and detects concurrent changes", async () => {
    const { db, repos } = await setup();
    const t = await repos.transactions.create(expense());
    const updated = await repos.transactions.update(t.id, { amount: 200000 }, t.rev);
    expect(updated.rev).toBe(2);
    await expect(repos.transactions.update(t.id, { amount: 300000 }, t.rev)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repos.transactions.update(t.id, { rev: 9 } as never, 2)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    db.close();
  });

  it("deletes as a tombstone that stays in the store", async () => {
    const { db, repos } = await setup();
    // Step 04 (D4-04): only pending or cancelled movements can be deleted.
    const t = await repos.transactions.create(expense({ status: "pending" }));
    const tomb = await repos.transactions.delete(t.id, 1);
    expect(tomb.deletedAt).not.toBeNull();
    expect(await repos.transactions.getById(t.id)).toBeNull();
    expect(await repos.transactions.getById(t.id, { includeDeleted: true })).toMatchObject({ rev: 2 });
    expect((await db.getAll("outbox")).map((o) => o.op)).toEqual(["create", "delete"]);
    db.close();
  });

  it("refuses to delete referenced accounts, cards and categories (D2-06)", async () => {
    const { db, repos } = await setup();
    await expect(repos.accounts.delete(ARS_ACCOUNT, 1)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    await expect(repos.cards.delete(CARD, 1)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    await expect(repos.categories.delete(EXPENSE_CAT, 1)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    const archived = await repos.accounts.update(ARS_ACCOUNT, { status: "archived" }, 1);
    expect(archived.status).toBe("archived");
    db.close();
  });

  it("refuses to change the currency of a referenced account", async () => {
    const { db, repos } = await setup();
    await expect(repos.accounts.update(ARS_ACCOUNT, { currency: "USD" }, 1)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    db.close();
  });
});

describe("unit of work", () => {
  it("commits several writes together", async () => {
    const { db } = await setup();
    await unitOfWork({ db, now: fixedNow }, async (r) => {
      const account = await r.accounts.create({ name: "EJEMPLO-FICTICIO Nueva", institution: null, accountType: "cash", currency: "ARS", initialBalance: 0, openingDate: null, status: "active" });
      await r.transactions.create(expense({ accountId: account.id }));
    });
    expect(await countPendingOperations(db)).toBe(2);
    db.close();
  });

  it("writes nothing when any step fails", async () => {
    const { db } = await setup();
    await expect(
      unitOfWork({ db, now: fixedNow }, async (r) => {
        await r.accounts.create({ name: "EJEMPLO-FICTICIO Nueva", institution: null, accountType: "cash", currency: "ARS", initialBalance: 0, openingDate: null, status: "active" });
        await r.transactions.create(expense({ accountId: ID(999) }));
      }),
    ).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    expect(await db.count("accounts")).toBe(3);
    expect(await countPendingOperations(db)).toBe(0);
    db.close();
  });
});

describe("protected operations", () => {
  it("needs confirmation to clear and refuses to drop unexported changes", async () => {
    const { db, repos } = await setup();
    await repos.transactions.create(expense());
    await expect(clearLocalData(db, { confirmation: "si" })).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await expect(clearLocalData(db, { confirmation: CLEAR_CONFIRMATION })).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await clearLocalData(db, { confirmation: CLEAR_CONFIRMATION, discardPendingChanges: true });
    expect(await db.count("transactions")).toBe(0);
    db.close();
  });
});
