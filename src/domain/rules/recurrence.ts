import type { Recurrence } from "../schemas";

/**
 * nextOccurrence is DERIVED (D2-10). Occurrences are anchored on startDate:
 *   daily · weekly · biweekly   every 1 · 7 · 14 days
 *   monthly · quarterly · semiannual   every 1 · 3 · 6 months, same day of month; clamped to
 *       the last day of shorter months (31 → 30 → 28/29)
 *   yearly  same day; 29 February → 28 February in non-leap years
 * Pure calendar arithmetic on "YYYY-MM-DD" strings in UTC: no device clock or time zone (I-07).
 */
function parts(date: string): [number, number, number] {
  return date.split("-").map(Number) as [number, number, number];
}
function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const DAY_STEP: Partial<Record<Recurrence["frequency"], number>> = { daily: 1, weekly: 7, biweekly: 14 };
const MONTH_STEP: Partial<Record<Recurrence["frequency"], number>> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * The n-th occurrence (n = 0 is startDate), always computed from startDate and never from the
 * previous occurrence (D5-11): a recurrence on the 31st falls on 30/04 and back on 31/05.
 */
export function occurrenceAt(r: Pick<Recurrence, "startDate" | "frequency">, n: number): string {
  const days = DAY_STEP[r.frequency];
  if (days !== undefined) return addDays(r.startDate, n * days);
  const [y, m, d] = parts(r.startDate);
  const index = m - 1 + n * MONTH_STEP[r.frequency]!;
  const yy = y + Math.floor(index / 12);
  const mm = (index % 12) + 1;
  return fmt(yy, mm, Math.min(d, daysInMonth(yy, mm)));
}

/** Index of an occurrence a little before `date`, so long-running recurrences need few steps. */
function indexNear(r: Pick<Recurrence, "startDate" | "frequency">, date: string): number {
  if (date <= r.startDate) return 0;
  const [ty, tm, td] = parts(date);
  const [sy, sm, sd] = parts(r.startDate);
  const days = DAY_STEP[r.frequency];
  if (days !== undefined) return Math.max(0, Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / 86_400_000 / days) - 1);
  return Math.max(0, Math.floor(((ty - sy) * 12 + (tm - sm)) / MONTH_STEP[r.frequency]!) - 1);
}

/** Whether the recurrence can still produce occurrences (not paused, cancelled or deleted). */
export function isRecurrenceRunning(r: Recurrence): boolean {
  return r.isActive && (r.cancelledAt ?? null) === null && r.deletedAt === null;
}

/**
 * Occurrence dates in [from, to] (inclusive), in order, at most `limit`. Ignores the active
 * flag: callers decide whether a paused recurrence counts. Stops at endDate.
 */
export function occurrencesBetween(r: Pick<Recurrence, "startDate" | "frequency" | "endDate">, from: string, to: string, limit = 1000): string[] {
  const out: string[] = [];
  for (let n = indexNear(r, from), guard = 0; guard < 100_000 && out.length < limit; n++, guard++) {
    const date = occurrenceAt(r, n);
    if (date > to || (r.endDate !== null && date > r.endDate)) break;
    if (date >= from) out.push(date);
  }
  return out;
}

/** First occurrence on or after `today`, or null when paused, cancelled, deleted or past endDate. */
export function nextOccurrence(r: Recurrence, today: string): string | null {
  if (!isRecurrenceRunning(r)) return null;
  for (let n = indexNear(r, today), guard = 0; guard < 1000; n++, guard++) {
    const date = occurrenceAt(r, n);
    if (r.endDate !== null && date > r.endDate) return null;
    if (date >= today) return date;
  }
  return null;
}

/** The next `count` occurrences on or after `today` (for the recurrence detail). */
export function upcomingOccurrences(r: Recurrence, today: string, count: number): string[] {
  if (!isRecurrenceRunning(r)) return [];
  return occurrencesBetween(r, today, "9999-12-31", count);
}
