import {
  formatMoney,
  formatMoneyParts,
  NBSP,
  type CentsMode,
  type SignMode,
} from "@/lib/formatting/money";
import { cn } from "@/lib/utils/cn";
import type { MinorUnits } from "@/types/money";
import type { CurrencyCode } from "@/domain/currency";

export interface MoneyProps {
  amount: MinorUnits | number;
  cents?: CentsMode;
  sign?: SignMode;
  /** Marks values that need action (overdue, over budget) — alert-text. Never for ordinary expenses (P-16). */
  attention?: boolean;
  /** Currency of the amount; default ARS (symbol and minor digits per currency). */
  currency?: CurrencyCode;
  className?: string;
}

/**
 * The only way to render money (rule O-05): tabular numerals, U+2212 minus, cents in ink-2.
 * Income and expenses are both ink; colour is not a prop.
 */
export function Money({
  amount,
  cents = "always",
  sign = "negative",
  attention = false,
  currency,
  className,
}: MoneyProps) {
  const p = formatMoneyParts(amount, { cents, sign, currency });
  return (
    <span
      className={cn("num", attention && "text-alert-text", className)}
      aria-label={formatMoney(amount, { cents, sign, currency })}
    >
      <span aria-hidden="true">
        {p.sign}
        {p.symbol}
        {NBSP}
        {p.whole}
        {p.cents && (
          <span className={cn(!attention && "text-ink-2")}>{p.cents}</span>
        )}
      </span>
    </span>
  );
}
