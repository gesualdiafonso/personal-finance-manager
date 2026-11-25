import { describe, expect, it } from "vitest";
import { cardTypesOf, deriveAccountBalance } from "@/domain/rules/balances";
import { budgetUsage } from "@/domain/rules/budgets";
import { flowSeries, periodFlow } from "@/domain/rules/dashboard";
import { goalProgress } from "@/domain/rules/goals";
import { summarizeTransactions } from "@/domain/rules/transactions";
import type { Account, Budget, Card, Category, Goal, GoalContribution, Transaction } from "@/domain/schemas";
import { toLocalDate } from "@/lib/formatting/date";
import { formatMoney, parseMoneyInput } from "@/lib/formatting/money";

/**
 * Step 10 — independent cross-check of the financial rules. A seeded generator builds a large
 * fictitious ledger (EJEMPLO-FICTICIO) with every edge the rules must handle: two currencies,
 * transfers, pending/cancelled/deleted records, credit and debit card purchases, month and
 * leap-day boundaries. Each figure is then recomputed here with a deliberately naive,
 * separate implementation (plain loops over integer cents) and compared with the domain
 * functions the app uses. Any drift between them fails the test.
 */

/** Deterministic PRNG (mulberry32): the same ledger on every run. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const id = (n: number) => `0193c8a0-${(n >> 16).toString(16).padStart(4, "0")}-7000-8000-${n.toString(16).padStart(12, "0")}`;
const stamp = "2028-01-01T10:00:00-03:00";
const control = (n: number) => ({ id: id(n), rev: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null as string | null, deviceId: "crosscheck" });

const accounts: Account[] = [
  { ...control(1), name: "EJEMPLO-FICTICIO A", institution: null, accountType: "checking", currency: "ARS", initialBalance: 1_000_000, openingDate: null, status: "active" },
  { ...control(2), name: "EJEMPLO-FICTICIO B", institution: null, accountType: "savings", currency: "ARS", initialBalance: 0, openingDate: null, status: "active" },
  { ...control(3), name: "EJEMPLO-FICTICIO C", institution: null, accountType: "checking", currency: "USD", initialBalance: 50_000, openingDate: null, status: "active" },
  { ...control(4), name: "EJEMPLO-FICTICIO D", institution: null, accountType: "cash", currency: "USD", initialBalance: -2_500, openingDate: null, status: "active" },
] as Account[];
const cards: Card[] = [
  { ...control(10), accountId: id(1), name: "EJEMPLO-FICTICIO Crédito", cardType: "credit", lastFourDigits: null, creditLimit: 500_000, closingDay: 20, dueDay: 5, currency: "ARS", status: "active" },
  { ...control(11), accountId: id(1), name: "EJEMPLO-FICTICIO Débito", cardType: "debit", lastFourDigits: null, creditLimit: null, closingDay: null, dueDay: null, currency: "ARS", status: "active" },
] as Card[];
const categories: Category[] = [
  { ...control(20), name: "Raíz", type: "expense", parentId: null, color: null, icon: null, isActive: true, isDefault: false },
  { ...control(21), name: "Hija", type: "expense", parentId: id(20), color: null, icon: null, isActive: true, isDefault: false },
  { ...control(22), name: "Otra", type: "expense", parentId: null, color: null, icon: null, isActive: true, isDefault: false },
  { ...control(23), name: "Ingresos", type: "income", parentId: null, color: null, icon: null, isActive: true, isDefault: false },
] as Category[];

const DATES = ["2028-01-31", "2028-02-01", "2028-02-15", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-31", "2028-04-01"];

function ledger(size: number, seed: number): Transaction[] {
  const rnd = prng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const out: Transaction[] = [];
  for (let i = 0; i < size; i++) {
    const currency = rnd() < 0.75 ? "ARS" : "USD";
    const own = accounts.filter((a) => a.currency === currency);
    const type = pick(["income", "expense", "expense", "transfer"] as const);
    const account = pick(own);
    const other = own.find((a) => a.id !== account.id)!;
    const card = type === "expense" && currency === "ARS" && rnd() < 0.3 ? pick(cards) : null;
    out.push({
      ...control(1000 + i),
      deletedAt: rnd() < 0.05 ? stamp : null,
      type,
      description: `EJEMPLO-FICTICIO ${i}`,
      amount: 1 + Math.floor(rnd() * 9_999_999), // 1 cent … ~ $ 99.999,99
      currency,
      categoryId: type === "transfer" ? null : type === "income" ? id(23) : pick([id(20), id(21), id(22), null]),
      accountId: card ? card.accountId : account.id,
      destinationAccountId: type === "transfer" ? other.id : null,
      cardId: card ? card.id : null,
      date: pick(DATES),
      status: pick(["completed", "completed", "completed", "pending", "cancelled"] as const),
      notes: null,
      billId: null,
      recurrenceId: null,
    } as Transaction);
  }
  return out;
}

/* ---------- the independent implementation ---------- */
const counts = (t: Transaction) => t.deletedAt === null && t.status === "completed";
function naiveFlow(txs: Transaction[], from: string, to: string, currency: string) {
  let income = 0;
  let expenses = 0;
  for (const t of txs) {
    if (!counts(t) || t.currency !== currency || t.date < from || t.date > to) continue;
    if (t.type === "income") income += t.amount;
    if (t.type === "expense") expenses += t.amount;
  }
  return { income, expenses, result: income - expenses };
}
function naiveBalance(a: Account, txs: Transaction[], asOf: string) {
  let balance = a.initialBalance;
  for (const t of txs) {
    if (!counts(t) || t.date > asOf) continue;
    const credit = t.cardId === id(10); // only the credit card stays off the account (D4-08)
    if (t.type === "income" && t.accountId === a.id) balance += t.amount;
    if (t.type === "expense" && t.accountId === a.id && !credit) balance -= t.amount;
    if (t.type === "transfer" && t.accountId === a.id) balance -= t.amount;
    if (t.type === "transfer" && t.destinationAccountId === a.id) balance += t.amount;
  }
  return balance;
}

