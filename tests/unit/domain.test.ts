import { describe, expect, it } from "vitest";
import { currencyCodeSchema, isCurrencyCode } from "@/domain/currency";
import { uuidv7 } from "@/domain/ids";
import { addMoney, compareMoney, money, negateMoney, subtractMoney, sumMoney, totalsByCurrency, zero } from "@/domain/money";
import { committedOnCards, deriveAccountBalance, deriveAccountBalances, incomeAndExpenses } from "@/domain/rules/balances";
import { buildCategoryTree, validateCategoryTree } from "@/domain/rules/categories";
import { nextOccurrence, occurrenceAt } from "@/domain/rules/recurrence";
import { recurrenceSchema, type Category, type Recurrence } from "@/domain/schemas";
import { formatCurrencyAmount } from "@/lib/formatting/money";
import { validateDataFiles } from "@/services/data/dataset";
import { loadSampleFiles, sampleId as ID } from "../helpers/sample-data";

const sample = () => {
  const { dataSet } = validateDataFiles(loadSampleFiles());
  if (!dataSet) throw new Error("invalid sample");
  return { ...dataSet, txs: Object.values(dataSet.transactions).flat() };
};

describe("currencies (D2-02)", () => {
  it("supports the listed ISO 4217 currencies only (D-FX-01)", () => {
    for (const code of ["ARS", "USD", "EUR", "BRL", "UYU", "CLP", "PYG", "GBP"]) expect(isCurrencyCode(code)).toBe(true);
    expect(isCurrencyCode("JPY")).toBe(false);
    expect(currencyCodeSchema.safeParse("JPY").success).toBe(false);
    expect(currencyCodeSchema.safeParse("ars").success).toBe(false);
  });

  it("formats each currency with its own symbol and es-AR digits", () => {
    expect(formatCurrencyAmount(money(123456, "ARS"))).toContain("1.234,56");
    expect(formatCurrencyAmount(money(123456, "USD"))).toMatch(/US\$/);
  });
});

describe("money arithmetic in integer cents", () => {
  it("adds, subtracts and negates exactly", () => {
    expect(addMoney(money(10, "ARS"), money(20, "ARS"))).toEqual(money(30, "ARS"));
    expect(subtractMoney(money(10, "ARS"), money(25, "ARS"))).toEqual(money(-15, "ARS"));
    expect(negateMoney(money(7, "USD"))).toEqual(money(-7, "USD"));
    // 0.1 + 0.2 in cents: no floating point drift.
    expect(sumMoney([money(10, "ARS"), money(20, "ARS")], "ARS").amount).toBe(30);
  });

  it("refuses to mix currencies", () => {
    expect(() => addMoney(money(1, "ARS"), money(1, "USD"))).toThrow(expect.objectContaining({ code: "CURRENCY_MISMATCH" }));
    expect(() => compareMoney(money(1, "ARS"), money(1, "USD"))).toThrow();
    expect(() => sumMoney([money(1, "USD")], "ARS")).toThrow();
  });

  it("rejects non-integer cents and keeps totals per currency", () => {
    expect(() => money(1.5, "ARS")).toThrow();
    const totals = totalsByCurrency([money(1, "ARS"), money(2, "USD"), money(3, "ARS")]);
    expect(totals.get("ARS")).toEqual(money(4, "ARS"));
    expect(totals.get("USD")).toEqual(money(2, "USD"));
    expect(zero("USD")).toEqual(money(0, "USD"));
  });
});

