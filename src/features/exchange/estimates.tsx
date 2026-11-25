import { Money } from "@/components/shared/money";
import type { CurrencyCode } from "@/domain/currency";
import { formatRate, type ConvertedTotal } from "@/domain/fx";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { formatInstant } from "./format";

const t = es.exchange;

/** "≈ $ 145.000,00": an approximate equivalent, always marked as such (never a balance). */
export function ApproxMoney({ amount, currency, className }: { amount: number; currency: CurrencyCode; className?: string }) {
  return (
    <span className={cn("type-caption text-ink-2", className)} data-testid="approx-money" title={t.equivalent}>
      ≈ <Money amount={amount} currency={currency} cents="auto" />
    </span>
  );
}

/**
 * Consolidated estimate in the primary currency: total, which rates were used (and when) and
 * which currencies were left out for lack of a rate. Rendered only when another currency is
 * involved — a single-currency total is exact and shown as is.
 */
export function ConsolidatedEstimate({ total, className }: { total: ConvertedTotal; className?: string }) {
  if (!total.estimated && total.missing.length === 0) return null;
  const rates = Object.entries(total.rates) as [CurrencyCode, NonNullable<ConvertedTotal["rates"][CurrencyCode]>][];
  return (
    <div className={cn("grid gap-1", className)} data-testid="consolidated-estimate">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="type-label text-ink-2">{t.consolidated(total.currency)}</span>
        <span className="type-amount-lg text-ink">
          ≈ <Money amount={total.total} currency={total.currency} cents="auto" />
        </span>
      </p>
      {rates.length > 0 && (
        <p className="type-caption text-ink-2" data-testid="consolidated-rates">
          {t.ratesUsed}:{" "}
          {rates
            .map(([code, r]) => `${code} ${formatRate(r.rate)} (${t.modes[r.mode]}, ${formatInstant(r.updatedAt)})`)
            .join(" · ")}
        </p>
      )}
      {total.missing.length > 0 && <p className="type-caption text-warning-text">{t.missingRates(total.missing.join(", "))}</p>}
      <p className="type-caption text-ink-3">{t.consolidatedHint}</p>
    </div>
  );
}
