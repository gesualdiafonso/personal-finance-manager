import { AppError } from "@/lib/errors/app-error";
import { type MinorUnits, MoneyError, toMinorUnits } from "@/types/money";
import { type CurrencyCode, isCurrencyCode } from "./currency";

/**
 * A monetary value always carries its currency (Step 02 §5). The amount is an integer in
 * minor units (centavos). There is no floating-point arithmetic and no conversion between
 * currencies: mixing currencies throws CURRENCY_MISMATCH.
 *
 *   ARS 4.812.340,56 → { amount: 481234056, currency: "ARS" }
 */
export interface Money {
  readonly amount: MinorUnits;
  readonly currency: CurrencyCode;
}

export function money(amount: number, currency: CurrencyCode): Money {
  if (!isCurrencyCode(currency)) throw new MoneyError(`Unsupported currency ${String(currency)}`);
  return Object.freeze({ amount: toMinorUnits(amount), currency });
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new AppError("CURRENCY_MISMATCH", `Cannot combine ${a.currency} with ${b.currency}: no conversion rules are defined`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function negateMoney(a: Money): Money {
  return money(a.amount === 0 ? 0 : -a.amount, a.currency);
}

/** Sums values of ONE currency. An empty list needs the currency explicitly. */
export function sumMoney(values: Iterable<Money>, currency: CurrencyCode): Money {
  let total = zero(currency);
  for (const v of values) total = addMoney(total, v);
  return total;
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
}

export function equalsMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

/** Groups totals by currency — the only way to "total" values of several currencies. */
export function totalsByCurrency(values: Iterable<Money>): Map<CurrencyCode, Money> {
  const out = new Map<CurrencyCode, Money>();
  for (const v of values) out.set(v.currency, addMoney(out.get(v.currency) ?? zero(v.currency), v));
  return out;
}
