import { describe, expect, it } from "vitest";
import {
  balancesAt,
  dashboardPeriod,
  flowSeries,
  pendingExpenses,
  periodElapsedPercent,
  periodFlow,
  periodTiming,
  recentTransactions,
  shiftPeriod,
  upcomingObligations,
} from "@/domain/rules/dashboard";
import type { Account, Bill, Recurrence, Transaction } from "@/domain/schemas";

/** Panel selectors (Step 07). Fictitious data only (EJEMPLO-FICTICIO). */
type Loose<T> = { [K in keyof T]?: unknown };
const id = (n: number) => `0193c8a0-${n.toString(16).padStart(4, "0")}-7000-8000-${n.toString(16).padStart(12, "0")}`;
const control = (n: number, created = "2026-11-01T10:00:00-03:00") => ({ id: id(n), rev: 1, createdAt: created, updatedAt: created, deletedAt: null, deviceId: "test" });
const ARS = id(1);
const SAVE = id(2);
const USD = id(3);
const CARD = id(4);

const account = (n: number, currency: "ARS" | "USD", initialBalance: number): Account =>
  ({ ...control(n), name: `EJEMPLO-FICTICIO ${n}`, institution: null, accountType: "checking", currency, initialBalance, openingDate: null, status: "active" }) as Account;
const accounts = [account(1, "ARS", 100_000), account(2, "ARS", 0), account(3, "USD", 5_000)];

let seq = 100;
const tx = (over: Loose<Transaction> = {}): Transaction =>
  ({
    ...control(seq++, `2026-11-0${(seq % 9) + 1}T10:00:00-03:00`),
    type: "expense",
    description: "EJEMPLO-FICTICIO",
    amount: 10_000,
    currency: "ARS",
    categoryId: null,
    accountId: ARS,
    destinationAccountId: null,
    cardId: null,
    date: "2026-11-10",
    status: "completed",
    notes: null,
    billId: null,
    recurrenceId: null,
    ...over,
  }) as Transaction;

const sample = () => [
  tx({ type: "income", amount: 50_000, date: "2026-11-05" }),
  tx({ amount: 20_000, date: "2026-11-10" }),
  tx({ type: "transfer", amount: 30_000, destinationAccountId: SAVE, date: "2026-11-11" }),
  tx({ amount: 5_000, status: "pending", date: "2026-11-12" }),
  tx({ type: "income", amount: 7_000, status: "pending", date: "2026-11-12" }),
  tx({ amount: 99_000, status: "cancelled", date: "2026-11-13" }),
  tx({ amount: 99_000, deletedAt: "2026-11-14T10:00:00-03:00", date: "2026-11-14" }),
  tx({ amount: 1_500, currency: "USD", accountId: USD, date: "2026-11-15" }),
  tx({ amount: 8_000, cardId: CARD, date: "2026-11-16" }), // credit purchase: an expense, not an account movement
  tx({ amount: 1, date: "2026-10-31" }),
];

