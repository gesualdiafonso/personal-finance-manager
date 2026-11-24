import type {
  CurrencySummary,
  TransactionFilters,
} from "@/domain/rules/transactions";
import { Money } from "@/components/shared/money";
import { es } from "@/lib/i18n/es";

const t = es.transactions.list;

/**
 * Totals of what is listed, one line per currency (never added together). An editorial row
 * of figures separated by hairlines — not KPI cards (P-05, P-13).
 */
export function TransactionsSummary({
  totals,
  status,
}: {
  totals: CurrencySummary[];
  status: TransactionFilters["status"];
}) {
  const note =
    status === "pending"
      ? t.summaryNotePending
      : status === "cancelled"
        ? t.summaryNoteCancelled
        : t.summaryNote;
  return (
    <section
      aria-label={t.summaryLabel}
      className="mb-8"
      data-testid="transactions-summary"
    >
      {totals.length === 0 ? (
        <p className="type-body-sm text-ink-2">{t.noTotals}</p>
      ) : (
        <dl className="grid gap-3">
          {totals.map((s) => (
            <div
              key={s.currency}
              data-testid={`summary-${s.currency}`}
              className="flex flex-wrap gap-x-8 gap-y-2 border-b border-line pb-3"
            >
              {(
                [
                  [t.income, s.income.amount, "explicit"],
                  [t.expenses, -s.expenses.amount, "explicit"],
                  [t.net, s.net.amount, "explicit"],
                ] as const
              ).map(([label, amount, sign]) => (
                <div key={label}>
                  <dt className="type-label text-ink-2">
                    {label} · {s.currency}
                  </dt>
                  <dd className="mt-1 type-amount-lg">
                    <Money
                      amount={amount}
                      currency={s.currency}
                      sign={sign}
                      cents="auto"
                    />
                  </dd>
                </div>
              ))}
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2 type-caption text-ink-2">{note}</p>
    </section>
  );
}
