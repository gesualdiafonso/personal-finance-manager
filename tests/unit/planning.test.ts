import { describe, expect, it } from "vitest";
import {
  BUDGET_THRESHOLDS,
  budgetCategoryScope,
  budgetExpenses,
  budgetHistory,
  budgetState,
  budgetTiming,
  budgetUsage,
  overlappingBudget,
  periodContaining,
  periodEnd,
  previousPeriods,
  summarizeBudgets,
  topCategories,
  usedPercent,
} from "@/domain/rules/budgets";
import { canCompleteGoal, goalDisplayStatus, goalProgress, summarizeGoals } from "@/domain/rules/goals";
import { budgetSchema, goalContributionSchema, goalSchema, type Budget, type Category, type Goal, type GoalContribution, type Transaction } from "@/domain/schemas";
import { budgetRange, parseBudgetForm, parseContributionForm, parseGoalForm } from "@/features/planning/forms";

/** Budgets and goals rules (Step 06). Fictitious data only (EJEMPLO-FICTICIO). */
type Loose<T> = { [K in keyof T]?: unknown };
const id = (n: number) => `0193c8a0-${n.toString(16).padStart(4, "0")}-7000-8000-${n.toString(16).padStart(12, "0")}`;
const control = (n: number) => ({ id: id(n), rev: 1, createdAt: "2026-11-01T10:00:00-03:00", updatedAt: "2026-11-01T10:00:00-03:00", deletedAt: null, deviceId: "test" });

const FOOD = id(10);
const MARKET = id(11); // child of FOOD
const FUN = id(12);
const categories = [
  { ...control(10), name: "Alimentación", type: "expense", parentId: null, color: null, icon: null, isActive: true, isDefault: false },
  { ...control(11), name: "Supermercado", type: "expense", parentId: FOOD, color: null, icon: null, isActive: true, isDefault: false },
  { ...control(12), name: "Salidas", type: "expense", parentId: null, color: null, icon: null, isActive: true, isDefault: false },
] as unknown as Category[];

const budget = (over: Loose<Budget> = {}): Budget =>
  ({ ...control(1), name: "EJEMPLO-FICTICIO Comida", categoryId: FOOD, amount: 100_000, currency: "ARS", period: "monthly", startDate: "2026-11-01", endDate: "2026-11-30", ...over }) as Budget;
let seq = 100;
const tx = (over: Loose<Transaction> = {}): Transaction =>
  ({
    ...control(seq++),
    type: "expense",
    description: "EJEMPLO-FICTICIO",
    amount: 10_000,
    currency: "ARS",
    categoryId: FOOD,
    accountId: id(50),
    destinationAccountId: null,
    cardId: null,
    date: "2026-11-10",
    status: "completed",
    notes: null,
    billId: null,
    recurrenceId: null,
    ...over,
  }) as Transaction;
const goal = (over: Loose<Goal> = {}): Goal =>
  ({
    ...control(2),
    name: "EJEMPLO-FICTICIO Computadora",
    description: null,
    kind: "purchase",
    amount: 1_000_000,
    initialAmount: 200_000,
    currency: "ARS",
    startDate: "2026-11-01",
    targetDate: "2027-02-28",
    status: "active",
    completedAt: null,
    archivedAt: null,
    ...over,
  }) as Goal;
const contribution = (over: Loose<GoalContribution> = {}): GoalContribution =>
  ({
    ...control(seq++),
    goalId: id(2),
    amount: 100_000,
    currency: "ARS",
    date: "2026-11-15",
    description: null,
    accountId: null,
    transactionId: null,
    cancelledAt: null,
    ...over,
  }) as GoalContribution;

