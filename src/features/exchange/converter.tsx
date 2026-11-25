"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { Money } from "@/components/shared/money";
import type { CurrencyCode } from "@/domain/currency";
import { compareRates, convertMinor, formatRate, parseRateInput } from "@/domain/fx";
import { MONEY_ERRORS } from "@/features/accounts/account-form";
import { parseMoneyInput } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import { suggestedRate, type ExchangeContext } from "./conversion";
import { formatInstant } from "./format";

const t = es.exchange;

/**
 * Settings → Moneda y cambio → Conversor: amount, currencies and rate are all editable and the
 * result follows on every keystroke. Prefills the active rate set's rate; a typed rate makes it
 * a custom estimate. Saves nothing.
 */
export function Converter({ ctx, currencies }: { ctx: ExchangeContext; currencies: CurrencyCode[] }) {
  const firstForeign = currencies.find((c) => c !== ctx.primary) ?? ctx.primary;
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState<CurrencyCode>(firstForeign);
  const [to, setTo] = useState<CurrencyCode>(ctx.primary);
  const initial = suggestedRate(ctx, firstForeign, ctx.primary);
  const [rateText, setRateText] = useState(initial ? formatRate(initial.rate, 10) : "");

  const suggestion = suggestedRate(ctx, from, to);
  const prefill = (f: CurrencyCode, tt: CurrencyCode) => {
    const s = suggestedRate(ctx, f, tt);
    setRateText(s ? formatRate(s.rate, 10) : "");
  };

  const parsedAmount = parseMoneyInput(amount, { currency: from });
  const same = from === to;
  const parsedRate = same ? null : parseRateInput(rateText);
  const result =
    parsedAmount.ok && (same || parsedRate?.ok)
      ? convertMinor(parsedAmount.value, from, to, same ? "1" : parsedRate?.ok ? parsedRate.rate : null)
      : null;
  const isSuggested = Boolean(suggestion && parsedRate?.ok && compareRates(parsedRate.rate, suggestion.rate) === 0);
  const modeLabel = same ? null : isSuggested && suggestion ? t.modes[suggestion.mode] : t.modes.custom;

  const rateError =
    !same && parsedRate && !parsedRate.ok && rateText !== ""
      ? t.errors[parsedRate.error === "zero" ? "rate-zero" : parsedRate.error === "too-many-decimals" ? "rate-decimals" : "rate-invalid"]
      : undefined;
  const amountError = !parsedAmount.ok && amount !== "" ? MONEY_ERRORS[parsedAmount.error as keyof typeof MONEY_ERRORS] : undefined;

  return (
    <div className="grid gap-4" data-testid="fx-converter">
      <div className="grid gap-4 tablet:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] tablet:items-end">
        <Field label={t.from}>
          {(p) => (
            <Select
              {...p}
              name="converterFrom"
              value={from}
              onChange={(e) => {
                const f = e.target.value as CurrencyCode;
                setFrom(f);
                prefill(f, to);
              }}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {es.common.currencies[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="max-tablet:justify-self-start"
          aria-label={t.swap}
          title={t.swap}
          onClick={() => {
            setFrom(to);
            setTo(from);
            prefill(to, from);
          }}
        >
          <ArrowLeftRight aria-hidden="true" className="size-4" />
        </Button>
        <Field label={t.to}>
          {(p) => (
            <Select
              {...p}
              name="converterTo"
              value={to}
              onChange={(e) => {
                const tt = e.target.value as CurrencyCode;
                setTo(tt);
                prefill(from, tt);
              }}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {es.common.currencies[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={`${t.amount} (${from})`} error={amountError}>
          {(p) => <MoneyInput {...p} name="converterAmount" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field
          label={t.rate}
          error={rateError}
          help={same ? t.sameCurrency : !suggestion && rateText === "" ? t.noRate(from, to) : t.rateHelp(from, to)}
        >
          {(p) => (
            <Input
              {...p}
              name="converterRate"
              inputMode="decimal"
              autoComplete="off"
              className="num text-right"
              disabled={same}
              value={same ? "1" : rateText}
              onChange={(e) => setRateText(e.target.value)}
              placeholder={t.quotePlaceholder}
            />
          )}
        </Field>
      </div>
      <div
        aria-live="polite"
        className="flex flex-wrap items-baseline justify-between gap-3 rounded-sm bg-paper-2 px-4 py-3"
        data-testid="fx-converter-result"
      >
        <span className="type-label text-ink-2">
          {t.result}
          {modeLabel && ` · ${t.estimate} (${modeLabel})`}
        </span>
        <span className="type-amount-lg text-ink">{result?.ok ? <Money amount={result.amount} currency={to} /> : "—"}</span>
      </div>
      {!same && suggestion && (
        <div className="flex flex-wrap items-center justify-between gap-2 type-caption text-ink-2">
          <span>
            {formatRate(suggestion.rate)} {to}/{from} · {t.sources[suggestion.source]} · {t.updated(formatInstant(suggestion.updatedAt))}
          </span>
          {!isSuggested && (
            <Button type="button" variant="ghost" onClick={() => prefill(from, to)}>
              {t.useSuggested}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
