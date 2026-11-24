import { describe, expect, it } from "vitest";
import {
  accountsReport,
  bucketsFor,
  budgetsReport,
  cardsReport,
  cashFlowReport,
  categoryBreakdown,
  comparisonRange,
  delta,
  expectedInRange,
  filterReportTransactions,
  flowByBucket,
  goalSeries,
  goalsReport,
  incomeExpenseReport,
  monthsEnding,
  reportRange,
  type ReportFilters,
} from "@/domain/rules/reports";
import type { Account, Bill, Budget, Card, Category, Goal, GoalContribution, Recurrence, Transaction } from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { buildReport, type ReportInput } from "@/services/reports/build-report";
import {
  BOM,
  csvDecimal,
  csvText,
  reportDocument,
  reportDocumentSchema,
  reportJson,
  summaryCsv,
  transactionsCsv,
} from "@/services/reports/export";

/** Reports & analytics selectors and exporters (Step 08). Fictitious data only (EJEMPLO-FICTICIO). */
type Loose<T> = { [K in keyof T]?: unknown };
const id = (n: number) => `0193c8a0-${n.toString(16).padStart(4, "0")}-7000-8000-${n.toString(16).padStart(12, "0")}`;
const control = (n: number, created = "2026-10-01T10:00:00-03:00") => ({ id: id(n), rev: 1, createdAt: created, updatedAt: created, deletedAt: null, deviceId: "test" });

const PESOS = id(1);
const AHORRO = id(2);
const DOLARES = id(3);
const CREDIT = id(4);
const DEBIT = id(5);
const FOOD = id(10);
const SUPER = id(11); // child of FOOD
const HOME = id(12);
const SALARY = id(13);

const account = (n: number, currency: "ARS" | "USD", initialBalance: number): Account =>
  ({ ...control(n), name: `EJEMPLO-FICTICIO Cuenta ${n}`, institution: null, accountType: "checking", currency, initialBalance, openingDate: null, status: "active" }) as Account;
const accounts = [account(1, "ARS", 100_000), account(2, "ARS", 0), account(3, "USD", 5_000)];
const category = (n: number, type: "income" | "expense", parentId: string | null = null): Category =>
  ({ ...control(n), name: `EJEMPLO-FICTICIO Cat ${n}`, type, parentId, isArchived: false }) as unknown as Category;
const categories = [category(10, "expense"), category(11, "expense", FOOD), category(12, "expense"), category(13, "income")];
const card = (n: number, cardType: "credit" | "debit", creditLimit: number | null): Card =>
  ({
    ...control(n),
    name: `EJEMPLO-FICTICIO Tarjeta ${n}`,
    cardType,
    currency: "ARS",
    lastFourDigits: null,
    issuer: null,
    creditLimit,
    closingDay: cardType === "credit" ? 20 : null,
    dueDay: cardType === "credit" ? 5 : null,
    paymentAccountId: PESOS,
    status: "active",
  }) as unknown as Card;
const cards = [card(4, "credit", 100_000), card(5, "debit", null)];
const cardTypes = new Map([
  [CREDIT, "credit" as const],
  [DEBIT, "debit" as const],
]);

let seq = 100;
const tx = (over: Loose<Transaction> = {}): Transaction =>
  ({
    ...control(seq++),
    type: "expense",
    description: "EJEMPLO-FICTICIO",
    amount: 10_000,
    currency: "ARS",
    categoryId: null,
    accountId: PESOS,
    destinationAccountId: null,
    cardId: null,
    date: "2026-11-10",
    status: "completed",
    notes: null,
    billId: null,
    recurrenceId: null,
    ...over,
  }) as Transaction;

const NOV = { from: "2026-11-01", to: "2026-11-30" };
const OCT = { from: "2026-10-01", to: "2026-10-31" };

/** November: +50.000 salary, −20.000 food, −5.000 super (child of food), transfer 30.000 to savings,
 *  pending −4.000, cancelled −99.000, deleted −99.000, credit purchase −8.000, debit purchase −2.000,
 *  USD −1.500. October: +40.000 salary, −10.000 food. */
