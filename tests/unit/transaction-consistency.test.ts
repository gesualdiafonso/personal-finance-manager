import { describe, expect, it } from "vitest";
import { money } from "@/domain/money";
import { cardTypesOf, deriveAccountBalance } from "@/domain/rules/balances";
import { reconcileAccount } from "@/domain/rules/reconciliation";
import { canCancel, canDelete, editableFields, editImpact } from "@/domain/rules/transactions";
import type { Account, Transaction } from "@/domain/schemas";
import { validateDataFiles } from "@/services/data/dataset";
import { loadSampleFiles, sampleId as ID } from "../helpers/sample-data";

const sample = () => {
  const { dataSet } = validateDataFiles(loadSampleFiles());
  return { ...dataSet!, txs: Object.values(dataSet!.transactions).flat() };
};

describe("reconciliation (D4-17)", () => {
  it("rebuilds the balance as a breakdown that matches the derivation", () => {
    const { accounts, cards, txs } = sample();
    const r = reconcileAccount(accounts.find((a) => a.id === ID(1))!, txs, cardTypesOf(cards));
    expect(r).toMatchObject({
      initial: money(100_000_000, "ARS"),
      income: money(345_000_000, "ARS"),
      expenses: money(4_231_000, "ARS"), // the credit-card purchase is excluded (D4-08)
      transfersIn: money(0, "ARS"),
      transfersOut: money(1_000_000, "ARS"),
      rebuilt: money(439_769_000, "ARS"),
      derived: money(439_769_000, "ARS"),
      matches: true,
      excluded: { pending: 1, cancelled: 1, creditCardPurchases: 1 },
    });
    const b = reconcileAccount(accounts.find((a) => a.id === ID(2))!, txs, cardTypesOf(cards));
    expect(b).toMatchObject({ transfersIn: money(1_000_000, "ARS"), rebuilt: money(1_000_000, "ARS"), matches: true });
  });

  it("reports a movement in another currency instead of mixing it", () => {
    const { accounts, txs } = sample();
    const broken = txs.map((t) => (t.id === ID(11) ? ({ ...t, currency: "USD" } as Transaction) : t));
    const r = reconcileAccount(accounts.find((a) => a.id === ID(1))!, broken);
    expect(r.matches).toBe(false);
    expect(r.currencyProblems).toEqual([ID(11)]);
  });
});

describe("edit impact through the central derivation (§6.6)", () => {
  const { accounts, cards, txs } = sample();
  const derive = (a: Account, list: readonly Transaction[]) => deriveAccountBalance(a, list, { cardTypes: cardTypesOf(cards) });
  const expense = txs.find((t) => t.id === ID(11))!; // completed expense, 42.310,00 on account 1

  it("new amount: only that account changes", () => {
    expect(editImpact(expense, { ...expense, amount: 5_000_000 }, accounts, txs, derive)).toEqual([
      { accountId: ID(1), before: money(439_769_000, "ARS"), after: money(439_000_000, "ARS") },
    ]);
  });

  it("new account: the old one goes up, the new one goes down", () => {
    const impact = editImpact(expense, { ...expense, accountId: ID(2) }, accounts, txs, derive);
    expect(impact).toEqual([
      { accountId: ID(1), before: money(439_769_000, "ARS"), after: money(444_000_000, "ARS") },
      { accountId: ID(2), before: money(1_000_000, "ARS"), after: money(-3_231_000, "ARS") },
    ]);
  });

  it("completed → pending or cancelled reverts its effect; a new date or category alone changes nothing", () => {
    expect(editImpact(expense, { ...expense, status: "cancelled" }, accounts, txs, derive)[0]!.after).toEqual(money(444_000_000, "ARS"));
    expect(editImpact(expense, { ...expense, status: "pending" }, accounts, txs, derive)[0]!.after).toEqual(money(444_000_000, "ARS"));
    expect(editImpact(expense, { ...expense, date: "2026-11-01" as never, categoryId: ID(5) }, accounts, txs, derive)).toEqual([]);
  });

  it("a transfer: both accounts", () => {
    const transfer = txs.find((t) => t.type === "transfer")!;
    expect(editImpact(transfer, { ...transfer, amount: 2_000_000 }, accounts, txs, derive).map((i) => i.accountId)).toEqual([ID(1), ID(2)]);
  });
});

describe("cancel / delete / edit policy (D4-01, D4-03, D4-04)", () => {
  const base = { status: "completed" as const, deletedAt: null };
  it("completed: cancel yes, delete no; pending: both; cancelled: delete only, notes only", () => {
    expect([canCancel(base), canDelete(base)]).toEqual([true, false]);
    expect([canCancel({ ...base, status: "pending" }), canDelete({ ...base, status: "pending" })]).toEqual([true, true]);
    expect([canCancel({ ...base, status: "cancelled" }), canDelete({ ...base, status: "cancelled" })]).toEqual([false, true]);
    expect(editableFields({ status: "cancelled" })).toEqual(["notes"]);
    expect(editableFields({ status: "completed" })).not.toContain("type");
  });
});
