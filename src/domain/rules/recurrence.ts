import type { Recurrence } from "../schemas";

/**
 * nextOccurrence is DERIVED (D2-10). Occurrences are anchored on startDate:
 *   weekly  every 7 days
 *   monthly same day of month; clamped to the last day of shorter months (31 → 30 → 28/29)
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

/** The n-th occurrence (n = 0 is startDate). */
export function occurrenceAt(r: Pick<Recurrence, "startDate" | "frequency">, n: number): string {
  const [y, m, d] = parts(r.startDate);
  if (r.frequency === "weekly") {
    const t = Date.UTC(y, m - 1, d) + n * 7 * 86_400_000;
    const dt = new Date(t);
    return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  if (r.frequency === "monthly") {
    const index = m - 1 + n;
    const yy = y + Math.floor(index / 12);
    const mm = (index % 12) + 1;
    return fmt(yy, mm, Math.min(d, daysInMonth(yy, mm)));
  }
  const yy = y + n;
  return fmt(yy, m, Math.min(d, daysInMonth(yy, m)));
}

/** First occurrence on or after `today`, or null when inactive, deleted or past endDate. */
export function nextOccurrence(r: Recurrence, today: string): string | null {
  if (!r.isActive || r.deletedAt !== null) return null;
  let n = 0;
  // Jump close to today for long-running recurrences, then step.
  if (today > r.startDate) {
    const [ty, tm] = parts(today);
    const [sy, sm] = parts(r.startDate);
    if (r.frequency === "monthly") n = Math.max(0, (ty - sy) * 12 + (tm - sm) - 1);
    if (r.frequency === "yearly") n = Math.max(0, ty - sy - 1);
    if (r.frequency === "weekly") {
      const days = (Date.UTC(ty, tm - 1, parts(today)[2]) - Date.UTC(sy, sm - 1, parts(r.startDate)[2])) / 86_400_000;
      n = Math.max(0, Math.floor(days / 7) - 1);
    }
  }
  for (let guard = 0; guard < 1000; guard++, n++) {
    const date = occurrenceAt(r, n);
    if (r.endDate !== null && date > r.endDate) return null;
    if (date >= today) return date;
  }
  return null;
}
