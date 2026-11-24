import { describe, expect, it } from "vitest";
import { budgetUsage } from "@/domain/rules/budgets";
import { goalProgress } from "@/domain/rules/goals";
import { asLocalDate as D } from "@/lib/formatting/date";
import { computeChecksums, dataSetToFiles, validateDataFiles } from "@/services/data/dataset";
import { createRepositories, type Input } from "@/services/repositories/repositories";
import { checkLocalIntegrity, importPublication, openLocalStore, readWorkingDataSet } from "@/services/storage/local-store";
import { sampleId as ID, samplePublication } from "../helpers/sample-data";

/** Budgets, goals and contributions through the repositories and IndexedDB (Step 06). Fictitious data only. */
const ARS_ACCOUNT = ID(1);
const USD_ACCOUNT = ID(15);
const EXPENSE_CAT = ID(5);
const INCOME_CAT = ID(4);
const now = () => new Date("2026-11-24T12:00:00Z");

async function setup() {
  const db = await openLocalStore();
  const { dataSet, files } = await samplePublication(2);
  await importPublication(db, dataSet, files);
  return { db, repos: createRepositories({ db, now }) };
}

const budgetInput = (over: Partial<Input<"budgets">> = {}): Input<"budgets"> => ({
  name: "EJEMPLO-FICTICIO Diciembre",
  categoryId: EXPENSE_CAT,
  amount: 5_000_000,
  currency: "ARS",
  period: "monthly",
  startDate: D("2026-12-01"),
  endDate: D("2026-12-31"),
  description: null,
  status: "active",
  ...over,
});
const goalInput = (over: Partial<Input<"goals">> = {}): Input<"goals"> => ({
  name: "EJEMPLO-FICTICIO Fondo",
  description: null,
  kind: "emergency",
  amount: 1_000_000,
  initialAmount: 0,
  currency: "ARS",
  startDate: D("2026-11-01"),
  targetDate: D("2027-06-30"),
  status: "active",
  completedAt: null,
  archivedAt: null,
  ...over,
});
const contributionInput = (goalId: string, over: Partial<Input<"goalContributions">> = {}): Input<"goalContributions"> => ({
  goalId,
  amount: 400_000,
  currency: "ARS",
  date: D("2026-11-20"),
  description: null,
  accountId: null,
  transactionId: null,
  cancelledAt: null,
  ...over,
});
const expense = (over: Partial<Input<"transactions">> = {}): Input<"transactions"> => ({
  type: "expense",
  description: "EJEMPLO-FICTICIO Gasto diciembre",
  amount: 2_000_000,
  currency: "ARS",
  categoryId: EXPENSE_CAT,
  accountId: ARS_ACCOUNT,
  destinationAccountId: null,
  cardId: null,
  date: D("2026-12-05"),
  status: "completed",
  notes: null,
  billId: null,
  recurrenceId: null,
  ...over,
});

