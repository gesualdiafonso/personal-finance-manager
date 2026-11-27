import { APP_CONFIG } from "@/lib/config/app";

/**
 * Dates follow two rules (docs/design-system/tipografia.md §5, data invariant I-06):
 * 1. A financial date is a calendar date in Buenos Aires ("YYYY-MM-DD"), never an instant.
 * 2. Instants are converted to calendar dates in America/Argentina/Buenos_Aires,
 *    whatever the device time zone is.
 */
export const TIME_ZONE = APP_CONFIG.timeZone;

/** A calendar date "YYYY-MM-DD" in the Buenos Aires time zone. */
export type LocalDate = string & { readonly __localDate: true };

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: string): value is LocalDate {
  const m = LOCAL_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

export function asLocalDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new RangeError(`Invalid calendar date: ${value}`);
  return value;
}

const isoDateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date of an instant in Buenos Aires. 2026-11-24T02:00Z → "2026-11-23". */
export function toLocalDate(instant: Date): LocalDate {
  const parts = Object.fromEntries(isoDateParts.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}` as LocalDate;
}

/** "YYYY-MM" of an instant in Buenos Aires. */
export function toLocalMonth(instant: Date): string {
  return toLocalDate(instant).slice(0, 7);
}

const offsetFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" });
const wallClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** ISO 8601 with the Buenos Aires offset, for createdAt/updatedAt: "2026-11-24T06:10:00-03:00". */
export function toIsoWithOffset(instant: Date): string {
  const p = Object.fromEntries(wallClock.formatToParts(instant).map((x) => [x.type, x.value]));
  const offsetName = offsetFormatter.formatToParts(instant).find((x) => x.type === "timeZoneName")?.value ?? "GMT";
  const offset = offsetName === "GMT" ? "+00:00" : offsetName.replace("GMT", "");
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

/** Calendar dates are formatted in UTC so the calendar day never shifts. */
function calendarDate(date: LocalDate): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

const longFormat = new Intl.DateTimeFormat(APP_CONFIG.locale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const shortFormat = new Intl.DateTimeFormat(APP_CONFIG.locale, { timeZone: "UTC", day: "numeric", month: "short" });
const weekdayFormat = new Intl.DateTimeFormat(APP_CONFIG.locale, { timeZone: "UTC", weekday: "long" });
const monthFormat = new Intl.DateTimeFormat(APP_CONFIG.locale, { timeZone: "UTC", month: "long" });
const formFormat = new Intl.DateTimeFormat(APP_CONFIG.locale, { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

export type DateStyle = "long" | "short" | "form";

/**
 * Numeric date format chosen in the user's profile ("dd/MM/yyyy" by default, or ISO
 * "yyyy-MM-dd"). Set by the auth provider when the profile loads or changes; applies to every
 * date shown as digits ("form" style) in every module.
 */
let numericDateFormat: "dd/MM/yyyy" | "yyyy-MM-dd" = "dd/MM/yyyy";
export function setNumericDateFormat(format: "dd/MM/yyyy" | "yyyy-MM-dd"): void {
  numericDateFormat = format;
}

/** "lunes, 23 de noviembre" · "23 nov" · "23/11/2026" (or "2026-11-23" with the ISO format) */
export function formatDate(date: LocalDate, style: DateStyle = "short"): string {
  const d = calendarDate(date);
  if (style === "long") return longFormat.format(d);
  if (style === "form") return numericDateFormat === "yyyy-MM-dd" ? date : formFormat.format(d);
  return shortFormat.format(d).replace(/\.$/, "");
}

/** Month name for page titles, capitalised: "Noviembre". */
export function formatMonthTitle(date: LocalDate): string {
  const name = monthFormat.format(calendarDate(date));
  return name.charAt(0).toLocaleUpperCase(APP_CONFIG.locale) + name.slice(1);
}

function dayDifference(a: LocalDate, b: LocalDate): number {
  return Math.round((calendarDate(a).getTime() - calendarDate(b).getTime()) / 86_400_000);
}

/** Relative wording up to 7 days, absolute afterwards (tipografia.md §5). */
export function formatRelativeDay(date: LocalDate, today: LocalDate): string {
  const diff = dayDifference(date, today);
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  if (diff > 1 && diff < 7) return weekdayFormat.format(calendarDate(date));
  return formatDate(date, "short");
}
