"use client";

import type { CurrencyCode } from "@/domain/currency";
import { defaultExchangeSettings, enabledCurrencies } from "@/domain/fx";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { useLocalQuery } from "@/hooks/use-local-data";
import { es } from "@/lib/i18n/es";
import { getFinancialSettings } from "@/services/storage/local-store";

/** Currencies enabled in Settings → Moneda y cambio (primary first). */
export function useEnabledCurrencies(): CurrencyCode[] {
  const q = useLocalQuery(async (db) => (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS, []);
  const settings = q.status === "ready" ? q.data : DEFAULT_FINANCIAL_SETTINGS;
  return enabledCurrencies(settings.exchange ?? defaultExchangeSettings(settings.baseCurrency), settings.baseCurrency);
}

/**
 * <option>s for a currency <select>: the enabled currencies, plus the current value when it was
 * disabled later (a record keeps its currency). `short` shows only the ISO code.
 */
export function CurrencyOptions({ value, short = false }: { value?: string; short?: boolean }) {
  const enabled = useEnabledCurrencies();
  const list = value && !enabled.includes(value as CurrencyCode) && value in es.common.currencies ? [...enabled, value as CurrencyCode] : enabled;
  return (
    <>
      {list.map((c) => (
        <option key={c} value={c}>
          {short ? c : es.common.currencies[c]}
        </option>
      ))}
    </>
  );
}
