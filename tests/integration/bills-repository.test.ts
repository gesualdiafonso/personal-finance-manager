import { describe, expect, it } from "vitest";
import { asLocalDate as D } from "@/lib/formatting/date";
import { createRepositories, type Input } from "@/services/repositories/repositories";
import { checkLocalIntegrity, importPublication, openLocalStore } from "@/services/storage/local-store";
import { sampleId as ID, samplePublication } from "../helpers/sample-data";

/** Bill policy in the repository (Step 05, D5-03/D5-04/D5-07/D5-15). Fictitious data only. */
const ARS_ACCOUNT = ID(1);
const USD_ACCOUNT = ID(15);
const EXPENSE_CAT = ID(5);
const INCOME_CAT = ID(4);
const fixedNow = () => new Date("2026-11-24T12:00:00Z");

async function setup() {
  const db = await openLocalStore();
  const { dataSet, files } = await samplePublication(2);
  await importPublication(db, dataSet, files);
  return { db, repos: createRepositories({ db, now: fixedNow }) };
}

const input = (over: Partial<Input<"bills">> = {}): Input<"bills"> => ({
  name: "EJEMPLO-FICTICIO Gas",
  description: null,
  categoryId: EXPENSE_CAT,
  amount: 1_500_000,
  currency: "ARS",
  dueDate: D("2026-12-10"),
  accountId: ARS_ACCOUNT,
  status: "pending",
  notes: null,
  recurrenceId: null,
  occurrenceDate: null,
  ...over,
});

describe("bills in the repository", () => {
  it("creates a pending bill with an outbox operation; integrity stays correct", async () => {
    const { db, repos } = await setup();
    const b = await repos.bills.create(input());
    expect(b).toMatchObject({ status: "pending", rev: 1 });
    expect((await db.getAll("outbox")).at(-1)).toMatchObject({ op: "create", entity: "bills", recordId: b.id });
    expect(await checkLocalIntegrity(db)).toEqual({ ok: true, problems: [] });
    db.close();
  });

  it("never creates a bill already paid or cancelled", async () => {
    const { db, repos } = await setup();
    await expect(repos.bills.create(input({ status: "paid" }))).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await expect(repos.bills.create(input({ status: "cancelled" }))).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    db.close();
  });

  it("uses an expense category, an account of the same currency and an active account", async () => {
    const { db, repos } = await setup();
    await expect(repos.bills.create(input({ categoryId: INCOME_CAT }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repos.bills.create(input({ accountId: USD_ACCOUNT }))).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
    await expect(repos.bills.create(input({ amount: 0 }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repos.bills.create(input({ amount: 10.5 }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const account = await repos.accounts.getById(ARS_ACCOUNT);
    await repos.accounts.update(ARS_ACCOUNT, { status: "archived" }, account!.rev);
    await expect(repos.bills.create(input())).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    expect(await repos.bills.create(input({ accountId: null }))).toMatchObject({ accountId: null });
    db.close();
  });

  it("an existing bill keeps its archived account, but cannot move to one", async () => {
    const { db, repos } = await setup();
    const b = await repos.bills.create(input({ accountId: ID(2) }));
    const a1 = await repos.accounts.getById(ARS_ACCOUNT);
    await repos.accounts.update(ARS_ACCOUNT, { status: "archived" }, a1!.rev);
    const a2 = await repos.accounts.getById(ID(2));
    await repos.accounts.update(ID(2), { status: "archived" }, a2!.rev);
    const edited = await repos.bills.update(b.id, { amount: 1_600_000 }, b.rev);
    expect(edited.amount).toBe(1_600_000);
    await expect(repos.bills.update(b.id, { accountId: ARS_ACCOUNT }, edited.rev)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    db.close();
  });

  it("is never marked as paid by hand", async () => {
    const { db, repos } = await setup();
    const b = await repos.bills.create(input());
    await expect(repos.bills.update(b.id, { status: "paid" }, b.rev)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    db.close();
  });

  it("cancelling is final: only the notes change afterwards", async () => {
    const { db, repos } = await setup();
    const b = await repos.bills.create(input());
    const cancelled = await repos.bills.update(b.id, { status: "cancelled" }, b.rev);
    await expect(repos.bills.update(b.id, { status: "pending" }, cancelled.rev)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await expect(repos.bills.update(b.id, { amount: 1 }, cancelled.rev)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    expect(await repos.bills.update(b.id, { notes: "EJEMPLO-FICTICIO duplicada" }, cancelled.rev)).toMatchObject({ status: "cancelled", notes: "EJEMPLO-FICTICIO duplicada" });
    db.close();
  });

  it("deletes only a bill without payments (D5-07); stale revisions conflict", async () => {
    const { db, repos } = await setup();
    const free = await repos.bills.create(input());
    await expect(repos.bills.delete(free.id, free.rev + 1)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await repos.bills.delete(free.id, free.rev)).deletedAt).not.toBeNull();

    const paidOnce = await repos.bills.create(input({ name: "EJEMPLO-FICTICIO Agua" }));
    const payment = await repos.transactions.create({
      type: "expense",
      description: "EJEMPLO-FICTICIO Pago agua",
      amount: 100_000,
      currency: "ARS",
      categoryId: EXPENSE_CAT,
      accountId: ARS_ACCOUNT,
      destinationAccountId: null,
      cardId: null,
      date: D("2026-11-24"),
      status: "pending",
      notes: null,
      billId: paidOnce.id,
      recurrenceId: null,
    });
    await expect(repos.bills.delete(paidOnce.id, paidOnce.rev)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    // Even after the payment is cancelled the bill keeps its history: cancel it instead.
    await repos.transactions.update(payment.id, { status: "cancelled" }, payment.rev);
    await expect(repos.bills.delete(paidOnce.id, paidOnce.rev)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    expect(await repos.bills.update(paidOnce.id, { status: "cancelled" }, paidOnce.rev)).toMatchObject({ status: "cancelled" });
    db.close();
  });

  it("a recurrence referenced by a bill cannot be deleted", async () => {
    const { db, repos } = await setup();
    const rec = (await repos.recurrences.getAll())[0]!;
    await repos.bills.create(input({ recurrenceId: rec.id, occurrenceDate: D("2026-12-01") }));
    await expect(repos.recurrences.delete(rec.id, rec.rev)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    await expect(repos.bills.create(input({ recurrenceId: ID(999), occurrenceDate: D("2026-12-01") }))).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    db.close();
  });
});
