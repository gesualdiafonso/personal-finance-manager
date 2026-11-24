import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "@/lib/config/app";
import {
  asLocalDate,
  formatDate,
  formatMonthTitle,
  formatRelativeDay,
  isLocalDate,
  TIME_ZONE,
  toIsoWithOffset,
  toLocalDate,
  toLocalMonth,
} from "@/lib/formatting/date";

describe("timezone configuration", () => {
  it("is America/Argentina/Buenos_Aires", () => {
    expect(APP_CONFIG.timeZone).toBe("America/Argentina/Buenos_Aires");
    expect(TIME_ZONE).toBe(APP_CONFIG.timeZone);
  });

  it("does not depend on the device time zone (tests run in Asia/Tokyo)", () => {
    expect(process.env.TZ).toBe("Asia/Tokyo");
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Tokyo");
    // 2026-11-24 02:00 UTC is still 23 Nov in Buenos Aires (and already 24 Nov in Tokyo).
    expect(toLocalDate(new Date("2026-11-24T02:00:00Z"))).toBe("2026-11-23");
    expect(toLocalDate(new Date("2026-11-24T03:00:00Z"))).toBe("2026-11-24");
  });

  it("puts a transaction near midnight in the Buenos Aires month", () => {
    expect(toLocalMonth(new Date("2026-12-01T02:59:59Z"))).toBe("2026-11");
    expect(toLocalMonth(new Date("2026-12-01T03:00:00Z"))).toBe("2026-12");
  });

  it("writes instants with the -03:00 offset", () => {
    expect(toIsoWithOffset(new Date("2026-11-24T09:10:00Z"))).toBe("2026-11-24T06:10:00-03:00");
  });
});

describe("date formatting (es-AR)", () => {
  const d = asLocalDate("2026-11-23");

  it("formats long, short and form styles", () => {
    expect(formatDate(d, "long")).toBe("lunes, 23 de noviembre");
    expect(formatDate(d, "short")).toBe("23 nov");
    expect(formatDate(d, "form")).toBe("23/11/2026");
  });

  it("capitalises the month title", () => {
    expect(formatMonthTitle(d)).toBe("Noviembre");
  });

  it("uses relative words up to 7 days, then absolute dates", () => {
    expect(formatRelativeDay(asLocalDate("2026-11-23"), d)).toBe("hoy");
    expect(formatRelativeDay(asLocalDate("2026-11-24"), d)).toBe("mañana");
    expect(formatRelativeDay(asLocalDate("2026-11-22"), d)).toBe("ayer");
    expect(formatRelativeDay(asLocalDate("2026-11-27"), d)).toBe("viernes");
    expect(formatRelativeDay(asLocalDate("2026-12-05"), d)).toBe("5 dic");
  });

  it("validates calendar dates", () => {
    expect(isLocalDate("2026-02-28")).toBe(true);
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(() => asLocalDate("23/11/2026")).toThrow(RangeError);
  });
});