describe("budget schema 2.3.0 (additive)", () => {
  it("still reads a 2.2 category budget and accepts general, weekly and quarterly budgets", () => {
    expect(budgetSchema.safeParse(budget()).success).toBe(true);
    expect(budgetSchema.safeParse(budget({ categoryId: null, description: "Todo", status: "active" })).success).toBe(true);
    expect(budgetSchema.safeParse(budget({ period: "weekly", startDate: "2026-11-23", endDate: "2026-11-29" })).success).toBe(true);
    expect(budgetSchema.safeParse(budget({ period: "weekly", startDate: "2026-11-23", endDate: "2026-11-30" })).success).toBe(false);
    expect(budgetSchema.safeParse(budget({ period: "quarterly", startDate: "2026-10-01", endDate: "2026-12-31" })).success).toBe(true);
    expect(budgetSchema.safeParse(budget({ period: "quarterly", startDate: "2026-11-01", endDate: "2027-01-31" })).success).toBe(false);
    expect(budgetSchema.safeParse(budget({ amount: 10.5 })).success).toBe(false); // integer cents only
  });

  it("goal and contribution schemas keep their invariants", () => {
    expect(goalSchema.safeParse(goal()).success).toBe(true);
    expect(goalSchema.safeParse(goal({ amount: 0 })).success).toBe(false);
    expect(goalSchema.safeParse(goal({ status: "completed" })).success).toBe(false); // completedAt required
    expect(goalSchema.safeParse(goal({ archivedAt: "2026-11-24T10:00:00-03:00" })).success).toBe(false); // active cannot be archived
    expect(goalSchema.safeParse(goal({ targetDate: "2026-10-01" })).success).toBe(false);
    expect(goalContributionSchema.safeParse(contribution()).success).toBe(true);
    expect(goalContributionSchema.safeParse(contribution({ amount: -1 })).success).toBe(false);
  });
});

