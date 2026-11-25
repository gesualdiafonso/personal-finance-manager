import { describe, expect, it } from "vitest";
import {
  billBalance,
  billDisplayStatus,
  billPaymentHistory,
  canDeleteBill,
  dueGroup,
  expectedBillStatus,
  isPartial,
  sortBills,
  summarizeBills,
} from "@/domain/rules/bills";
import { isRecurrenceRunning, nextOccurrence, occurrenceAt, occurrencesBetween, upcomingOccurrences } from "@/domain/rules/recurrence";
import { billSchema, recurrenceSchema, SCHEMA_VERSION, type Bill, type Recurrence, type Transaction } from "@/domain/schemas";

/** Bills and recurrence calendar rules (Step 05). Fictitious data only (EJEMPLO-FICTICIO). */
const id = (n: number) => `0193c8a0-${n.toString(16).padStart(4, "0")}-7000-8000-${n.toString(16).padStart(12, "0")}`;
const control = (n: number) => ({ id: id(n), rev: 1, createdAt: "2026-11-01T10:00:00-03:00", updatedAt: "2026-11-01T10:00:00-03:00", deletedAt: null, deviceId: "test" });

/** Dates are plain strings here; the schemas brand them as LocalDate. */
type Loose<T> = { [K in keyof T]?: unknown };

const bill = (over: Loose<Bill> = {}): Bill => ({
  ...control(1),
  name: "EJEMPLO-FICTICIO Luz",
  categoryId: null,
  amount: 1_000_000,
  currency: "ARS",
  dueDate: "2026-11-30",
  accountId: null,
  status: "pending",
  notes: null,
  ...over,
}) as Bill;
const payment = (n: number, over: Loose<Transaction> = {}): Transaction => ({
  ...control(100 + n),
  type: "expense",
  description: "EJEMPLO-FICTICIO Pago",
  amount: 250_000,
  currency: "ARS",
  categoryId: null,
  accountId: id(50),
  destinationAccountId: null,
  cardId: null,
  date: "2026-11-10",
  status: "completed",
  notes: null,
  billId: id(1),
  recurrenceId: null,
  ...over,
}) as Transaction;
const recurrence = (over: Loose<Recurrence> = {}): Recurrence => ({
  ...control(9),
  description: "EJEMPLO-FICTICIO Alquiler",
  amount: 30_000_000,
  currency: "ARS",
  type: "expense",
  frequency: "monthly",
  startDate: "2026-01-31",
  endDate: null,
  categoryId: null,
  accountId: id(50),
  isActive: true,
  ...over,
}) as Recurrence;

describe("schema 2.2.0+ (D5-01, additive)", () => {
  it("is the current version", () => expect(SCHEMA_VERSION).toBe("2.4.0"));

  it("reads a 2.1 bill and recurrence without the new fields", () => {
    expect(billSchema.safeParse(bill()).success).toBe(true);
    expect(recurrenceSchema.safeParse(recurrence()).success).toBe(true);
  });

  it("accepts the new bill fields and requires occurrenceDate with recurrenceId", () => {
    expect(billSchema.safeParse(bill({ description: "Período octubre", recurrenceId: id(9), occurrenceDate: "2026-11-30" })).success).toBe(true);
    expect(billSchema.safeParse(bill({ recurrenceId: id(9), occurrenceDate: null })).success).toBe(false);
    expect(billSchema.safeParse(bill({ description: "tarjeta 4111 1111 1111 1111" })).success).toBe(false);
  });

  it("accepts the new frequencies; a cancelled recurrence cannot be active", () => {
    for (const frequency of ["daily", "weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"] as const) {
      expect(recurrenceSchema.safeParse(recurrence({ frequency })).success).toBe(true);
    }
    expect(recurrenceSchema.safeParse(recurrence({ frequency: "hourly" as never })).success).toBe(false);
    expect(recurrenceSchema.safeParse(recurrence({ cancelledAt: "2026-11-24T10:00:00-03:00", isActive: true })).success).toBe(false);
    expect(recurrenceSchema.safeParse(recurrence({ cancelledAt: "2026-11-24T10:00:00-03:00", isActive: false })).success).toBe(true);
  });
});

