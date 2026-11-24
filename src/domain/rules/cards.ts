import type { CurrencyCode } from "../currency";
import { totalsByCurrency, type Money } from "../money";
import type { Card, Transaction } from "../schemas";
import { committedOnCards } from "./balances";

/**
 * Card indicators (Step 03 §9, §13). Derived from stored records only:
 * - statement dates come from closingDay / dueDay, clamped to the month's last day
 *   (31 → 30 → 28/29), pure calendar arithmetic on "YYYY-MM-DD" (no device clock or zone);
 * - "committed" is the central D2-11 rule (committedOnCards);
 * - a credit LIMIT is never money available, and "available credit" is not computed:
 *   it depends on how payments and statements work, which is open decision OD-8.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** First date on or after `today` that falls on `day` of its month (clamped to month end). */
export function nextMonthlyDate(day: number, today: string): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const thisMonth = Math.min(day, daysIn(y, m));
  if (thisMonth >= d) return `${y}-${pad(m)}-${pad(thisMonth)}`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(day, daysIn(ny, nm)))}`;
}

export function daysBetween(from: string, to: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(to) - t(from)) / 86_400_000);
}

export interface CardSchedule {
  nextClosing: string | null;
  nextDue: string | null;
  daysToDue: number | null;
}

export function cardSchedule(card: Card, today: string): CardSchedule {
  if (
    card.cardType !== "credit" ||
    card.closingDay === null ||
    card.dueDay === null
  )
    return { nextClosing: null, nextDue: null, daysToDue: null };
  const nextDue = nextMonthlyDate(card.dueDay, today);
  return {
    nextClosing: nextMonthlyDate(card.closingDay, today),
    nextDue,
    daysToDue: daysBetween(today, nextDue),
  };
}

export interface CardsSummary {
  active: number;
  archived: number;
  /** Sum of credit limits of ACTIVE credit cards, per currency (a limit, never a balance). */
  creditLimits: Money[];
  /** Card purchases not cancelled, ACTIVE cards, per currency (D2-11). */
  committed: Money[];
  /** Per card (live cards). */
  committedByCard: Map<string, Money>;
  /** Active credit cards whose next due date is within `soonDays` (inclusive). */
  dueSoon: { card: Card; dueDate: string; days: number }[];
}

const sortByCurrency = (base: CurrencyCode) => (a: Money, b: Money) =>
  a.currency === base
    ? -1
    : b.currency === base
      ? 1
      : a.currency.localeCompare(b.currency);

export function summarizeCards(
  cards: readonly Card[],
  transactions: readonly Transaction[],
  options: { today: string; soonDays?: number; baseCurrency?: CurrencyCode },
): CardsSummary {
  const live = cards.filter((c) => c.deletedAt === null);
  const active = live.filter((c) => c.status === "active");
  const committedByCard = committedOnCards(live, transactions);
  const order = sortByCurrency(options.baseCurrency ?? "ARS");
  const limits = active
    .filter((c) => c.cardType === "credit" && c.creditLimit !== null)
    .map((c) => ({ amount: c.creditLimit!, currency: c.currency }) as Money);
  const soonDays = options.soonDays ?? 7;
  const dueSoon = active
    .map((card) => ({ card, s: cardSchedule(card, options.today) }))
    .filter(({ s }) => s.daysToDue !== null && s.daysToDue <= soonDays)
    .map(({ card, s }) => ({ card, dueDate: s.nextDue!, days: s.daysToDue! }))
    .sort((a, b) => a.days - b.days);
  return {
    active: active.length,
    archived: live.length - active.length,
    creditLimits: [...totalsByCurrency(limits).values()].sort(order),
    committed: [
      ...totalsByCurrency(
        active.map((c) => committedByCard.get(c.id)!),
      ).values(),
    ].sort(order),
    committedByCard,
    dueSoon,
  };
}