describe("periods", () => {
  it("week, month, quarter and year in calendar dates; shifting across year ends", () => {
    expect(dashboardPeriod("week", "2026-11-24", "monday")).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(dashboardPeriod("month", "2026-11-24")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(dashboardPeriod("quarter", "2026-11-24")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(dashboardPeriod("year", "2026-11-24")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(shiftPeriod("month", { from: "2026-01-01", to: "2026-01-31" }, -1)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(shiftPeriod("quarter", { from: "2026-10-01", to: "2026-12-31" }, 1)).toEqual({ from: "2027-01-01", to: "2027-03-31" });
    expect(shiftPeriod("week", { from: "2026-12-28", to: "2027-01-03" }, 1)).toEqual({ from: "2027-01-04", to: "2027-01-10" });
    expect(shiftPeriod("year", { from: "2026-01-01", to: "2026-12-31" }, -2)).toEqual({ from: "2024-01-01", to: "2024-12-31" });
    expect(periodTiming({ from: "2026-10-01", to: "2026-10-31" }, "2026-11-24")).toBe("past");
    expect(periodElapsedPercent({ from: "2026-11-01", to: "2026-11-30" }, "2026-11-15")).toBe(50);
  });
});

describe("income, expenses and result", () => {
  it("completed only, per currency; transfers, cancelled and deleted never; pending apart", () => {
    expect(periodFlow(sample(), { from: "2026-11-01", to: "2026-11-30" }, "ARS")).toEqual([
      { currency: "ARS", income: 50_000, expenses: 28_000, result: 22_000, pendingIncome: 7_000, pendingExpenses: 5_000 },
      { currency: "USD", income: 0, expenses: 1_500, result: -1_500, pendingIncome: 0, pendingExpenses: 0 },
    ]);
  });

  it("the period filter changes the figures (October has one expense)", () => {
    expect(periodFlow(sample(), { from: "2026-10-01", to: "2026-10-31" }, "ARS")).toEqual([
      { currency: "ARS", income: 0, expenses: 1, result: -1, pendingIncome: 0, pendingExpenses: 0 },
    ]);
    expect(periodFlow([], { from: "2026-10-01", to: "2026-10-31" }, "ARS")).toEqual([]);
  });
});

describe("balances", () => {
  const cardTypes = new Map([[CARD, "credit" as const]]);
  it("sums active accounts per currency, never converting; a transfer does not change the total", () => {
    // 100.000 + 50.000 − 20.000 − 1 (October) − 30.000 + 30.000; pending and the credit purchase do not count.
    expect(balancesAt(accounts, sample(), "2026-11-30", "ARS", cardTypes)).toEqual([
      { currency: "ARS", amount: 129_999 },
      { currency: "USD", amount: 3_500 },
    ]);
    expect(balancesAt(accounts, sample(), "2026-11-04", "ARS", cardTypes)).toEqual([
      { currency: "ARS", amount: 99_999 },
      { currency: "USD", amount: 5_000 },
    ]);
  });

  it("flow series: buckets per granularity, balance line only up to today", () => {
    const month = flowSeries(sample(), accounts, { period: { from: "2026-11-01", to: "2026-11-30" }, granularity: "month", currency: "ARS", today: "2026-11-24", cardTypes });
    expect(month).toHaveLength(30);
    expect(month[4]).toMatchObject({ from: "2026-11-05", income: 50_000, expenses: 0, balance: 149_999 });
    expect(month[15]).toMatchObject({ from: "2026-11-16", expenses: 8_000, balance: 129_999 });
    expect(month[29]!.balance).toBeNull();
    expect(month.reduce((s, b) => s + b.expenses, 0)).toBe(28_000); // same as periodFlow: nothing counted twice
    const year = flowSeries(sample(), accounts, { period: { from: "2026-01-01", to: "2026-12-31" }, granularity: "year", currency: "USD", today: "2026-11-24" });
    expect(year).toHaveLength(12);
    expect(year[10]).toMatchObject({ from: "2026-11-01", to: "2026-11-30", expenses: 1_500, balance: 3_500 });
    expect(flowSeries([], accounts, { period: { from: "2026-10-01", to: "2026-12-31" }, granularity: "quarter", currency: "ARS", today: "2026-11-24" }).length).toBe(14);
  });
});

describe("recent and upcoming", () => {
  it("recent: newest first, no cancelled or deleted", () => {
    const r = recentTransactions(sample(), 4);
    expect(r.map((t) => t.date)).toEqual(["2026-11-16", "2026-11-15", "2026-11-12", "2026-11-12"]);
    expect(recentTransactions(sample(), 50).some((t) => t.status === "cancelled" || t.deletedAt !== null)).toBe(false);
  });

  it("pending expenses per currency", () => {
    expect(pendingExpenses(sample(), "ARS")).toEqual([{ currency: "ARS", amount: 5_000 }]);
  });

  it("upcoming: overdue and pending bills with what is left, recurrences not yet represented, never twice", () => {
    const bill = (n: number, over: Loose<Bill>): Bill =>
      ({ ...control(n), name: `EJEMPLO-FICTICIO B${n}`, categoryId: null, amount: 10_000, currency: "ARS", dueDate: "2026-11-30", accountId: null, status: "pending", notes: null, ...over }) as Bill;
    const rec = {
      ...control(60),
      description: "EJEMPLO-FICTICIO Alquiler",
      amount: 300_000,
      currency: "ARS",
      type: "expense",
      frequency: "monthly",
      startDate: "2026-01-26",
      endDate: null,
      categoryId: null,
      accountId: ARS,
      isActive: true,
    } as Recurrence;
    const income = { ...rec, ...control(61), type: "income", description: "EJEMPLO-FICTICIO Sueldo" } as Recurrence;
    const quarterly = { ...rec, ...control(62), frequency: "quarterly", startDate: "2026-09-05", amount: 45_000, description: "EJEMPLO-FICTICIO Seguro" } as Recurrence;
    const items = upcomingObligations(
      [
        { bill: bill(50, { dueDate: "2026-11-20" }), remaining: 4_000 },
        { bill: bill(51, { dueDate: "2026-12-01" }), remaining: 10_000 },
        { bill: bill(52, { status: "paid" }), remaining: 0 },
        { bill: bill(53, { dueDate: "2027-03-01" }), remaining: 10_000 }, // beyond 30 days
        // The 26/11 occurrence of the rent is already a bill: not listed twice (26/12 is beyond 30 days).
        { bill: bill(54, { dueDate: "2026-11-26", recurrenceId: rec.id, occurrenceDate: "2026-11-26" }), remaining: 300_000 },
      ],
      [rec, income, quarterly],
      [],
      { today: "2026-11-24" },
    );
    expect(items.map((i) => [i.kind, i.date, i.amount, i.overdue])).toEqual([
      ["bill", "2026-11-20", 4_000, true],
      ["bill", "2026-11-26", 300_000, false],
      ["bill", "2026-12-01", 10_000, false],
      ["recurrence", "2026-12-05", 45_000, false],
    ]);
  });
});
