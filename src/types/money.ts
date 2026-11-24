/**
 * Monetary amounts are integers in minor units (centavos). Floating point is never the
 * authoritative representation of money (Step 01, §3; data invariant I-01).
 */
declare const minorUnitsBrand: unique symbol;
export type MinorUnits = number & { readonly [minorUnitsBrand]: true };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Accepts only safe integers. 4231000 → $ 42.310,00 */
export function toMinorUnits(value: number): MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Amount must be a safe integer in minor units, received ${String(value)}`);
  }
  return value as MinorUnits;
}

export function isMinorUnits(value: unknown): value is MinorUnits {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function addMinor(a: MinorUnits, b: MinorUnits): MinorUnits {
  return toMinorUnits(a + b);
}

export function subtractMinor(a: MinorUnits, b: MinorUnits): MinorUnits {
  return toMinorUnits(a - b);
}

export function sumMinor(values: Iterable<MinorUnits>): MinorUnits {
  let total = 0;
  for (const v of values) {
    total += v;
    if (!Number.isSafeInteger(total)) throw new MoneyError("Sum exceeds the safe integer range");
  }
  return total as MinorUnits;
}

export const ZERO = 0 as MinorUnits;