describe("financial cross-check (independent recomputation)", () => {
  for (const seed of [1, 7, 2026]) {
    const txs = ledger(600, seed);
    const cardTypes = cardTypesOf(cards);

    it(`period income, expenses and result per currency (seed ${seed})`, () => {
      for (const [from, to] of [
        ["2028-02-01", "2028-02-29"], // leap-year February
        ["2028-01-31", "2028-01-31"], // a single day at a month end
        ["2028-03-01", "2028-03-31"],
        ["2028-01-01", "2028-12-31"],
      ] as const) {
        const flows = periodFlow(txs, { from, to }, "ARS");
        for (const currency of ["ARS", "USD"] as const) {
          const mine = naiveFlow(txs, from, to, currency);
          const theirs = flows.find((f) => f.currency === currency);
          expect({ income: theirs?.income ?? 0, expenses: theirs?.expenses ?? 0, result: theirs?.result ?? 0 }).toEqual(mine);
        }
      }
      // Transactions screen summary uses the same rules.
      const feb = txs.filter((t) => t.date >= "2028-02-01" && t.date <= "2028-02-29" && t.deletedAt === null && t.status !== "cancelled");
      const summary = summarizeTransactions(feb, "all", "ARS").find((s) => s.currency === "ARS")!;
      expect(summary.income.amount).toBe(naiveFlow(txs, "2028-02-01", "2028-02-29", "ARS").income);
      expect(summary.expenses.amount).toBe(naiveFlow(txs, "2028-02-01", "2028-02-29", "ARS").expenses);
    });

    it(`account balances on every boundary date (seed ${seed})`, () => {
      for (const asOf of DATES) {
        for (const a of accounts) {
          const live = txs.filter((t) => t.deletedAt === null);
          expect(deriveAccountBalance(a, live, { mode: "current", asOf, cardTypes }).amount).toBe(naiveBalance(a, txs, asOf));
        }
      }
      // Transfers never change the total of a currency; only income and non-credit expenses do.
      const total = (c: string, asOf: string) => accounts.filter((a) => a.currency === c).reduce((s, a) => s + naiveBalance(a, txs, asOf), 0);
      const nonCredit = txs.filter((t) => t.cardId !== id(10));
      const f = naiveFlow(nonCredit, "0000-01-01", "2028-04-01", "ARS");
      expect(total("ARS", "2028-04-01")).toBe(1_000_000 + f.income - f.expenses);
    });

    it(`daily chart buckets add up to the period totals (seed ${seed})`, () => {
      const series = flowSeries(txs, accounts, { period: { from: "2028-02-01", to: "2028-02-29" }, granularity: "month", currency: "ARS", today: "2028-12-31", cardTypes });
      expect(series).toHaveLength(29);
      const mine = naiveFlow(txs, "2028-02-01", "2028-02-29", "ARS");
      expect(series.reduce((s, b) => s + b.income, 0)).toBe(mine.income);
      expect(series.reduce((s, b) => s + b.expenses, 0)).toBe(mine.expenses);
      expect(series.at(-1)!.balance).toBe(naiveBalance(accounts[0]!, txs, "2028-02-29") + naiveBalance(accounts[1]!, txs, "2028-02-29"));
    });

    it(`budget consumption: category and children, currency, dates, completed only (seed ${seed})`, () => {
      const budget = { ...control(30), name: "EJEMPLO-FICTICIO", categoryId: id(20), amount: 3_000_000, currency: "ARS", period: "monthly", startDate: "2028-02-01", endDate: "2028-02-29" } as Budget;
      let spent = 0;
      let pending = 0;
      for (const t of txs) {
        if (t.deletedAt !== null || t.type !== "expense" || t.currency !== "ARS" || t.date < "2028-02-01" || t.date > "2028-02-29") continue;
        if (t.categoryId !== id(20) && t.categoryId !== id(21)) continue;
        if (t.status === "completed") spent += t.amount;
        if (t.status === "pending") pending += t.amount;
      }
      expect(budgetUsage(budget, txs, categories)).toMatchObject({ spent, pending, remaining: 3_000_000 - spent, over: Math.max(0, spent - 3_000_000), percent: Math.floor((spent * 100) / 3_000_000) });
    });
  }

  it("goal progress with integer cents and cancelled contributions", () => {
    const rnd = prng(99);
    const goal = { ...control(40), name: "EJEMPLO-FICTICIO", description: null, kind: "other", amount: 123_456_789, initialAmount: 1, currency: "ARS", startDate: "2028-01-01", targetDate: null, status: "active", completedAt: null, archivedAt: null } as Goal;
    const contributions = Array.from({ length: 200 }, (_, i) => ({
      ...control(5000 + i),
      goalId: id(40),
      amount: 1 + Math.floor(rnd() * 999_999),
      currency: "ARS",
      date: "2028-02-01",
      description: null,
      accountId: null,
      transactionId: null,
      cancelledAt: rnd() < 0.2 ? stamp : null,
    })) as GoalContribution[];
    const saved = 1 + contributions.filter((c) => c.cancelledAt === null).reduce((s, c) => s + c.amount, 0);
    expect(goalProgress(goal, contributions, "2028-02-01")).toMatchObject({ saved, remaining: Math.max(0, 123_456_789 - saved), percent: Math.floor((saved * 100) / 123_456_789) });
  });
});