const sample = () => [
  tx({ type: "income", amount: 50_000, categoryId: SALARY, date: "2026-11-05" }),
  tx({ amount: 20_000, categoryId: FOOD, date: "2026-11-06" }),
  tx({ amount: 5_000, categoryId: SUPER, date: "2026-11-07" }),
  tx({ type: "transfer", amount: 30_000, destinationAccountId: AHORRO, date: "2026-11-08" }),
  tx({ amount: 4_000, categoryId: HOME, status: "pending", date: "2026-11-09" }),
  tx({ amount: 99_000, categoryId: HOME, status: "cancelled", date: "2026-11-09" }),
  tx({ amount: 99_000, categoryId: HOME, deletedAt: "2026-11-10T10:00:00-03:00", date: "2026-11-10" }),
  tx({ amount: 8_000, categoryId: HOME, cardId: CREDIT, date: "2026-11-12" }),
  tx({ amount: 2_000, categoryId: HOME, cardId: DEBIT, date: "2026-11-13" }),
  tx({ amount: 1_500, currency: "USD", accountId: DOLARES, date: "2026-11-14" }),
  tx({ type: "income", amount: 40_000, categoryId: SALARY, date: "2026-10-05" }),
  tx({ amount: 10_000, categoryId: FOOD, date: "2026-10-06" }),
];
const all: Pick<ReportFilters, "categoryId" | "accountId" | "type"> = { categoryId: null, accountId: null, type: "all" };

