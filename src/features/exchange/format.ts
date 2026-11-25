import { APP_CONFIG } from "@/lib/config/app";

/** "24/11/26, 14:05" in the app's time zone — when a quotation was taken. */
export function formatInstant(iso: string, timeZone: string = APP_CONFIG.timeZone): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(APP_CONFIG.locale, { dateStyle: "short", timeStyle: "short", timeZone }).format(date);
}