describe("budget spending", () => {
  it("counts completed expenses of the category and its subcategories, in currency and dates, once", () => {
    const a = tx({ amount: 30_000 });
    const txs = [
      a,
      a, // the same record twice never counts twice
      tx({ amount: 20_000, categoryId: MARKET }),
      tx({ amount: 5_000, status: "pending" }),
      tx({ amount: 99_000, status: "cancelled" }),
      tx({ amount: 99_000, deletedAt: "2026-11-11T10:00:00-03:00" }),
      tx({ amount: 99_000, type: "transfer", categoryId: null, destinationAccountId: id(51) }),
      tx({ amount: 99_000, type: "income" }),
      tx({ amount: 99_000, currency: "USD" }),
      tx({ amount: 99_000, date: "2026-12-01" }),
      tx({ amount: 99_000, categoryId: FUN }),
    ];
    const usage = budgetUsage(budget(), txs, categories);
    expect(usage).toMatchObject({ limit: 100_000, spent: 50_000, pending: 5_000, remaining: 50_000, over: 0, percent: 50, state: "within", movements: 3 });
    expect(budgetExpenses(budget({ categoryId: null }), txs, categories).map((t) => t.amount).sort()).toEqual([20_000, 30_000, 5_000, 99_000].sort());
    expect(budgetCategoryScope(FOOD, categories)).toEqual(new Set([FOOD, MARKET]));
  });

  it("states follow the documented thresholds with integer math", () => {
    expect(BUDGET_THRESHOLDS).toEqual({ attention: 85, near: 95 });
    expect(budgetState(84_999, 100_000)).toBe("within");
    expect(budgetState(85_000, 100_000)).toBe("attention");
    expect(budgetState(95_000, 100_000)).toBe("near");
    expect(budgetState(100_000, 100_000)).toBe("near");
    expect(budgetState(100_001, 100_000)).toBe("exceeded");
    expect(budgetState(0, 0)).toBe("within");
    expect(budgetState(1, 0)).toBe("exceeded");
    expect(usedPercent(129_999, 100_000)).toBe(129);
    expect(usedPercent(5, 0)).toBeNull();
  });

  it("an exceeded budget reports how much over and a negative remaining", () => {
    const usage = budgetUsage(budget(), [tx({ amount: 130_000 })], categories);
    expect(usage).toMatchObject({ remaining: -30_000, over: 30_000, state: "exceeded", percent: 130 });
  });

  it("timing and periods in calendar dates", () => {
    expect(budgetTiming(budget(), "2026-10-31")).toBe("upcoming");
    expect(budgetTiming(budget(), "2026-11-30")).toBe("current");
    expect(budgetTiming(budget(), "2026-12-01")).toBe("past");
    expect(periodContaining("weekly", "2026-11-24", "monday")).toEqual({ startDate: "2026-11-23", endDate: "2026-11-29" });
    expect(periodContaining("weekly", "2026-11-24", "sunday")).toEqual({ startDate: "2026-11-22", endDate: "2026-11-28" });
    expect(periodContaining("quarterly", "2026-11-24")).toEqual({ startDate: "2026-10-01", endDate: "2026-12-31" });
    expect(periodContaining("monthly", "2028-02-10")).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
    expect(periodEnd("custom", "2026-11-01")).toBeNull();
    expect(previousPeriods(budget(), 2)).toEqual([
      { from: "2026-09-01", to: "2026-09-30" },
      { from: "2026-10-01", to: "2026-10-31" },
    ]);
    expect(previousPeriods(budget({ period: "monthly", startDate: "2026-01-01", endDate: "2026-01-31" }), 1)).toEqual([{ from: "2025-12-01", to: "2025-12-31" }]);
    expect(previousPeriods(budget({ period: "custom", startDate: "2026-11-11", endDate: "2026-11-20" }), 1)).toEqual([{ from: "2026-11-01", to: "2026-11-10" }]);
  });

  it("history compares previous periods against the same limit", () => {
    const h = budgetHistory(budget(), [tx({ date: "2026-10-05", amount: 120_000 }), tx({ amount: 10_000 })], categories, 2);
    expect(h.map((p) => [p.from, p.spent, p.state, p.current])).toEqual([
      ["2026-09-01", 0, "within", false],
      ["2026-10-01", 120_000, "exceeded", false],
      ["2026-11-01", 10_000, "within", true],
    ]);
  });

  it("module summary never mixes currencies nor counts a parent and child budget twice", () => {
    const budgets = [
      budget(),
      budget({ ...control(3), categoryId: MARKET, amount: 40_000 }),
      budget({ ...control(4), categoryId: null, amount: 500_000 }), // general budget, not added to category totals
      budget({ ...control(5), currency: "USD", categoryId: null, amount: 10_000 }),
      budget({ ...control(6), status: "archived" }),
      budget({ ...control(7), startDate: "2026-12-01", endDate: "2026-12-31" }),
    ];
    const txs = [tx({ amount: 30_000, categoryId: MARKET }), tx({ amount: 20_000, currency: "USD", categoryId: null })];
    const s = summarizeBudgets(budgets, txs, categories, { today: "2026-11-24", baseCurrency: "ARS" });
    expect(s.byCurrency).toEqual([
      { currency: "ARS", scope: "categories", budgeted: 140_000, spent: 30_000 },
      { currency: "USD", scope: "general", budgeted: 10_000, spent: 20_000 },
    ]);
    expect(s).toMatchObject({ active: 4, exceeded: 1, attention: 0 });
  });

  it("top categories roll up to the parent and show its budget", () => {
    const rows = topCategories([tx({ amount: 30_000, categoryId: MARKET }), tx({ amount: 5_000 }), tx({ amount: 50_000, categoryId: FUN }), tx({ amount: 1, categoryId: null })], categories, {
      currency: "ARS",
      from: "2026-11-01",
      to: "2026-11-30",
      budgets: [budget()],
    });
    expect(rows).toEqual([
      { categoryId: FUN, spent: 50_000, budgeted: null },
      { categoryId: FOOD, spent: 35_000, budgeted: 100_000 },
      { categoryId: null, spent: 1, budgeted: null },
    ]);
  });

  it("detects an overlapping active budget of the same scope, currency and period", () => {
    const existing = budget();
    expect(overlappingBudget(budget({ ...control(9) }), [existing])?.id).toBe(existing.id);
    expect(overlappingBudget(budget({ ...control(9), currency: "USD" }), [existing])).toBeNull();
    expect(overlappingBudget(budget({ ...control(9), categoryId: MARKET }), [existing])).toBeNull();
    expect(overlappingBudget(budget({ ...control(9), startDate: "2026-12-01", endDate: "2026-12-31" }), [existing])).toBeNull();
    expect(overlappingBudget(budget({ ...control(9) }), [budget({ status: "archived" })])).toBeNull();
  });
});

describe("budget form", () => {
  it("snaps the dates to the chosen period and validates in Spanish", () => {
    expect(budgetRange("monthly", "2026-11-24", "", "monday")).toEqual({ startDate: "2026-11-01", endDate: "2026-11-30" });
    const ok = parseBudgetForm({ name: "EJEMPLO-FICTICIO", categoryId: "", amount: "50.000,50", currency: "ARS", period: "yearly", startDate: "2026-06-15", endDate: "", description: "" }, "monday");
    expect(ok).toMatchObject({ ok: true, fields: { amount: 5_000_050, categoryId: null, startDate: "2026-01-01", endDate: "2026-12-31", description: null } });
    const bad = parseBudgetForm({ name: "", categoryId: "", amount: "0", currency: "ARS", period: "custom", startDate: "2026-11-10", endDate: "2026-11-01", description: "" }, "monday");
    expect(bad).toEqual({ ok: false, errors: { name: "Escribe un nombre.", amount: "El límite tiene que ser mayor que 0." } });
    const badDates = parseBudgetForm({ name: "x", categoryId: "", amount: "1", currency: "ARS", period: "custom", startDate: "2026-11-10", endDate: "2026-11-01", description: "" }, "monday");
    expect(badDates).toEqual({ ok: false, errors: { endDate: "La fecha final no puede ser anterior a la inicial." } });
  });
});

