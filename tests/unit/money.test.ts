import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyCompact, formatMoneyParts, MINUS, NBSP, parseMoneyInput } from "@/lib/formatting/money";
import { addMinor, MoneyError, subtractMinor, sumMinor, toMinorUnits } from "@/types/money";

const $ = (s: string) => s.replaceAll(" ", NBSP);

describe("formatMoney (ARS, es-AR)", () => {
  it("formats the Design System reference values", () => {
    expect(formatMoney(481234056)).toBe($("$ 4.812.340,56"));
    expect(formatMoney(126258000, { cents: "auto" })).toBe($("$ 1.262.580"));
    expect(formatMoney(-4830000)).toBe(`${MINUS}${$("$ 48.300,00")}`);
    expect(formatMoney(345000000, { sign: "explicit", cents: "auto" })).toBe($("+$ 3.450.000"));
  });

  it("uses U+2212 for negatives and a no-break space after the symbol", () => {
    const text = formatMoney(-1);
    expect(text.startsWith("−")).toBe(true);
    expect(text).not.toContain("-");
    expect(text).toContain("$ ");
  });

  it("never signs zero", () => {
    expect(formatMoney(0, { sign: "explicit" })).toBe($("$ 0,00"));
    expect(formatMoney(0, { cents: "auto" })).toBe($("$ 0"));
    expect(formatMoney(-49, { cents: "never" })).toBe($("$ 0"));
  });

  it("handles the cents modes", () => {
    expect(formatMoney(4231000, { cents: "always" })).toBe($("$ 42.310,00"));
    expect(formatMoney(4231000, { cents: "auto" })).toBe($("$ 42.310"));
    expect(formatMoney(4231005, { cents: "auto" })).toBe($("$ 42.310,05"));
    expect(formatMoney(4231050, { cents: "never" })).toBe($("$ 42.311"));
    expect(formatMoney(4231049, { cents: "never" })).toBe($("$ 42.310"));
  });

  it("splits parts for the Money component", () => {
    expect(formatMoneyParts(481234056)).toEqual({ sign: "", symbol: "$", whole: "4.812.340", cents: ",56" });
  });

  it("is exact at the edge of the safe integer range", () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER)).toBe($("$ 90.071.992.547.409,91"));
  });

  it("rejects non-integer amounts (floating point is never authoritative)", () => {
    expect(() => formatMoney(42310.5)).toThrow(MoneyError);
    expect(() => formatMoney(Number.NaN)).toThrow(MoneyError);
    expect(() => formatMoney(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError);
  });
});

describe("ARS monetary precision", () => {
  it("adds without floating-point drift", () => {
    // 0.1 + 0.2 pesos, in centavos
    expect(addMinor(toMinorUnits(10), toMinorUnits(20))).toBe(30);
    const many = Array.from({ length: 1000 }, () => toMinorUnits(1)); // 1000 × $ 0,01
    expect(sumMinor(many)).toBe(1000);
    expect(formatMoney(sumMinor(many))).toBe($("$ 10,00"));
  });

  it("matches the Dashboard reference arithmetic", () => {
    expect(subtractMinor(toMinorUnits(345000000), toMinorUnits(218742000))).toBe(126258000);
  });

  it("refuses sums beyond the safe range", () => {
    expect(() => sumMinor([toMinorUnits(Number.MAX_SAFE_INTEGER), toMinorUnits(1)])).toThrow(MoneyError);
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234", 123400],
    ["$ 1.234", 123400],
    ["18.450", 1845000],
    ["0,5", 50],
    ["0,05", 5],
    ["007", 700],
  ])("parses %s", (input, expected) => {
    expect(parseMoneyInput(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ["", "empty"],
    ["-100", "invalid"],
    ["12,345", "too-many-decimals"],
    ["abc", "invalid"],
    ["1,2,3", "invalid"],
    ["999999999999999999", "out-of-range"],
  ])("rejects %s", (input, error) => {
    expect(parseMoneyInput(input)).toEqual({ ok: false, error });
  });
});

describe("formatMoneyCompact (chart axes only)", () => {
  it("abbreviates millions and thousands", () => {
    expect(formatMoneyCompact(213000000)).toBe($("2,1 M"));
    expect(formatMoneyCompact(250000000)).toBe($("2,5 M"));
    expect(formatMoneyCompact(31200000)).toBe($("312 mil"));
    expect(formatMoneyCompact(50000)).toBe("500");
    expect(formatMoneyCompact(-213000000)).toBe(`${MINUS}${$("2,1 M")}`);
  });
});
