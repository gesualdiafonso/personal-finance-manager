import { describe, expect, it } from "vitest";
import { money } from "@/domain/money";
import { balanceEffect, cardTypesOf, committedOnCards, deriveAccountBalance, incomeAndExpenses } from "@/domain/rules/balances";
import type { Account, Card, Category, Transaction } from "@/domain/schemas";
import type { TransactionFormData } from "@/features/transactions/form-data";
import { emptyTransactionForm, parseTransactionForm } from "@/features/transactions/transaction-form";
import { validateDataFiles } from "@/services/data/dataset";
import { loadSampleFiles, sampleId as ID } from "../helpers/sample-data";

const sample = () => {
  const { dataSet } = validateDataFiles(loadSampleFiles());
  return { ...dataSet!, txs: Object.values(dataSet!.transactions).flat() };
};

function formData(): TransactionFormData {
  const { accounts, cards, categories } = sample();
  const opt = (type: Category["type"]) => categories.filter((c) => c.type === type).map((c) => ({ category: c, label: c.name }));
  return { accounts, cards, categories: { income: opt("income"), expense: opt("expense") } };
}

const base = { ...emptyTransactionForm("2026-11-24", ID(1)), description: "EJEMPLO-FICTICIO", amount: "1.234,56" };

describe("transaction form (Step 04 §7)", () => {
  it("income and expense: positive cents, currency from the account, category of the same type", () => {
    const d = formData();
    expect(parseTransactionForm({ ...base, type: "income", categoryId: ID(4) }, d)).toMatchObject({
      ok: true,
      input: { type: "income", amount: 123456, currency: "ARS", accountId: ID(1), categoryId: ID(4), destinationAccountId: null, cardId: null, status: "completed" },
    });
    expect(parseTransactionForm({ ...base, accountId: ID(15) }, d)).toMatchObject({ ok: true, input: { currency: "USD" } });
  });

  it("an expense with a card uses the card's paying account", () => {
    expect(parseTransactionForm({ ...base, accountId: ID(2), cardId: ID(6) }, formData())).toMatchObject({ ok: true, input: { accountId: ID(1), cardId: ID(6) } });
  });

  it("transfer: one record with destination, no category; same account and cross-currency refused", () => {
    const d = formData();
    expect(parseTransactionForm({ ...base, type: "transfer", destinationAccountId: ID(2), categoryId: ID(3) }, d)).toMatchObject({
      ok: true,
      input: { type: "transfer", destinationAccountId: ID(2), categoryId: null, cardId: null },
    });
    expect(parseTransactionForm({ ...base, type: "transfer", destinationAccountId: ID(1) }, d)).toEqual({ ok: false, errors: { destinationAccountId: "El origen y el destino tienen que ser cuentas distintas." } });
    expect(parseTransactionForm({ ...base, type: "transfer", destinationAccountId: ID(15) }, d)).toMatchObject({ ok: false, errors: { destinationAccountId: expect.stringContaining("monedas distintas") } });
    expect(parseTransactionForm({ ...base, type: "transfer", destinationAccountId: "" }, d)).toMatchObject({ ok: false, errors: { destinationAccountId: "Elige la cuenta de destino." } });
  });

  it("refuses invalid amounts, empty description, card numbers, bad dates, unknown accounts and wrong categories", () => {
    const d = formData();
    const errs = (v: Partial<typeof base>) => (parseTransactionForm({ ...base, ...v }, d) as { errors: object }).errors;
    expect(errs({ amount: "0" })).toEqual({ amount: "El importe tiene que ser mayor que 0." });
    expect(errs({ amount: "-5" })).toEqual({ amount: "Escribe un importe como 1.234,56." });
    expect(errs({ amount: "1,234" })).toEqual({ amount: "Usa como máximo 2 decimales." });
    expect(errs({ description: "  " })).toEqual({ description: "Escribe una descripción." });
    expect(errs({ notes: "4111 1111 1111 1111" })).toEqual({ notes: "No escribas números de tarjeta." });
    expect(errs({ date: "2026-02-30" })).toEqual({ date: "Elige una fecha válida." });
    expect(errs({ accountId: ID(999) })).toEqual({ accountId: "Elige una cuenta activa." });
    expect(errs({ type: "expense", categoryId: ID(4) })).toEqual({ categoryId: "Elige una categoría del mismo tipo que el movimiento." });
    expect(errs({ cardId: ID(999) })).toMatchObject({ cardId: "Elige una tarjeta activa." });
  });
});

describe("card purchases in balances (OD-8, D4-08)", () => {
  const account = { ...sample().accounts[0]!, initialBalance: 100_000 } as Account;
  const purchase = { ...sample().txs.find((t) => t.cardId)!, amount: 10_000, status: "completed" } as Transaction;
  const cardAs = (cardType: Card["cardType"]) => new Map([[purchase.cardId!, cardType]]);

  it("debit and prepaid: an ordinary expense of the paying account on the purchase date", () => {
    for (const type of ["debit", "prepaid"] as const) {
      expect(balanceEffect(purchase, account.id, cardAs(type))).toEqual(money(-10_000, "ARS"));
      expect(deriveAccountBalance(account, [purchase], { cardTypes: cardAs(type) })).toEqual(money(90_000, "ARS"));
    }
  });

  it("credit, or a card of unknown type: no effect on the account (committed instead)", () => {
    expect(deriveAccountBalance(account, [purchase], { cardTypes: cardAs("credit") })).toEqual(money(100_000, "ARS"));
    expect(deriveAccountBalance(account, [purchase])).toEqual(money(100_000, "ARS"));
  });

  it("committed only counts credit cards", () => {
    const card = sample().cards[0]!;
    expect(committedOnCards([card], [purchase]).get(card.id)).toEqual(money(10_000, "ARS"));
    expect(committedOnCards([{ ...card, cardType: "debit", creditLimit: null, closingDay: null, dueDay: null }], [purchase]).get(card.id)).toEqual(money(0, "ARS"));
    expect(cardTypesOf([card]).get(card.id)).toBe("credit");
  });

  it("income/expense totals still count every purchase once, and never transfers", () => {
    const { txs } = sample();
    const r = incomeAndExpenses(txs, { from: "2026-11-01", to: "2026-11-30" });
    expect(r.expenses.get("ARS")).toEqual(money(4_231_000 + 1_814_000, "ARS"));
  });
});