describe("paid and remaining (D5-02)", () => {
  it("sums live, non-cancelled payments of this bill only", () => {
    const txs = [
      payment(1),
      payment(2, { amount: 100_000, status: "pending" }),
      payment(3, { status: "cancelled" }),
      payment(4, { deletedAt: "2026-11-11T10:00:00-03:00" }),
      payment(5, { billId: id(2) }),
    ];
    expect(billBalance(bill(), txs)).toEqual({ paid: 350_000, remaining: 650_000, payments: 2 });
    expect(billPaymentHistory(id(1), txs).map((t) => t.status)).toEqual(["completed", "pending", "cancelled"]);
  });

  it("never goes below zero", () => {
    expect(billBalance(bill(), [payment(1, { amount: 1_200_000 })]).remaining).toBe(0);
  });

  it("expected stored status follows the payments; cancelled stays cancelled", () => {
    expect(expectedBillStatus(bill(), 999_999)).toBe("pending");
    expect(expectedBillStatus(bill(), 1_000_000)).toBe("paid");
    expect(expectedBillStatus(bill({ status: "paid" }), 0)).toBe("pending");
    expect(expectedBillStatus(bill({ status: "cancelled" }), 1_000_000)).toBe("cancelled");
  });

  it("partial only for a pending bill with some payment", () => {
    expect(isPartial(bill(), billBalance(bill(), [payment(1)]))).toBe(true);
    expect(isPartial(bill(), billBalance(bill(), []))).toBe(false);
    expect(isPartial(bill({ status: "cancelled" }), billBalance(bill(), [payment(1)]))).toBe(false);
  });

  it("can be deleted only without any payment, cancelled ones included", () => {
    expect(canDeleteBill(bill(), [])).toBe(true);
    expect(canDeleteBill(bill(), [payment(1, { status: "cancelled" })])).toBe(false);
  });
});

describe("derived status and due groups (D5-03, D5-13)", () => {
  const today = "2026-11-24";
  it("overdue and due today are derived from today's date, never stored", () => {
    expect(billDisplayStatus(bill({ dueDate: "2026-11-23" }), today)).toBe("overdue");
    expect(billDisplayStatus(bill({ dueDate: today }), today)).toBe("dueToday");
    expect(billDisplayStatus(bill({ dueDate: "2026-11-25" }), today)).toBe("pending");
    expect(billDisplayStatus(bill({ dueDate: "2026-11-01", status: "paid" }), today)).toBe("paid");
    expect(billDisplayStatus(bill({ dueDate: "2026-11-01", status: "cancelled" }), today)).toBe("cancelled");
    // The next day the same record is overdue: nothing to update.
    expect(billDisplayStatus(bill({ dueDate: today }), "2026-11-25")).toBe("overdue");
  });

  it("groups by distance to the due date, across month and year ends", () => {
    expect(dueGroup("2026-11-23", today)).toBe("overdue");
    expect(dueGroup(today, today)).toBe("today");
    expect(dueGroup("2026-12-01", today)).toBe("next7");
    expect(dueGroup("2026-12-02", today)).toBe("next30");
    expect(dueGroup("2026-12-24", today)).toBe("next30");
    expect(dueGroup("2026-12-25", today)).toBe("later");
    expect(dueGroup("2027-01-02", "2026-12-31")).toBe("next7");
  });

  it("sorts pending by due date first, then closed bills newest first", () => {
    const rows = sortBills([
      bill({ ...control(1), name: "c", status: "paid", dueDate: "2026-10-01" }),
      bill({ ...control(2), name: "b", dueDate: "2026-12-01" }),
      bill({ ...control(3), name: "a", dueDate: "2026-11-01" }),
      bill({ ...control(4), name: "d", status: "cancelled", dueDate: "2026-11-15" }),
    ]);
    expect(rows.map((b) => b.name)).toEqual(["a", "b", "d", "c"]);
  });
});