describe("goals", () => {
  it("progress: initial + live contributions, rounded down, remaining never negative", () => {
    const cs = [contribution(), contribution({ amount: 50_000 }), contribution({ cancelledAt: "2026-11-20T10:00:00-03:00" }), contribution({ goalId: id(3) })];
    const p = goalProgress(goal(), cs, "2026-11-24");
    expect(p).toMatchObject({ target: 1_000_000, saved: 350_000, contributed: 150_000, remaining: 650_000, percent: 35, reached: false, overdue: false });
    expect(goalProgress(goal(), [contribution({ amount: 900_000 })], "2026-11-24")).toMatchObject({ remaining: 0, percent: 110, reached: true, perMonth: null });
  });

  it("required pace rounds up so the goal is reached on time", () => {
    // 2026-11-24 → 2027-02-28 = 96 days left + today = 97 days: 4 blocks of 30 days, 14 of 7.
    const p = goalProgress(goal(), [], "2026-11-24");
    expect(p.daysLeft).toBe(96);
    expect(p.perMonth).toBe(200_000); // 800.000 / 4
    expect(p.perWeek).toBe(Math.ceil(800_000 / 14));
    expect(goalProgress(goal({ targetDate: null }), [], "2026-11-24").perMonth).toBeNull();
  });

  it("a passed date is only shown; the goal stays active and is never completed automatically", () => {
    const late = goal({ targetDate: "2026-11-01", startDate: "2026-10-01" });
    const p = goalProgress(late, [], "2026-11-24");
    expect(p.overdue).toBe(true);
    expect(goalDisplayStatus(late, p)).toBe("overdue");
    expect(late.status).toBe("active");
    const reached = goalProgress(goal(), [contribution({ amount: 800_000 })], "2026-11-24");
    expect(goalDisplayStatus(goal(), reached)).toBe("reached");
    expect(canCompleteGoal(goal(), reached)).toBe(true);
    expect(canCompleteGoal(goal(), goalProgress(goal(), [], "2026-11-24"))).toBe(false);
  });

  it("summary per currency of active goals; completed counted apart", () => {
    const goals = [
      goal(),
      goal({ ...control(3), currency: "USD", amount: 100_000, initialAmount: 10_000, targetDate: "2026-12-31" }),
      goal({ ...control(4), status: "completed", completedAt: "2026-11-20T10:00:00-03:00" }),
      goal({ ...control(5), status: "cancelled", archivedAt: "2026-11-20T10:00:00-03:00" }),
    ];
    const s = summarizeGoals(goals, [contribution()], { today: "2026-11-24", baseCurrency: "ARS" });
    expect(s).toMatchObject({ active: 2, completed: 1, reached: 0 });
    expect(s.byCurrency).toEqual([
      { currency: "ARS", saved: 300_000, target: 1_000_000 },
      { currency: "USD", saved: 10_000, target: 100_000 },
    ]);
    expect(s.upcoming.map((g) => g.id)).toEqual([id(3), id(2)]);
  });

  it("goal and contribution forms", () => {
    expect(parseGoalForm({ name: "EJEMPLO-FICTICIO", description: "", kind: "travel", amount: "100.000", initialAmount: "", currency: "USD", startDate: "2026-11-24", targetDate: "" })).toMatchObject({
      ok: true,
      fields: { amount: 10_000_000, initialAmount: 0, currency: "USD", targetDate: null },
    });
    expect(parseGoalForm({ name: "x", description: "", kind: "travel", amount: "", initialAmount: "-5", currency: "ARS", startDate: "2026-11-24", targetDate: "2026-01-01" })).toEqual({
      ok: false,
      errors: { amount: "Escribe el objetivo.", initialAmount: "Escribe un importe válido (0 o más)." },
    });
    expect(parseContributionForm({ amount: "1.500", date: "2026-11-24", description: "", accountId: "", transactionId: "" }, { id: id(2), currency: "ARS" })).toMatchObject({
      ok: true,
      input: { goalId: id(2), amount: 150_000, currency: "ARS", accountId: null, transactionId: null, cancelledAt: null },
    });
  });
});