describe("budgets in the repository", () => {
  it("persists with an outbox operation, follows the transactions and keeps integrity", async () => {
    const { db, repos } = await setup();
    const b = await repos.budgets.create(budgetInput());
    expect((await db.getAll("outbox")).at(-1)).toMatchObject({ op: "create", entity: "budgets", recordId: b.id });
    const t = await repos.transactions.create(expense());
    const read = async () => {
      const ds = await readWorkingDataSet(db);
      return budgetUsage(b, Object.values(ds.transactions).flat(), ds.categories);
    };
    expect(await read()).toMatchObject({ spent: 2_000_000, remaining: 3_000_000 });
    // Indicators follow every change in the transactions (nothing is stored).
    await repos.transactions.update(t.id, { status: "cancelled" }, t.rev);
    expect(await read()).toMatchObject({ spent: 0, remaining: 5_000_000 });
    expect(await checkLocalIntegrity(db)).toEqual({ ok: true, problems: [] });
    db.close();
  });

  it("general budgets, positive limit, expense category, no overlapping twin", async () => {
    const { db, repos } = await setup();
    expect(await repos.budgets.create(budgetInput({ categoryId: null }))).toMatchObject({ categoryId: null });
    await expect(repos.budgets.create(budgetInput({ amount: 0 }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repos.budgets.create(budgetInput({ categoryId: INCOME_CAT }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repos.budgets.create(budgetInput({ status: "archived" }))).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    const first = await repos.budgets.create(budgetInput());
    await expect(repos.budgets.create(budgetInput())).rejects.toMatchObject({ code: "POSSIBLE_DUPLICATE" });
    expect(await repos.budgets.create(budgetInput({ currency: "USD" }))).toBeTruthy(); // another currency is another budget
    // Archived budgets do not block; reactivating a twin does.
    const archived = await repos.budgets.update(first.id, { status: "archived" }, first.rev);
    const second = await repos.budgets.create(budgetInput());
    await expect(repos.budgets.update(first.id, { status: "active" }, archived.rev)).rejects.toMatchObject({ code: "POSSIBLE_DUPLICATE" });
    expect((await repos.budgets.delete(second.id, second.rev)).deletedAt).not.toBeNull();
    db.close();
  });

  it("a category used by a budget cannot be deleted", async () => {
    const { db, repos } = await setup();
    await repos.budgets.create(budgetInput());
    const cat = await repos.categories.getById(EXPENSE_CAT);
    await expect(repos.categories.delete(EXPENSE_CAT, cat!.rev)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    db.close();
  });
});

describe("goals and contributions in the repository", () => {
  it("creates an active goal; contributions add up; completion only once reached, by the user", async () => {
    const { db, repos } = await setup();
    await expect(repos.goals.create(goalInput({ status: "completed", completedAt: "2026-11-24T10:00:00-03:00" }))).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    let goal = await repos.goals.create(goalInput({ initialAmount: 200_000 }));
    await repos.goalContributions.create(contributionInput(goal.id));
    const progress = async () => goalProgress(goal, await repos.goalContributions.getAll(), "2026-11-24");
    expect(await progress()).toMatchObject({ saved: 600_000, percent: 60, reached: false });
    await expect(repos.goals.update(goal.id, { status: "completed", completedAt: "2026-11-24T10:00:00-03:00" }, goal.rev)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await repos.goalContributions.create(contributionInput(goal.id, { amount: 400_000, date: D("2026-11-21") }));
    expect(await progress()).toMatchObject({ saved: 1_000_000, reached: true });
    expect(goal.status).toBe("active"); // never automatic
    goal = await repos.goals.update(goal.id, { status: "completed", completedAt: "2026-11-24T10:00:00-03:00" }, goal.rev);
    // Closed: no more contributions, only description and archive change.
    await expect(repos.goalContributions.create(contributionInput(goal.id, { date: D("2026-11-22") }))).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await expect(repos.goals.update(goal.id, { amount: 2 }, goal.rev)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    goal = await repos.goals.update(goal.id, { archivedAt: "2026-11-24T10:00:00-03:00", description: "EJEMPLO-FICTICIO listo" }, goal.rev);
    expect(goal).toMatchObject({ status: "completed", description: "EJEMPLO-FICTICIO listo" });
    await expect(repos.goals.delete(goal.id, goal.rev)).rejects.toMatchObject({ code: "REFERENCE_CONSTRAINT" });
    expect(await checkLocalIntegrity(db)).toEqual({ ok: true, problems: [] });
    db.close();
  });

  it("contributions never touch balances, are not counted twice and are cancelled, not deleted", async () => {
    const { db, repos } = await setup();
    const goal = await repos.goals.create(goalInput());
    const before = await repos.transactions.getAll();
    const c = await repos.goalContributions.create(contributionInput(goal.id, { accountId: ARS_ACCOUNT }));
    expect(await repos.transactions.getAll()).toEqual(before); // no fictitious income or expense
    await expect(repos.goalContributions.create(contributionInput(goal.id, { accountId: ARS_ACCOUNT }))).rejects.toMatchObject({ code: "POSSIBLE_DUPLICATE" });
    await expect(repos.goalContributions.create(contributionInput(goal.id), { allowPossibleDuplicate: true })).resolves.toBeTruthy();
    await expect(repos.goalContributions.update(c.id, { amount: 1 }, c.rev)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await expect(repos.goalContributions.delete(c.id, c.rev)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    const cancelled = await repos.goalContributions.update(c.id, { cancelledAt: "2026-11-24T10:00:00-03:00" }, c.rev);
    await expect(repos.goalContributions.update(c.id, { cancelledAt: null }, cancelled.rev)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    expect(goalProgress(goal, await repos.goalContributions.getAll(), "2026-11-24").saved).toBe(400_000);
    await expect(repos.goalContributions.create(contributionInput(goal.id, { currency: "USD" }))).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
    await expect(repos.goalContributions.create(contributionInput(goal.id, { accountId: USD_ACCOUNT, date: D("2026-11-02") }))).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
    db.close();
  });

  it("a linked transaction backs one contribution only, never an income; it cannot be cancelled while linked", async () => {
    const { db, repos } = await setup();
    const goal = await repos.goals.create(goalInput());
    const transfer = await repos.transactions.create(
      expense({ type: "transfer", categoryId: null, destinationAccountId: ID(2), description: "EJEMPLO-FICTICIO A ahorro", date: D("2026-11-20") }),
    );
    const income = await repos.transactions.create(expense({ type: "income", categoryId: INCOME_CAT, description: "EJEMPLO-FICTICIO Cobro", date: D("2026-11-20") }));
    await expect(repos.goalContributions.create(contributionInput(goal.id, { transactionId: income.id }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const linked = await repos.goalContributions.create(contributionInput(goal.id, { transactionId: transfer.id }));
    await expect(repos.goalContributions.create(contributionInput(goal.id, { transactionId: transfer.id, date: D("2026-11-21") }))).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await expect(repos.transactions.update(transfer.id, { status: "cancelled" }, transfer.rev)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await repos.goalContributions.update(linked.id, { cancelledAt: "2026-11-24T10:00:00-03:00" }, linked.rev);
    expect(await repos.transactions.update(transfer.id, { status: "cancelled" }, transfer.rev)).toMatchObject({ status: "cancelled" });
    expect(await checkLocalIntegrity(db)).toEqual({ ok: true, problems: [] });
    db.close();
  });

  it("goals travel in the data set: optional files, checksums, validation and references", async () => {
    const { db, repos } = await setup();
    const goal = await repos.goals.create(goalInput());
    await repos.goalContributions.create(contributionInput(goal.id));
    const ds = await readWorkingDataSet(db);
    ds.meta = { ...ds.meta, checksums: computeChecksums(ds) };
    const files = dataSetToFiles(ds, "2.3.0");
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["goals.json", "goal-contributions.json"]));
    expect(ds.meta.checksums["goals.json"]).toEqual({ count: 1, amountSum: 1_000_000 });
    const valid = validateDataFiles(files);
    expect(valid.dataSet?.goalContributions).toHaveLength(1);
    // Without the optional files a data folder is still valid (2.2 publications).
    const withoutGoals = { ...ds, goals: [], goalContributions: [] };
    withoutGoals.meta = { ...ds.meta, checksums: computeChecksums(withoutGoals) };
    expect(validateDataFiles(dataSetToFiles(withoutGoals, "2.3.0")).dataSet).not.toBeNull();
    // A contribution pointing at a missing goal is rejected.
    const broken = { ...ds, goals: [] };
    broken.meta = { ...ds.meta, checksums: computeChecksums(broken) };
    expect(validateDataFiles(dataSetToFiles(broken, "2.3.0")).issues.some((i) => i.file === "goal-contributions.json" && i.message.includes("goalId"))).toBe(true);
    db.close();
  });
});