describe("periods and comparisons (Buenos Aires calendar dates)", () => {
  it("ranges per granularity and a custom range (ends swapped when typed backwards)", () => {
    expect(reportRange("month", "2026-11-24")).toEqual(NOV);
    expect(reportRange("quarter", "2026-11-24")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(reportRange("custom", "2026-11-24", { custom: { from: "2026-11-20", to: "2026-11-03" } })).toEqual({ from: "2026-11-03", to: "2026-11-20" });
  });

  it("previous equivalent period and the same period one year before", () => {
    expect(comparisonRange(NOV, "month", "previous")).toEqual(OCT);
    expect(comparisonRange({ from: "2026-01-01", to: "2026-12-31" }, "year", "previous")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(comparisonRange({ from: "2026-11-23", to: "2026-11-29" }, "week", "previous")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    // Custom: the same number of days right before.
    expect(comparisonRange({ from: "2026-11-11", to: "2026-11-20" }, "custom", "previous")).toEqual({ from: "2026-11-01", to: "2026-11-10" });
    expect(comparisonRange(NOV, "month", "lastYear")).toEqual({ from: "2025-11-01", to: "2025-11-30" });
    // February of a leap year → February of the previous year ends on the 28th.
    expect(comparisonRange({ from: "2028-02-01", to: "2028-02-29" }, "month", "lastYear")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    // A week keeps its weekday: 52 weeks back.
    expect(comparisonRange({ from: "2026-11-23", to: "2026-11-29" }, "week", "lastYear")).toEqual({ from: "2025-11-24", to: "2025-11-30" });
  });

  it("buckets: days up to 31 days, weeks up to 92, calendar months beyond (clipped)", () => {
    expect(bucketsFor(NOV)).toHaveLength(30);
    const quarter = bucketsFor({ from: "2026-10-01", to: "2026-12-31" });
    expect(quarter[0]).toEqual({ from: "2026-10-01", to: "2026-10-07", unit: "week" });
    expect(quarter.at(-1)!.to).toBe("2026-12-31");
    const custom = bucketsFor({ from: "2026-01-15", to: "2026-06-10" });
    expect(custom.map((b) => [b.from, b.to])).toEqual([
      ["2026-01-15", "2026-01-31"],
      ["2026-02-01", "2026-02-28"],
      ["2026-03-01", "2026-03-31"],
      ["2026-04-01", "2026-04-30"],
      ["2026-05-01", "2026-05-31"],
      ["2026-06-01", "2026-06-10"],
    ]);
    expect(monthsEnding("2026-02-10", 3).map((m) => m.from)).toEqual(["2025-12-01", "2026-01-01", "2026-02-01"]);
  });

  it("deltas: never a percentage against zero", () => {
    expect(delta(150, 100)).toEqual({ amount: 50, percent: 50 });
    expect(delta(50, 100)).toEqual({ amount: -50, percent: -50 });
    expect(delta(100, 0)).toEqual({ amount: 100, percent: null });
    expect(delta(-50, -100)).toEqual({ amount: 50, percent: 50 });
  });
});

describe("A · income and expenses", () => {
  it("completed only and per currency; transfers, cancelled and deleted excluded; pending apart; compared with October", () => {
    const rows = incomeExpenseReport(filterReportTransactions(sample(), all, categories), NOV, OCT, "ARS");
    expect(rows).toHaveLength(2);
    const ars = rows[0]!;
    expect(ars.currency).toBe("ARS");
    // 20.000 + 5.000 + 8.000 (credit purchase, once) + 2.000 (debit) = 35.000
    expect(ars.current).toEqual({ currency: "ARS", income: 50_000, expenses: 35_000, result: 15_000, pendingIncome: 0, pendingExpenses: 4_000 });
    expect(ars.previous).toMatchObject({ income: 40_000, expenses: 10_000, result: 30_000 });
    expect(ars.income).toEqual({ amount: 10_000, percent: 25 });
    expect(ars.expenses).toEqual({ amount: 25_000, percent: 250 });
    expect(ars.movements).toBe(5);
    // USD never added to ARS; no previous USD data → no percentage.
    expect(rows[1]).toMatchObject({ currency: "USD", current: { expenses: 1_500 }, expenses: { amount: 1_500, percent: null } });
  });

  it("filters: category includes its subcategories; account matches origin or destination; type", () => {
    const food = filterReportTransactions(sample(), { ...all, categoryId: FOOD }, categories);
    expect(food.map((t) => t.amount).sort((a, b) => a - b)).toEqual([5_000, 10_000, 20_000]);
    const savings = filterReportTransactions(sample(), { ...all, accountId: AHORRO }, categories);
    expect(savings.map((t) => t.type)).toEqual(["transfer"]);
    const transfers = filterReportTransactions(sample(), { ...all, type: "transfer" }, categories);
    expect(incomeExpenseReport(transfers, NOV, OCT, "ARS")).toEqual([]);
    expect(filterReportTransactions(sample(), { ...all, type: "income" }, categories).every((t) => t.type === "income")).toBe(true);
    // Cancelled and deleted never pass a filter.
    expect(filterReportTransactions(sample(), { ...all, categoryId: HOME }, categories).map((t) => t.amount).sort((a, b) => a - b)).toEqual([2_000, 4_000, 8_000]);
  });

  it("evolution per bucket adds up to the period totals (nothing counted twice)", () => {
    const points = flowByBucket(filterReportTransactions(sample(), all, categories), bucketsFor(NOV), "ARS");
    expect(points.reduce((s, p) => s + p.expenses, 0)).toBe(35_000);
    expect(points.reduce((s, p) => s + p.income, 0)).toBe(50_000);
    expect(points[4]).toMatchObject({ from: "2026-11-05", income: 50_000, result: 50_000 });
  });
});

describe("C · categories", () => {
  it("rolls subcategories up, shares in basis points, ranking and comparison", () => {
    const b = categoryBreakdown(filterReportTransactions(sample(), all, categories), categories, { currency: "ARS", kind: "expense", range: NOV, previousRange: OCT, rollUp: true });
    expect(b.total).toBe(35_000);
    expect(b.rows.map((r) => [r.categoryId, r.amount, r.previous, r.share])).toEqual([
      [FOOD, 25_000, 10_000, 7_143],
      [HOME, 10_000, 0, 2_857],
    ]);
    expect(b.rows[0]!.delta).toEqual({ amount: 15_000, percent: 150 });
    // With a category filter the subcategories show on their own.
    const food = categoryBreakdown(filterReportTransactions(sample(), { ...all, categoryId: FOOD }, categories), categories, { currency: "ARS", kind: "expense", range: NOV, previousRange: OCT, rollUp: false });
    expect(food.rows.map((r) => r.categoryId)).toEqual([FOOD, SUPER]);
    const income = categoryBreakdown(filterReportTransactions(sample(), all, categories), categories, { currency: "ARS", kind: "income", range: NOV, previousRange: OCT, rollUp: true });
    expect(income.rows).toEqual([expect.objectContaining({ categoryId: SALARY, amount: 50_000, share: 10_000 })]);
  });
});

describe("B · cash flow", () => {
  const options = { range: NOV, buckets: bucketsFor(NOV), currency: "ARS" as const, today: "2026-11-24", accountId: null, cardTypes };
  it("credit-card purchases never leave the account; internal transfers cancel out; balance identity holds", () => {
    const f = cashFlowReport(accounts, sample(), options);
    expect(f.opening).toBe(100_000 + 40_000 - 10_000);
    expect(f.inflow).toBe(50_000);
    expect(f.outflow).toBe(27_000); // 20.000 + 5.000 + 2.000 (debit); the 8.000 credit purchase is not here
    expect(f.transfersIn).toBe(0);
    expect(f.transfersOut).toBe(0);
    expect(f.closing).toBe(f.opening + f.net);
    expect(f.points.at(-1)!.balance).toBeNull(); // after today
    expect(f.positive).toBe(1);
    expect(f.negative).toBe(3);
    expect(f.judged).toBe(24);
  });

  it("with an account filter, transfers in and out count and balances are that account's", () => {
    const savings = cashFlowReport(accounts, sample(), { ...options, accountId: AHORRO });
    expect(savings).toMatchObject({ opening: 0, inflow: 0, outflow: 0, transfersIn: 30_000, transfersOut: 0, net: 30_000, closing: 30_000 });
    const main = cashFlowReport(accounts, sample(), { ...options, accountId: PESOS });
    expect(main.transfersOut).toBe(30_000);
    expect(main.closing).toBe(main.opening + main.net);
  });

  it("what is still expected: pending, bills left to pay, unmaterialised recurrences (never twice)", () => {
    const bill = { ...control(50), name: "EJEMPLO-FICTICIO Luz", description: null, categoryId: HOME, amount: 12_000, currency: "ARS", dueDate: "2026-11-28", accountId: PESOS, status: "pending", notes: null, recurrenceId: null, occurrenceDate: null } as Bill;
    const payment = tx({ amount: 2_000, billId: bill.id, status: "pending", date: "2026-11-26" });
    const recurrence = { ...control(60), description: "EJEMPLO-FICTICIO Gimnasio", amount: 3_000, currency: "ARS", type: "expense", frequency: "weekly", startDate: "2026-11-02", endDate: null, categoryId: null, accountId: PESOS, isActive: true, cancelledAt: null, notes: null } as Recurrence;
    const materialized = tx({ amount: 3_000, recurrenceId: recurrence.id, status: "pending", date: "2026-11-30" });
    const rows = expectedInRange([...sample(), payment, materialized], [bill], [recurrence], { range: NOV, today: "2026-11-24", baseCurrency: "ARS", accountId: null });
    // pending: 4.000 + 2.000 (payment) + 3.000 (materialised occurrence); bill: 12.000 − 2.000 paid;
    // recurrence on 30/11 is already a transaction → not counted again; the earlier ones are past today.
    expect(rows).toEqual([{ currency: "ARS", pendingIncome: 0, pendingExpenses: 9_000, billsDue: 10_000, recurring: 0 }]);
    const december = expectedInRange([], [], [recurrence], { range: { from: "2026-12-01", to: "2026-12-31" }, today: "2026-11-24", baseCurrency: "ARS", accountId: null });
    expect(december[0]!.recurring).toBe(4 * 3_000); // weekly from Monday 02/11 → 7, 14, 21 and 28 December
  });
});

describe("D · accounts", () => {
  it("opening/closing balances, movements by type, credit purchases apart, pending counted only as pending", () => {
    const rows = accountsReport(accounts, sample(), { range: NOV, today: "2026-11-24", accountId: null, cardTypes });
    const pesos = rows.find((r) => r.account.id === PESOS)!;
    expect(pesos).toMatchObject({
      opening: 130_000,
      income: 50_000,
      expenses: 27_000,
      creditPurchases: 8_000,
      transfersIn: 0,
      transfersOut: 30_000,
      operations: { income: 1, expense: 4, transfer: 1 },
      pending: 1,
    });
    expect(pesos.closing).toBe(pesos.opening + pesos.income - pesos.expenses + pesos.transfersIn - pesos.transfersOut);
    expect(rows.find((r) => r.account.id === AHORRO)).toMatchObject({ transfersIn: 30_000, closing: 30_000 });
    expect(accountsReport(accounts, sample(), { range: NOV, today: "2026-11-24", accountId: DOLARES })).toHaveLength(1);
  });
});

describe("E · cards", () => {
  it("purchases per card, committed and limit use over time; no statement payment double counted", () => {
    const filtered = filterReportTransactions(sample(), all, categories);
    const rows = cardsReport(cards, filtered, sample(), { range: NOV, previousRange: OCT, buckets: bucketsFor(NOV), today: "2026-11-24" });
    const credit = rows.find((r) => r.card.id === CREDIT)!;
    expect(credit).toMatchObject({ purchases: 8_000, purchasesCount: 1, committed: 8_000, utilization: 8 });
    expect(credit.points).toHaveLength(24);
    expect(credit.points[10]).toMatchObject({ from: "2026-11-11", committed: 0, utilization: 0 });
    expect(credit.points[11]).toMatchObject({ from: "2026-11-12", committed: 8_000, utilization: 8 });
    const debit = rows.find((r) => r.card.id === DEBIT)!;
    expect(debit).toMatchObject({ purchases: 2_000, committed: null, utilization: null, points: [] });
  });
});

describe("F · budgets", () => {
  const budget = (n: number, categoryId: string | null, amount: number, from = "2026-11-01", to = "2026-11-30"): Budget =>
    ({ ...control(n), name: `EJEMPLO-FICTICIO Presupuesto ${n}`, categoryId, amount, currency: "ARS", period: "monthly", startDate: from, endDate: to, description: null, status: "active" }) as Budget;
  it("budgeted vs used, execution, over budget, previous period; a parent and a child never count an expense twice", () => {
    const budgets = [budget(70, FOOD, 20_000), budget(71, SUPER, 10_000), budget(72, HOME, 50_000, "2026-10-01", "2026-10-31")];
    const { rows, totals } = budgetsReport(budgets, sample(), categories, { range: NOV, today: "2026-11-24", baseCurrency: "ARS" });
    expect(rows.map((r) => r.budget.id)).toEqual([id(70), id(71)]); // October's is outside the range
    expect(rows[0]).toMatchObject({ usage: { spent: 25_000, state: "exceeded", over: 5_000, percent: 125 }, previousSpent: 10_000, running: true });
    expect(rows[1]).toMatchObject({ usage: { spent: 5_000 } });
    expect(totals).toEqual([{ currency: "ARS", budgeted: 30_000, spent: 25_000, exceeded: 1, count: 2 }]);
  });
});

describe("G · goals", () => {
  const goal = { ...control(80), name: "EJEMPLO-FICTICIO Viaje", description: null, kind: "travel", amount: 100_000, initialAmount: 10_000, currency: "ARS", startDate: "2026-09-01", targetDate: "2027-06-30", status: "active", completedAt: null, archivedAt: null } as Goal;
  const contribution = (n: number, amount: number, date: string, cancelled = false): GoalContribution =>
    ({ ...control(n), goalId: goal.id, amount, currency: "ARS", date, description: null, accountId: null, transactionId: null, cancelledAt: cancelled ? "2026-11-20T10:00:00-03:00" : null }) as GoalContribution;

  it("progress, contributions in the range, pace and estimate only with enough data; never income", () => {
    const contributions = [contribution(81, 15_000, "2026-10-10"), contribution(82, 15_000, "2026-11-10"), contribution(83, 50_000, "2026-11-11", true)];
    const [row] = goalsReport([goal], contributions, { range: NOV, today: "2026-11-24" });
    expect(row).toMatchObject({ contributedInRange: 15_000, contributionsInRange: 1, progress: { saved: 40_000, remaining: 60_000 }, pacePerMonth: 10_000 });
    expect(row!.estimatedDate).toBe("2027-05-24");
    const [few] = goalsReport([goal], [contribution(84, 5_000, "2026-11-10")], { range: NOV, today: "2026-11-24" });
    expect(few).toMatchObject({ pacePerMonth: null, estimatedDate: null });
    const series = goalSeries([goal], contributions, { buckets: monthsEnding("2026-11-30", 3), currency: "ARS", today: "2026-11-24" });
    expect(series.map((p) => [p.from, p.contributed, p.accumulated])).toEqual([
      ["2026-09-01", 0, 10_000],
      ["2026-10-01", 15_000, 25_000],
      ["2026-11-01", 15_000, 40_000],
    ]);
  });
});

/* ------------------------------------------------------------------------------ */
/* The whole report and its exports                                                 */
/* ------------------------------------------------------------------------------ */

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  accounts,
  cards,
  categories,
  transactions: sample(),
  bills: [],
  recurrences: [],
  budgets: [],
  goals: [],
  contributions: [],
  settings: DEFAULT_FINANCIAL_SETTINGS,
  today: "2026-11-24",
  ...over,
});
const filters = (over: Partial<ReportFilters> = {}): ReportFilters => ({ range: NOV, granularity: "month", comparison: "previous", categoryId: null, accountId: null, type: "all", ...over });

describe("whole report", () => {
  it("currencies apart; reliability flags; empty data gives empty figures", () => {
    const r = buildReport(input(), filters());
    expect(r.currencies).toEqual(["ARS", "USD"]);
    expect(r.reliability).toEqual({ partial: true, pending: true, narrowed: false });
    expect(r.transactions.some((t) => t.status === "cancelled" || t.deletedAt !== null)).toBe(false);
    expect(r.monthly[0]!.points).toHaveLength(12);
    const october = buildReport(input(), filters({ range: OCT }));
    expect(october.reliability.partial).toBe(false);
    const empty = buildReport(input({ accounts: [], cards: [], transactions: [] }), filters());
    expect(empty.currencies).toEqual([]);
    expect(empty.incomeExpenses).toEqual([]);
    expect(empty.transactions).toEqual([]);
    expect(buildReport(input(), filters({ categoryId: FOOD })).reliability.narrowed).toBe(true);
  });
});

describe("exports", () => {
  it("CSV helpers: comma decimals, formula injection neutralised, quoting", () => {
    expect(csvDecimal(123_456)).toBe("1234,56");
    expect(csvDecimal(-5)).toBe("-0,05");
    expect(csvText("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvText("+54 11")).toBe("'+54 11");
    expect(csvText("Pan; leche")).toBe('"Pan; leche"');
    expect(csvText("línea\nnueva")).toBe('"línea\nnueva"');
    expect(csvText(null)).toBe("");
  });

  it("transactions CSV: UTF-8 BOM, header, CRLF, signed amounts, cancelled excluded", () => {
    const csv = transactionsCsv(buildReport(input(), filters()));
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Fecha;Tipo;Estado;Descripción;Categoría;Cuenta;Cuenta destino;Tarjeta;Moneda;Importe;Importe (centavos)");
    expect(lines).toHaveLength(1 + 8); // 10 November records − cancelled − deleted
    expect(lines).toContain(`2026-11-05;Ingreso;Completada;EJEMPLO-FICTICIO;EJEMPLO-FICTICIO Cat 13;EJEMPLO-FICTICIO Cuenta 1;;;ARS;500,00;50000`);
    expect(lines.some((l) => l.includes("Pendiente") && l.endsWith(";-40,00;-4000"))).toBe(true);
    expect(csv).not.toContain("990,00");
  });

  it("summary CSV: one row per figure with its currency", () => {
    const csv = summaryCsv(buildReport(input(), filters()));
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain("Ingresos y gastos;ARS;Gastos;;350,00;35000;100,00;10000;");
    expect(csv).toContain("Ingresos y gastos;USD;Gastos;;15,00;1500;0,00;0;");
    expect(csv).toContain("Gastos por categoría;ARS;EJEMPLO-FICTICIO Cat 10;;250,00;25000;100,00;10000;71,43");
  });

  it("JSON: validated document with period, comparison, filters, currencies and the plaintext warning", () => {
    const r = buildReport(input(), filters({ accountId: PESOS }));
    const doc = reportDocument(r, new Date("2026-11-24T15:00:00Z"));
    expect(reportDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc).toMatchObject({
      format: "pfm.report",
      formatVersion: 1,
      generatedAt: "2026-11-24T12:00:00-03:00",
      timeZone: "America/Argentina/Buenos_Aires",
      amountUnit: "minor",
      containsFinancialData: true,
      encrypted: false,
      period: { from: "2026-11-01", to: "2026-11-30", granularity: "month", status: "inProgress" },
      comparison: { from: "2026-10-01", to: "2026-10-31", mode: "previous" },
      filters: { accountId: PESOS, account: "EJEMPLO-FICTICIO Cuenta 1", categoryId: null, type: "all" },
      // The account filter keeps only that account's movements: no USD left to report.
      currencies: ["ARS"],
    });
    expect(doc.notes[0]).toMatch(/no está cifrado/);
    expect(doc.transactions.every((t) => t.account === "EJEMPLO-FICTICIO Cuenta 1" || t.destinationAccount === "EJEMPLO-FICTICIO Cuenta 1")).toBe(true);
    expect(JSON.parse(reportJson(r))).toMatchObject({ format: "pfm.report" });
    // A tampered document fails the schema (amounts must be integers in minor units).
    expect(reportDocumentSchema.safeParse({ ...doc, incomeExpenses: [{ ...doc.incomeExpenses[0], movements: 1.5 }] }).success).toBe(false);
  });
});