describe("indicators per currency (D5-14)", () => {
  it("never adds ARS and USD; overdue, pending and paid in the period", () => {
    const bills = [
      bill({ ...control(1), dueDate: "2026-11-20" }), // overdue, 250.000 paid
      bill({ ...control(2), dueDate: "2026-11-24", amount: 500_000 }), // today
      bill({ ...control(3), dueDate: "2026-12-10", amount: 10_000, currency: "USD" }),
      bill({ ...control(4), status: "cancelled", amount: 7_000_000 }),
      bill({ ...control(5), status: "paid", amount: 300_000, dueDate: "2026-11-05" }),
    ];
    const txs = [
      payment(1, { billId: id(1), date: "2026-11-10" }),
      payment(2, { billId: id(5), amount: 300_000, date: "2026-10-31" }), // previous month
      payment(3, { billId: id(5), amount: 1, date: "2026-11-01", status: "cancelled" }),
    ];
    const s = summarizeBills(bills, txs, { today: "2026-11-24", period: { from: "2026-11-01", to: "2026-11-30" }, baseCurrency: "ARS" });
    expect(s.byCurrency).toEqual([
      { currency: "ARS", pending: 750_000 + 500_000, overdue: 750_000, paidInPeriod: 250_000, pendingCount: 2, overdueCount: 1 },
      { currency: "USD", pending: 10_000, overdue: 0, paidInPeriod: 0, pendingCount: 1, overdueCount: 0 },
    ]);
    expect(s).toMatchObject({ pendingCount: 3, overdueCount: 1, dueTodayCount: 1 });
    expect(s.upcoming.map((b) => b.id)).toEqual([id(2), id(3)]);
  });

  it("is empty with no bills", () => {
    expect(summarizeBills([], [], { today: "2026-11-24", period: { from: "2026-11-01", to: "2026-11-30" }, baseCurrency: "ARS" })).toEqual({
      byCurrency: [],
      pendingCount: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      upcoming: [],
    });
  });
});

describe("recurrence calendar (D5-11)", () => {
  it("day 31 falls on the last day of shorter months and comes back", () => {
    const r = recurrence({ startDate: "2026-01-31" });
    expect([0, 1, 2, 3, 4].map((n) => occurrenceAt(r, n))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(occurrenceAt(recurrence({ startDate: "2028-01-31" }), 1)).toBe("2028-02-29"); // leap year
  });

  it("daily, biweekly (14 days), quarterly and semiannual", () => {
    expect(occurrenceAt(recurrence({ frequency: "daily", startDate: "2026-12-31" }), 1)).toBe("2027-01-01");
    expect(occurrenceAt(recurrence({ frequency: "biweekly", startDate: "2026-11-24" }), 2)).toBe("2026-12-22");
    expect([1, 2, 3].map((n) => occurrenceAt(recurrence({ frequency: "quarterly", startDate: "2026-11-30" }), n))).toEqual(["2027-02-28", "2027-05-30", "2027-08-30"]);
    expect(occurrenceAt(recurrence({ frequency: "semiannual", startDate: "2026-08-31" }), 1)).toBe("2027-02-28");
    expect(occurrenceAt(recurrence({ frequency: "yearly", startDate: "2028-02-29" }), 1)).toBe("2029-02-28");
  });

  it("lists occurrences in a range, stopping at endDate", () => {
    const r = recurrence({ startDate: "2026-01-31", endDate: "2026-06-15" });
    expect(occurrencesBetween(r, "2026-03-01", "2026-12-31")).toEqual(["2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(occurrencesBetween(recurrence({ frequency: "weekly", startDate: "2020-01-06" }), "2026-11-24", "2026-12-08")).toEqual(["2026-11-30", "2026-12-07"]);
  });

  it("paused, cancelled or deleted recurrences have no next occurrence", () => {
    expect(nextOccurrence(recurrence(), "2026-11-24")).toBe("2026-11-30");
    expect(upcomingOccurrences(recurrence(), "2026-11-24", 3)).toEqual(["2026-11-30", "2026-12-31", "2027-01-31"]);
    expect(nextOccurrence(recurrence({ isActive: false }), "2026-11-24")).toBeNull();
    expect(isRecurrenceRunning(recurrence({ isActive: false, cancelledAt: "2026-11-24T10:00:00-03:00" }))).toBe(false);
    expect(nextOccurrence(recurrence({ deletedAt: "2026-11-24T10:00:00-03:00" }), "2026-11-24")).toBeNull();
  });
});
