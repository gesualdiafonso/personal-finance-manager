import type { CurrencyCode } from "../currency";
import type { Bill, Transaction } from "../schemas";
import { daysBetween } from "./cards";

/**
 * Bills (cuentas domésticas), Step 05. Everything here is derived and pure:
 *
 * - Payments are expense transactions with `billId` (D5-02). Cancelled and deleted payments
 *   do not count; pending and completed ones do.
 * - paid = sum of payments; remaining = amount − paid, never below zero.
 * - The stored status is pending | paid | cancelled. "Overdue" (pending, due before today) and
 *   "partial" (pending, with some payment) are computed against today's Buenos Aires date and
 *   never stored, so they cannot go stale (D5-03).
 *
 * Dates are calendar strings "YYYY-MM-DD"; `today` comes from toLocalDate (America/Argentina/
 * Buenos_Aires), never from the device's time zone.
 */

export type BillDisplayStatus = "pending" | "dueToday" | "overdue" | "paid" | "cancelled";

/** Live, non-cancelled payments of a bill, oldest first. */
export function billPayments(billId: string, transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .filter((t) => t.billId === billId && t.deletedAt === null && t.status !== "cancelled")
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
}

/** Every payment of the bill, cancelled ones included (history, D5-06). */
export function billPaymentHistory(billId: string, transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .filter((t) => t.billId === billId && t.deletedAt === null)
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
}

export interface BillBalance {
  paid: number;
  remaining: number;
  payments: number;
}

export function billBalance(bill: Pick<Bill, "id" | "amount">, transactions: readonly Transaction[]): BillBalance {
  const payments = billPayments(bill.id, transactions);
  const paid = payments.reduce((sum, t) => sum + t.amount, 0);
  return { paid, remaining: Math.max(0, bill.amount - paid), payments: payments.length };
}

/** The status the repository must store for these payments (D5-04): cancelled stays cancelled. */
export function expectedBillStatus(bill: Pick<Bill, "status" | "amount">, paid: number): Bill["status"] {
  if (bill.status === "cancelled") return "cancelled";
  return paid >= bill.amount ? "paid" : "pending";
}

export function billDisplayStatus(bill: Pick<Bill, "status" | "dueDate">, today: string): BillDisplayStatus {
  if (bill.status !== "pending") return bill.status;
  if (bill.dueDate < today) return "overdue";
  if (bill.dueDate === today) return "dueToday";
  return "pending";
}

export const isPartial = (bill: Pick<Bill, "status">, balance: BillBalance) => bill.status === "pending" && balance.paid > 0;

/** What can be done with a bill (the repository enforces the same rules). */
export const canEditBill = (bill: Pick<Bill, "status">) => bill.status === "pending";
export const canCancelBill = (bill: Pick<Bill, "status">) => bill.status === "pending";
/** Deleting is only for a mistake: a bill with payments (even cancelled ones) is cancelled instead (D5-07). */
export const canDeleteBill = (bill: Pick<Bill, "id">, transactions: readonly Transaction[]) => billPaymentHistory(bill.id, transactions).length === 0;

/* ------------------------------------------------------------------------------ */
/* Due-date groups (D5-13)                                                          */
/* ------------------------------------------------------------------------------ */

export const DUE_GROUPS = ["overdue", "today", "next7", "next30", "later"] as const;
export type DueGroup = (typeof DUE_GROUPS)[number];

export function dueGroup(dueDate: string, today: string): DueGroup {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  const days = daysBetween(today, dueDate);
  if (days <= 7) return "next7";
  if (days <= 30) return "next30";
  return "later";
}

/** Days from today to the due date (negative when overdue). */
export const daysUntilDue = (dueDate: string, today: string) => daysBetween(today, dueDate);

/* ------------------------------------------------------------------------------ */
/* Indicators (D5-14)                                                               */
/* ------------------------------------------------------------------------------ */

export interface BillCurrencyIndicators {
  currency: CurrencyCode;
  /** Remaining on every pending bill. */
  pending: number;
  /** Remaining on pending bills due before today. */
  overdue: number;
  /** Payments (non-cancelled) dated inside the period. */
  paidInPeriod: number;
  pendingCount: number;
  overdueCount: number;
}

export interface BillsIndicators {
  byCurrency: BillCurrencyIndicators[];
  pendingCount: number;
  overdueCount: number;
  dueTodayCount: number;
  /** Pending bills due today or later, earliest first (at most `upcomingLimit`). */
  upcoming: Bill[];
}

/**
 * Totals per currency — ARS and USD are never added together (D2-02). The base currency comes
 * first; a currency appears only when it has something to show.
 */
export function summarizeBills(
  bills: readonly Bill[],
  transactions: readonly Transaction[],
  options: { today: string; period: { from: string; to: string }; baseCurrency: CurrencyCode; upcomingLimit?: number },
): BillsIndicators {
  const { today, period, baseCurrency, upcomingLimit = 5 } = options;
  const live = bills.filter((b) => b.deletedAt === null);
  const rows = new Map<CurrencyCode, BillCurrencyIndicators>();
  const row = (currency: CurrencyCode) => {
    let r = rows.get(currency);
    if (!r) {
      r = { currency, pending: 0, overdue: 0, paidInPeriod: 0, pendingCount: 0, overdueCount: 0 };
      rows.set(currency, r);
    }
    return r;
  };
  let dueTodayCount = 0;
  for (const bill of live) {
    if (bill.status !== "pending") continue;
    const { remaining } = billBalance(bill, transactions);
    const r = row(bill.currency);
    r.pending += remaining;
    r.pendingCount++;
    if (bill.dueDate < today) {
      r.overdue += remaining;
      r.overdueCount++;
    }
    if (bill.dueDate === today) dueTodayCount++;
  }
  const billIds = new Set(live.map((b) => b.id));
  for (const t of transactions) {
    if (t.billId === null || !billIds.has(t.billId) || t.deletedAt !== null || t.status === "cancelled") continue;
    if (t.date < period.from || t.date > period.to) continue;
    row(t.currency).paidInPeriod += t.amount;
  }
  const byCurrency = [...rows.values()].sort((a, b) => (a.currency === baseCurrency ? -1 : b.currency === baseCurrency ? 1 : a.currency.localeCompare(b.currency)));
  const upcoming = live
    .filter((b) => b.status === "pending" && b.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, "es-AR"))
    .slice(0, upcomingLimit);
  return {
    byCurrency,
    pendingCount: byCurrency.reduce((n, r) => n + r.pendingCount, 0),
    overdueCount: byCurrency.reduce((n, r) => n + r.overdueCount, 0),
    dueTodayCount,
    upcoming,
  };
}

/** Pending bills first by due date; paid and cancelled ones by most recent due date. */
export function sortBills(bills: readonly Bill[]): Bill[] {
  return [...bills].sort((a, b) => {
    const pa = a.status === "pending" ? 0 : 1;
    const pb = b.status === "pending" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const byDate = pa === 0 ? a.dueDate.localeCompare(b.dueDate) : b.dueDate.localeCompare(a.dueDate);
    return byDate || a.name.localeCompare(b.name, "es-AR");
  });
}
