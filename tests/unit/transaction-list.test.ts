import { describe, expect, it } from "vitest";
import { money } from "@/domain/money";
import {
  activeFilterCount,
  filterTransactions,
  listedAmount,
  NO_TRANSACTION_FILTERS,
  normalizeText,
  periodRange,
  sortTransactions,
  summarizeTransactions,
  type Lookups,
} from "@/domain/rules/transactions";
import type { Transaction } from "@/domain/schemas";
import { validateDataFiles } from "@/services/data/dataset";
import { loadSampleFiles, sampleId as ID } from "../helpers/sample-data";

const sample = () => {
  const { dataSet } = validateDataFiles(loadSampleFiles());
  const txs = Object.values(dataSet!.transactions).flat();
  const lookups: Lookups = { accounts: new Map(dataSet!.accounts.map((a) => [a.id, a])), categories: new Map(dataSet!.categories.map((c) => [c.id, c])) };
  return { ...dataSet!, txs, lookups };
};
const f = (over: Partial<typeof NO_TRANSACTION_FILTERS>) => ({ ...NO_TRANSACTION_FILTERS, ...over });

describe("periods on the Buenos Aires calendar (Step 04 §9.3)", () => {
  it("today, week (Monday or Sunday), month, previous month, last 30/90 days, year", () => {
    const today = "2026-11-25"; // a Wednesday
    expect(periodRange("today", today)).toEqual({ from: today, to: today });
    expect(periodRange("week", today)).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(periodRange("week", today, { firstDayOfWeek: "sunday" })).toEqual({ from: "2026-11-22", to: "2026-11-28" });
    expect(periodRange("month", today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange("prevMonth", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("prevMonth", "2027-01-10")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(periodRange("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodRange("last30", today)).toEqual({ from: "2026-10-27", to: today });
    expect(periodRange("last90", today)).toEqual({ from: "2026-08-28", to: today });
    expect(periodRange("year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(periodRange("all", today)).toBeNull();
  });

  it("custom: open ends and reversed dates", () => {
    expect(periodRange("custom", "2026-11-25", { custom: { from: "2026-11-10" } })).toEqual({ from: "2026-11-10", to: "9999-12-31" });
    expect(periodRange("custom", "2026-11-25", { custom: { from: "2026-11-20", to: "2026-11-01" } })).toEqual({ from: "2026-11-01", to: "2026-11-20" });
  });

  it("does not depend on the device clock: Sunday 23:30 in Buenos Aires is still Sunday's week", () => {
    expect(periodRange("week", "2026-11-29")).toEqual({ from: "2026-11-23", to: "2026-11-29" });
  });
});

describe("search", () => {
  it("ignores accents and case, and searches description, notes, account, institution and category", () => {
    const { txs, lookups } = sample();
    expect(normalizeText("  Alimentación  ÑANDÚ ")).toBe("alimentacion nandu");
    const ids = (q: string) => filterTransactions(txs, f({ query: q }), lookups).map((t) => t.id);
    expect(ids("verduleria")).toEqual([ID(17)]); // category of the card purchase
    const renamed: Lookups = { ...lookups, accounts: new Map([...lookups.accounts].map(([k, a]) => [k, k === ID(2) ? { ...a, name: "EJEMPLO-FICTICIO Caja Destino" } : a])) };
    expect(filterTransactions(txs, f({ query: "destino" }), renamed).map((t) => t.id)).toEqual([ID(12)]); // transfer destination account
    expect(ids("EJEMPLO-FICTICIO Banco").length).toBeGreaterThan(0); // institution
    expect(ids("ingreso usd")).toEqual([ID(20)]); // every word must match
    expect(ids("nada-parecido")).toEqual([]);
  });
});

describe("filters", () => {
  it("type, status, currency, card, account (both sides of a transfer) and category (with children)", () => {
    const { txs, lookups } = sample();
    const n = (over: Partial<typeof NO_TRANSACTION_FILTERS>) => filterTransactions(txs, f(over), lookups).length;
    expect(n({})).toBe(7);
    expect(n({ type: "transfer" })).toBe(1);
    expect(n({ status: "pending" })).toBe(1);
    expect(n({ status: "cancelled" })).toBe(1);
    expect(n({ currency: "USD" })).toBe(1);
    expect(n({ cardId: ID(6) })).toBe(1);
    expect(n({ accountId: ID(2) })).toBe(1); // only the incoming transfer
    expect(n({ categoryId: ID(3) })).toBe(3); // parent: its own 2 + the child's 1
    expect(n({ type: "expense", status: "completed", accountId: ID(1) })).toBe(2);
    expect(activeFilterCount(f({ type: "expense", query: "x" }))).toBe(2);
    expect(activeFilterCount(NO_TRANSACTION_FILTERS)).toBe(0);
  });

  it("never lists deleted records", () => {
    const { txs, lookups } = sample();
    const deleted = txs.map((t) => ({ ...t, deletedAt: "2026-11-24T09:00:00-03:00" }));
    expect(filterTransactions(deleted, NO_TRANSACTION_FILTERS, lookups)).toEqual([]);
  });
});

describe("sorting (does not change the data)", () => {
  it("newest, oldest, amount and description", () => {
    const { txs } = sample();
    const before = JSON.stringify(txs);
    expect(sortTransactions(txs, "dateDesc")[0]!.date >= sortTransactions(txs, "dateDesc").at(-1)!.date).toBe(true);
    expect(sortTransactions(txs, "dateAsc")[0]!.date).toBe("2026-11-05");
    expect(sortTransactions(txs, "amountDesc")[0]!.amount).toBe(345_000_000);
    expect(sortTransactions(txs, "amountAsc")[0]!.amount).toBe(12_000);
    const names = sortTransactions(txs, "description").map((t) => t.description);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "es-AR", { sensitivity: "base" })));
    expect(JSON.stringify(txs)).toBe(before);
  });
});

describe("summary of what is listed (D4-14)", () => {
  it("per currency, completed only, transfers and cancelled never count", () => {
    const { txs } = sample();
    expect(summarizeTransactions(txs, "all")).toEqual([
      { currency: "ARS", income: money(345_000_000, "ARS"), expenses: money(4_231_000 + 1_814_000, "ARS"), net: money(345_000_000 - 6_045_000, "ARS") },
      { currency: "USD", income: money(12_000, "USD"), expenses: money(0, "USD"), net: money(12_000, "USD") },
    ]);
  });

  it("with the pending filter, pending movements are what is summed", () => {
    const { txs } = sample();
    const pending = txs.filter((t) => t.status === "pending");
    expect(summarizeTransactions(pending, "pending")[0]!.expenses).toEqual(money(500_000, "ARS"));
    expect(summarizeTransactions(pending, "all")).toEqual([]);
    expect(summarizeTransactions(txs.filter((t) => t.status === "cancelled"), "cancelled")).toEqual([]);
  });

  it("the base currency comes first", () => {
    const { txs } = sample();
    expect(summarizeTransactions(txs, "all", "USD").map((s) => s.currency)).toEqual(["USD", "ARS"]);
  });

  it("listed amounts: income +, expense −, transfer without sign", () => {
    const tx = (type: Transaction["type"]) => ({ ...sample().txs[0]!, type, amount: 100 }) as Transaction;
    expect(listedAmount(tx("income"))).toEqual({ amount: 100, sign: "explicit" });
    expect(listedAmount(tx("expense"))).toEqual({ amount: -100, sign: "explicit" });
    expect(listedAmount(tx("transfer"))).toEqual({ amount: 100, sign: "negative" });
  });
});
