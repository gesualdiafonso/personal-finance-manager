"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatMonthTitle, toLocalDate, type LocalDate } from "@/lib/formatting/date";

const noop = () => () => {};

/**
 * Today's calendar date in Buenos Aires, read on the client only. Pages are prerendered,
 * so "today" cannot be baked in at build time; on the server it is null.
 */
export function useToday(): LocalDate | null {
  return useSyncExternalStore(noop, () => toLocalDate(new Date()), () => null);
}

/** "lunes, 23 de noviembre" — label above the Dashboard title. */
export function TodayLabel() {
  const today = useToday();
  return <span suppressHydrationWarning>{today ? formatDate(today, "long") : " "}</span>;
}

/** "Noviembre" — the Dashboard title is the current month (dashboard.md). */
export function CurrentMonthTitle() {
  const today = useToday();
  return <span suppressHydrationWarning>{today ? formatMonthTitle(today) : " "}</span>;
}
