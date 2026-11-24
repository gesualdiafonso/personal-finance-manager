import { describe, expect, it } from "vitest";
import { money } from "@/domain/money";
import { summarizeAccounts } from "@/domain/rules/accounts";
import { accountSchema, type Account, type Transaction } from "@/domain/schemas";
import { parseCreateForm, parseEditForm, emptyAccountForm } from "@/features/accounts/account-form";
import { formatMoney, parseMoneyInput } from "@/lib/formatting/money";
import { validateDataFiles } from "@/services/data/dataset";
import { loadSampleFiles, sampleId as ID } from "../helpers/sample-data";

const sample = () => {
  const { dataSet } = validateDataFiles(loadSampleFiles());
  return { accounts: dataSet!.accounts, txs: Object.values(dataSet!.transactions).flat() };
};

describe("account form (Step 03 §7)", () => {
  const valid = { ...emptyAccountForm(), name: "EJEMPLO-FICTICIO Banco", initialBalance: "1.234,56" };

  it("creates a valid account input in integer cents", () => {
    const r = parseCreateForm(valid);
    expect(r).toEqual({ ok: true, input: expect.objectContaining({ name: "EJEMPLO-FICTICIO Banco", initialBalance: 123456, currency: "ARS", status: "active", institution: null }) });
  });

  it("rejects an empty name with a field message", () => {
    expect(parseCreateForm({ ...valid, name: "   " })).toEqual({ ok: false, errors: { name: "Escribe un nombre para la cuenta." } });
  });

  it("rejects an unsupported currency and type", () => {
    const r = parseCreateForm({ ...valid, currency: "EUR", accountType: "crypto" });
    expect(r.ok).toBe(false);
    expect(Object.keys((r as { errors: object }).errors).sort()).toEqual(["accountType", "currency"]);
  });

  it("rejects invalid money: letters, 3 decimals, too large, empty", () => {
    for (const [input, msg] of [
      ["12a", "Escribe un importe como 1.234,56."],
      ["1,234", "Usa como máximo 2 decimales."],
      ["99999999999999999999", "El importe es demasiado grande."],
      ["", "Escribe el saldo inicial (puede ser 0)."],
    ]) {
      expect(parseCreateForm({ ...valid, initialBalance: input! })).toEqual({ ok: false, errors: { initialBalance: msg } });
    }
  });

  it("accepts a negative initial balance (account starting overdrawn)", () => {
    expect(parseCreateForm({ ...valid, initialBalance: "−500,10" })).toMatchObject({ ok: true, input: { initialBalance: -50010 } });
    expect(parseMoneyInput("-500", {}).ok).toBe(false); // other amounts never take a sign
  });

  it("never accepts a card number in the name", () => {
    expect(parseCreateForm({ ...valid, name: "Visa 4111 1111 1111 1111" }).ok).toBe(false);
  });

  it("edit form has no initial balance (D3-04)", () => {
    const r = parseEditForm({ ...valid, status: "archived", initialBalance: "999" });
    expect(r).toMatchObject({ ok: true, patch: { status: "archived" } });
    expect((r as { patch: object }).patch).not.toHaveProperty("initialBalance");
  });

  it("formats USD with its own symbol", () => {
    expect(formatMoney(123456, { currency: "USD" })).toBe("US$\u00a01.234,56");
  });
});

describe("account indicators (summarizeAccounts)", () => {
  it("uses the central balance rule and keeps currencies apart", () => {
    const { accounts, txs } = sample();
    const s = summarizeAccounts(accounts, txs);
    expect(s.balances).toEqual([money(439_769_000 + 1_000_000, "ARS"), money(62_000, "USD")]);
    expect(s).toMatchObject({ active: 3, archived: 0, bank: 3, cash: 0 }); // checking + 2 savings (ARS, USD)
  });

  it("does not count archived accounts as active nor in the totals", () => {
    const { accounts, txs } = sample();
    const archived = accounts.map((a) => (a.id === ID(2) ? ({ ...a, status: "archived" } as Account) : a));
    const s = summarizeAccounts(archived, txs);
    expect(s).toMatchObject({ active: 2, archived: 1, bank: 2 });
    expect(s.balances[0]).toEqual(money(439_769_000, "ARS"));
    expect(s.byAccount.get(ID(2))).toEqual(money(1_000_000, "ARS")); // still visible in history
  });

  it("puts the base currency first and ignores deleted accounts", () => {
    const { accounts, txs } = sample();
    const usdOnly = accounts.map((a) => (a.currency === "ARS" ? { ...a, deletedAt: "2026-11-24T09:00:00-03:00" } : a));
    const s = summarizeAccounts(usdOnly, txs.filter((t: Transaction) => t.currency === "USD"), { baseCurrency: "USD" });
    expect(s.balances).toEqual([money(62_000, "USD")]);
    expect(s.active).toBe(1);
  });

  it("the account schema itself refuses decimals (domain, not only the form)", () => {
    const a = sample().accounts[0]!;
    expect(accountSchema.safeParse({ ...a, initialBalance: 10.5 }).success).toBe(false);
  });
});
