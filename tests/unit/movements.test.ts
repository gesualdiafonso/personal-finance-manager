import { describe, expect, it } from "vitest";
import { money } from "@/domain/money";
import { filterMovements, movementPeriods, movementsOfAccount, movementsOfCard, NO_FILTERS } from "@/features/movements/movements";
import { validateDataFiles } from "@/services/data/dataset";
import { loadSampleFiles, sampleId as ID } from "../helpers/sample-data";

const sample = () => {
  const { dataSet } = validateDataFiles(loadSampleFiles());
  return { ...dataSet!, txs: Object.values(dataSet!.transactions).flat() };
};

describe("account movements", () => {
  it("signs each movement from the account's point of view", () => {
    const { txs, accounts, categories } = sample();
    const a = movementsOfAccount(ID(1), txs, accounts, categories);
    const transferOut = a.find((m) => m.tx.type === "transfer")!;
    expect(transferOut.signed).toEqual(money(-1_000_000, "ARS"));
    expect(transferOut.counterpart?.id).toBe(ID(2));
    expect(a.find((m) => m.tx.type === "income" && m.tx.currency === "ARS")!.signed.amount).toBe(345_000_000);
    expect(a.find((m) => m.viaCard)!.signed.amount).toBe(-1_814_000);
    const b = movementsOfAccount(ID(2), txs, accounts, categories);
    expect(b).toHaveLength(1);
    expect(b[0]!.signed).toEqual(money(1_000_000, "ARS")); // transfer in
  });

  it("is newest first and ignores deleted records", () => {
    const { txs, accounts, categories } = sample();
    const list = movementsOfAccount(ID(1), txs, accounts, categories);
    expect(list.map((m) => m.tx.date)).toEqual([...list.map((m) => m.tx.date)].sort().reverse());
    const deleted = txs.map((t) => ({ ...t, deletedAt: "2026-11-24T09:00:00-03:00" }));
    expect(movementsOfAccount(ID(1), deleted, accounts, categories)).toEqual([]);
  });
});

describe("card movements and filters", () => {
  it("lists the card's purchases", () => {
    const { txs, categories } = sample();
    const c = movementsOfCard(ID(6), txs, categories);
    expect(c).toHaveLength(1);
    expect(c[0]!.category?.id).toBe(ID(16));
  });

  it("filters by period, type and status", () => {
    const { txs, accounts, categories } = sample();
    const all = movementsOfAccount(ID(1), txs, accounts, categories);
    expect(filterMovements(all, NO_FILTERS)).toHaveLength(all.length);
    expect(filterMovements(all, { ...NO_FILTERS, type: "transfer" }).map((m) => m.tx.type)).toEqual(["transfer"]);
    expect(filterMovements(all, { ...NO_FILTERS, status: "pending" })).toHaveLength(1);
    expect(filterMovements(all, { ...NO_FILTERS, status: "cancelled" })).toHaveLength(1);
    expect(filterMovements(all, { ...NO_FILTERS, period: "2026-10" })).toEqual([]);
    expect(movementPeriods(all)).toEqual(["2026-11"]);
  });
});