describe("money and dates at the edges", () => {
  it("formats zero, negatives, cents and large values without floating-point drift", () => {
    expect(formatMoney(0)).toBe("$ 0,00");
    expect(formatMoney(-1)).toBe("−$ 0,01");
    expect(formatMoney(10)).toBe("$ 0,10");
    expect(formatMoney(999_999_999_999)).toBe("$ 9.999.999.999,99");
    expect(formatMoney(-12_345, { currency: "USD" })).toBe("−US$ 123,45");
    // 0,1 + 0,2 in cents is exact.
    const a = parseMoneyInput("0,10");
    const b = parseMoneyInput("0,20");
    expect(a.ok && b.ok && a.value + b.value).toBe(30);
    expect(parseMoneyInput("1.234,56")).toEqual({ ok: true, value: 123_456 });
    expect(parseMoneyInput("1,234").ok).toBe(false); // three decimals are refused, never rounded
  });

  it("dates follow Buenos Aires (UTC−3), whatever the device time zone (tests run in Asia/Tokyo)", () => {
    expect(toLocalDate(new Date("2026-12-01T02:59:00Z"))).toBe("2026-11-30");
    expect(toLocalDate(new Date("2026-12-01T03:00:00Z"))).toBe("2026-12-01");
    expect(toLocalDate(new Date("2028-03-01T02:00:00Z"))).toBe("2028-02-29");
  });
});
