import { describe, expect, it } from "vitest";
import { money } from "@/domain/money";
import { cardSchedule, daysBetween, nextMonthlyDate, summarizeCards } from "@/domain/rules/cards";
import { cardSchema, type Card } from "@/domain/schemas";
import { emptyCardForm, parseCardForm } from "@/features/cards/card-form";
import { validateDataFiles } from "@/services/data/dataset";
import { loadSampleFiles, sampleId as ID } from "../helpers/sample-data";

const sample = () => {
  const { dataSet } = validateDataFiles(loadSampleFiles());
  return { ...dataSet!, txs: Object.values(dataSet!.transactions).flat() };
};
const card = (over: Partial<Card>): Card => ({ ...sample().cards[0]!, ...over });

describe("statement dates", () => {
  it("clamps to the month's last day and rolls into next month", () => {
    expect(nextMonthlyDate(31, "2026-02-10")).toBe("2026-02-28");
    expect(nextMonthlyDate(29, "2028-02-01")).toBe("2028-02-29");
    expect(nextMonthlyDate(5, "2026-11-24")).toBe("2026-12-05");
    expect(nextMonthlyDate(24, "2026-11-24")).toBe("2026-11-24");
    expect(nextMonthlyDate(10, "2026-12-20")).toBe("2027-01-10");
    expect(daysBetween("2026-11-24", "2026-12-05")).toBe(11);
  });

  it("only credit cards have a schedule", () => {
    expect(cardSchedule(card({ closingDay: 20, dueDay: 28 }), "2026-11-24")).toEqual({ nextClosing: "2026-12-20", nextDue: "2026-11-28", daysToDue: 4 });
    expect(cardSchedule(card({ cardType: "debit", creditLimit: null, closingDay: null, dueDay: null }), "2026-11-24").nextDue).toBeNull();
  });
});

describe("card indicators (summarizeCards)", () => {
  it("committed per currency through the central rule; limit apart, never as money available", () => {
    const { cards, txs } = sample();
    const s = summarizeCards(cards, txs, { today: "2026-11-24" });
    expect(s.committed).toEqual([money(1_814_000, "ARS")]);
    const limit = cards[0]!.creditLimit;
    expect(s.creditLimits).toEqual(limit === null ? [] : [money(limit, "ARS")]);
    expect(s).not.toHaveProperty("available");
  });

  it("archived cards are not active and their limit is not counted", () => {
    const { cards, txs } = sample();
    const s = summarizeCards(cards.map((c) => ({ ...c, status: "inactive" as const })), txs, { today: "2026-11-24" });
    expect(s).toMatchObject({ active: 0, archived: 1, creditLimits: [], committed: [] });
  });

  it("lists active credit cards due within 7 days", () => {
    const c = card({ id: ID(50), closingDay: 20, dueDay: 28, status: "active" });
    const s = summarizeCards([c], [], { today: "2026-11-24" });
    expect(s.dueSoon).toEqual([{ card: c, dueDate: "2026-11-28", days: 4 }]);
    expect(summarizeCards([c], [], { today: "2026-11-01" }).dueSoon).toEqual([]);
  });
});

describe("prepaid cards (D3-01, schema 2.1.0)", () => {
  it("are valid without limit or statement days, and refuse them", () => {
    const base = card({ cardType: "prepaid", creditLimit: null, closingDay: null, dueDay: null });
    expect(cardSchema.safeParse(base).success).toBe(true);
    expect(cardSchema.safeParse({ ...base, creditLimit: 1000 }).success).toBe(false);
    expect(cardSchema.safeParse({ ...base, dueDay: 10 }).success).toBe(false);
  });
});

describe("sensitive data is never stored", () => {
  it("the schema refuses a full number, CVV, PIN or any extra field", () => {
    const c = card({});
    for (const extra of [{ cvv: "123" }, { pin: "1234" }, { cardNumber: "4111111111111111" }, { password: "x" }]) {
      expect(cardSchema.safeParse({ ...c, ...extra }).success).toBe(false);
    }
    expect(cardSchema.safeParse({ ...c, lastFourDigits: "12345" }).success).toBe(false);
    expect(cardSchema.safeParse({ ...c, name: "Visa 4111 1111 1111 1111" }).success).toBe(false);
  });
});

describe("card form", () => {
  const { accounts } = sample();
  const ars = accounts.find((a) => a.currency === "ARS")!;
  const valid = { ...emptyCardForm(ars.id), name: "EJEMPLO-FICTICIO Visa", lastFourDigits: "4417", creditLimit: "500.000", closingDay: "20", dueDay: "5" };

  it("builds a credit card with the account's currency", () => {
    expect(parseCardForm(valid, accounts)).toEqual({
      ok: true,
      input: expect.objectContaining({ cardType: "credit", currency: "ARS", accountId: ars.id, creditLimit: 50_000_000, closingDay: 20, dueDay: 5, lastFourDigits: "4417" }),
    });
    const usd = accounts.find((a) => a.currency === "USD")!;
    expect(parseCardForm({ ...valid, accountId: usd.id }, accounts)).toMatchObject({ ok: true, input: { currency: "USD" } });
  });

  it("debit and prepaid ignore limit and days", () => {
    for (const cardType of ["debit", "prepaid"] as const) {
      expect(parseCardForm({ ...valid, cardType, closingDay: "", dueDay: "99" }, accounts)).toMatchObject({ ok: true, input: { cardType, creditLimit: null, closingDay: null, dueDay: null } });
    }
  });

  it("rejects a missing or unknown account, bad last digits, invalid days and limits", () => {
    const r = parseCardForm({ ...valid, accountId: "", lastFourDigits: "12a4", closingDay: "32", dueDay: "", creditLimit: "1,234" }, accounts);
    expect(r).toEqual({
      ok: false,
      errors: {
        accountId: "Elige la cuenta desde la que se paga.",
        lastFourDigits: "Escribe exactamente 4 dígitos o deja el campo vacío.",
        closingDay: "Escribe un día entre 1 y 31.",
        dueDay: "Escribe un día entre 1 y 31.",
        creditLimit: "Usa como máximo 2 decimales.",
      },
    });
    expect(parseCardForm({ ...valid, accountId: ID(999) }, accounts)).toMatchObject({ ok: false, errors: { accountId: expect.any(String) } });
  });
});