describe("derived balances (D2-03, D2-04, D2-10, D2-11)", () => {
  it("counts completed only; excludes pending, cancelled and card purchases", () => {
    const { accounts, txs } = sample();
    const balances = deriveAccountBalances(accounts, txs);
    // 1 000 000,00 + 3 450 000,00 − 42 310,00 − 10 000,00 (transfer out)
    expect(balances.get(ID(1))).toEqual(money(439_769_000, "ARS"));
    expect(balances.get(ID(2))).toEqual(money(1_000_000, "ARS")); // transfer in
    expect(balances.get(ID(15))).toEqual(money(62_000, "USD"));
  });

  it("includes pending in the projected balance, never cancelled", () => {
    const { accounts, txs } = sample();
    expect(deriveAccountBalance(accounts.find((a) => a.id === ID(1))!, txs, { mode: "projected" })).toEqual(money(439_269_000, "ARS"));
  });

  it("respects asOf and ignores tombstones", () => {
    const { accounts, txs } = sample();
    const a1 = accounts.find((a) => a.id === ID(1))!;
    expect(deriveAccountBalance(a1, txs, { asOf: "2026-11-04" })).toEqual(money(100_000_000, "ARS"));
    const deleted = txs.map((t) => (t.type === "income" && t.currency === "ARS" ? { ...t, deletedAt: "2026-11-24T00:00:00-03:00" } : t));
    expect(deriveAccountBalance(a1, deleted).amount).toBe(439_769_000 - 345_000_000);
  });

  it("never counts a transfer as income or expense, and keeps currencies apart", () => {
    const { txs } = sample();
    const r = incomeAndExpenses(txs, { from: "2026-11-01", to: "2026-11-30" });
    expect(r.income.get("ARS")).toEqual(money(345_000_000, "ARS"));
    expect(r.income.get("USD")).toEqual(money(12_000, "USD"));
    // completed expenses: 42 310,00 + card purchase 18 140,00 (still an expense, D2-11)
    expect(r.expenses.get("ARS")).toEqual(money(4_231_000 + 1_814_000, "ARS"));
  });

  it("reports card purchases as committed on cards", () => {
    const { cards, txs } = sample();
    expect(committedOnCards(cards, txs).get(ID(6))).toEqual(money(1_814_000, "ARS"));
  });
});

describe("recurrences (nextOccurrence derived)", () => {
  const base = (over: Record<string, unknown>): Recurrence =>
    recurrenceSchema.parse({
      id: ID(8),
      rev: 1,
      createdAt: "2026-01-01T00:00:00-03:00",
      updatedAt: "2026-01-01T00:00:00-03:00",
      deletedAt: null,
      deviceId: "test",
      description: "EJEMPLO-FICTICIO",
      amount: 100,
      currency: "ARS",
      type: "expense",
      frequency: "monthly",
      startDate: "2026-01-31",
      endDate: null,
      categoryId: null,
      accountId: ID(1),
      isActive: true,
      ...over,
    });

  it("clamps month ends and leap days", () => {
    expect(occurrenceAt(base({}), 1)).toBe("2026-02-28");
    expect(occurrenceAt(base({}), 2)).toBe("2026-03-31");
    expect(occurrenceAt(base({ startDate: "2028-02-29", frequency: "yearly" }), 1)).toBe("2029-02-28");
    expect(occurrenceAt(base({ startDate: "2026-11-24", frequency: "weekly" }), 1)).toBe("2026-12-01");
  });

  it("finds the next occurrence and stops at endDate or when inactive", () => {
    expect(nextOccurrence(base({}), "2026-11-24")).toBe("2026-11-30");
    expect(nextOccurrence(base({ endDate: "2026-11-01" }), "2026-11-24")).toBeNull();
    expect(nextOccurrence(base({ isActive: false }), "2026-11-24")).toBeNull();
  });
});

describe("category tree", () => {
  const cat = (n: number, type: "income" | "expense", parent: number | null): Category => ({
    id: ID(n),
    rev: 1,
    createdAt: "2026-01-01T00:00:00-03:00",
    updatedAt: "2026-01-01T00:00:00-03:00",
    deletedAt: null,
    deviceId: "test",
    name: `C${n}`,
    type,
    parentId: parent === null ? null : ID(parent),
    icon: null,
    color: null,
    isDefault: false,
    isActive: true,
  });

  it("accepts parent → child and builds the tree", () => {
    const tree = buildCategoryTree([cat(1, "expense", null), cat(2, "expense", 1)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((c) => c.id)).toEqual([ID(2)]);
  });

  it("rejects depth > 2, mixed types and cycles", () => {
    expect(validateCategoryTree([cat(1, "expense", null), cat(2, "expense", 1), cat(3, "expense", 2)]).map((i) => i.message)).toContain("Category hierarchy is deeper than 2 levels");
    expect(validateCategoryTree([cat(1, "expense", null), cat(2, "income", 1)])).toHaveLength(1);
    expect(validateCategoryTree([cat(1, "expense", 2), cat(2, "expense", 1)]).some((i) => i.message.includes("cycle"))).toBe(true);
  });
});

describe("ids", () => {
  it("generates time-ordered UUIDv7", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});
