"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { Money } from "@/components/shared/money";
import type { CurrencyCode } from "@/domain/currency";
import { activeRateSet, formatRate, type ConversionSnapshot } from "@/domain/fx";
import { parseMoneyInput } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import { planConversion, suggestedRate, type ExchangeContext, type RateChoice } from "./conversion";
import { formatInstant } from "./format";

const t = es.exchange;

/**
 * Estimate in the primary currency for a movement in another currency. Live: it recalculates
 * as the amount or the rate changes. The original amount is what is saved as the movement's
 * amount; this estimate is stored next to it with its rate and never recalculated later.
 */
export function ConversionPanel({
  amountText,
  from,
  ctx,
  choice,
  customRate,
  stored,
  editing,
  error,
  onChoice,
  onCustomRate,
}: {
  amountText: string;
  from: CurrencyCode;
  ctx: ExchangeContext;
  choice: RateChoice;
  customRate: string;
  stored?: ConversionSnapshot;
  editing: boolean;
  error?: string;
  onChoice: (choice: RateChoice) => void;
  onCustomRate: (value: string) => void;
}) {
  if (from === ctx.primary) return null;
  const parsed = parseMoneyInput(amountText, { currency: from });
  const amount = parsed.ok && parsed.value > 0 ? parsed.value : null;
  const suggested = suggestedRate(ctx, from);
  const set = activeRateSet(ctx.exchange);
  const plan = planConversion({ amount, from, ctx, choice, customRate, stored, now: new Date() });
  const storedUsable = stored && stored.from === from && stored.to === ctx.primary;

  return (
    <fieldset className="grid gap-3 rounded-sm border border-line bg-paper-2 p-3" data-testid="conversion-panel">
      <legend className="px-1 type-label text-ink-2">{t.txTitle(ctx.primary)}</legend>
      <Field label={t.txChoice}>
        {(p) => (
          <Select {...p} name="rateChoice" value={choice} onChange={(e) => onChoice(e.target.value as RateChoice)}>
            {storedUsable && <option value="stored">{t.txChoices.stored(formatRate(stored.rate), formatInstant(stored.rateAt))}</option>}
            {editing && !stored && <option value="none">{t.txChoices.none}</option>}
            <option value="current">
              {suggested ? t.txChoices.current(`${set.name} · ${formatRate(suggested.rate)}`) : t.txChoices.currentMissing}
            </option>
            <option value="custom">{t.txChoices.custom}</option>
          </Select>
        )}
      </Field>
      {choice === "custom" && (
        <Field label={t.txCustomRate(from, ctx.primary)} error={error} help={t.rateHelp(from, ctx.primary)}>
          {(p) => (
            <Input
              {...p}
              name="customRate"
              inputMode="decimal"
              autoComplete="off"
              className="num text-right"
              value={customRate}
              onChange={(e) => onCustomRate(e.target.value)}
              placeholder="1.450,00"
            />
          )}
        </Field>
      )}
      <div aria-live="polite" className="grid gap-1" data-testid="conversion-result">
        {plan.kind === "ok" && (
          <>
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="type-body-sm text-ink-2">
                {t.estimate} · {formatRate(plan.snapshot.rate)} {ctx.primary}/{from}
              </span>
              <span className="type-body font-semibold text-ink">
                ≈ <Money amount={plan.snapshot.converted} currency={ctx.primary} />
              </span>
            </p>
            {plan.fellBack && <p className="type-caption text-warning-text">{t.fellBack}</p>}
          </>
        )}
        {plan.kind === "no-rate" && <p className="type-body-sm text-ink-2">{t.txNoRate(from)}</p>}
        {plan.kind !== "not-needed" && <p className="type-caption text-ink-3">{t.txNote}</p>}
      </div>
    </fieldset>
  );
}
