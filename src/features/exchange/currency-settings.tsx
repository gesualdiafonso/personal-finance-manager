"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeedbackProvider, useFeedback } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { CURRENCY_CODES, type CurrencyCode } from "@/domain/currency";
import {
  compareRates,
  enabledCurrencies,
  exchangeSettingsSchema,
  formatRate,
  parseRateInput,
  RATE_SET_KINDS,
  type ExchangeSettings,
  type Quote,
  type RateSet,
  type RateSetKind,
} from "@/domain/fx";
import type { FinancialSettings } from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { getLocalDb, notifyDataChanged, useLocalQuery } from "@/hooks/use-local-data";
import { toIsoWithOffset } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { refreshFromProvider, providerSupports } from "@/services/fx/dolarapi";
import { getFinancialSettings, saveFinancialSettings } from "@/services/storage/local-store";
import { exchangeContextOf } from "./conversion";
import { Converter } from "./converter";
import { formatInstant } from "./format";

const t = es.exchange;

interface SetDraft {
  set: RateSet;
  /** Manual quote per currency as typed (es-AR). */
  manualText: Partial<Record<CurrencyCode, string>>;
}
interface Draft {
  primary: CurrencyCode;
  enabled: CurrencyCode[];
  defaultMode: ExchangeSettings["defaultMode"];
  activeId: string;
  providerEnabled: boolean;
  sets: SetDraft[];
}

function toDraft(settings: FinancialSettings): Draft {
  const { primary, exchange } = exchangeContextOf(settings);
  return {
    primary,
    enabled: enabledCurrencies(exchange, primary),
    defaultMode: exchange.defaultMode,
    activeId: exchange.activeRateSetId,
    providerEnabled: exchange.providerEnabled,
    sets: exchange.rateSets.map((set) => ({
      set,
      manualText: Object.fromEntries(Object.entries(set.manual).map(([c, q]) => [c, q ? formatRate(q.rate, 10) : ""])),
    })),
  };
}

type DraftErrors = Record<string, string>;

/** Draft → settings; a quote keeps its date unless its rate changed (no invented history). */
export function draftToSettings(draft: Draft, base: FinancialSettings, now: Date): { settings: FinancialSettings } | { errors: DraftErrors } {
  const errors: DraftErrors = {};
  const rateSets: RateSet[] = draft.sets.map(({ set, manualText }) => {
    const manual: RateSet["manual"] = {};
    for (const [code, text] of Object.entries(manualText) as [CurrencyCode, string][]) {
      if (code === set.base || text.trim() === "") continue;
      const parsed = parseRateInput(text);
      if (!parsed.ok) {
        errors[`${set.id}:${code}`] =
          t.errors[parsed.error === "zero" ? "rate-zero" : parsed.error === "too-many-decimals" ? "rate-decimals" : parsed.error === "empty" ? "rate-empty" : "rate-invalid"];
        continue;
      }
      const previous = set.manual[code];
      manual[code] =
        previous && compareRates(previous.rate, parsed.rate) === 0
          ? previous
          : ({ rate: parsed.rate, updatedAt: toIsoWithOffset(now), source: "manual" } satisfies Quote);
    }
    return { ...set, manual };
  });
  if (Object.keys(errors).length > 0) return { errors };
  const exchange: ExchangeSettings = {
    enabledCurrencies: [draft.primary, ...draft.enabled.filter((c) => c !== draft.primary)],
    defaultMode: draft.defaultMode,
    activeRateSetId: draft.activeId,
    rateSets,
    providerEnabled: draft.providerEnabled,
  };
  const check = exchangeSettingsSchema.safeParse(exchange);
  if (!check.success) return { errors: { form: t.saveFailed } };
  return { settings: { ...base, baseCurrency: draft.primary, exchange: check.data } };
}

function slug(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "cotizacion";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

/**
 * Settings → Moneda y cambio. Everything is local (IndexedDB) and reaches the official data
 * only through an export. Changing rates never touches saved movements (D-FX-05).
 */
export function CurrencySettings() {
  const query = useLocalQuery(async (db) => (await getFinancialSettings(db)) ?? DEFAULT_FINANCIAL_SETTINGS, []);
  return (
    <section aria-labelledby="moneda-cambio" className="grid gap-4 border-t border-line py-6 desktop:grid-cols-12 desktop:gap-6" data-testid="currency-settings">
      <div className="desktop:col-span-4">
        <h2 id="moneda-cambio" className="type-heading">
          {t.title}
        </h2>
        <p className="type-body-sm text-ink-2">{t.hint}</p>
      </div>
      <div className="grid min-w-0 gap-8 desktop:col-span-8">
        <FeedbackProvider>
          {query.status === "ready" ? <CurrencySettingsForm key={JSON.stringify(query.data)} settings={query.data} /> : <p className="type-body-sm text-ink-2">…</p>}
        </FeedbackProvider>
      </div>
    </section>
  );
}

function CurrencySettingsForm({ settings }: { settings: FinancialSettings }) {
  const feedback = useFeedback();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState<RateSet | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ctx = exchangeContextOf(settings);
  const savedCurrencies = enabledCurrencies(ctx.exchange, ctx.primary);
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setNotice(null);
  };
  const updateSet = (id: string, fn: (s: SetDraft) => SetDraft) => update({ sets: draft.sets.map((s) => (s.set.id === id ? fn(s) : s)) });

  async function persist(next: FinancialSettings, message: string) {
    const db = await getLocalDb();
    await saveFinancialSettings(db, next);
    notifyDataChanged();
    feedback(message);
  }

  async function save() {
    const result = draftToSettings(draft, settings, new Date());
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await persist(result.settings, t.saved);
    } catch {
      setErrors({ form: t.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    const result = draftToSettings({ ...draft, providerEnabled: true }, settings, new Date());
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setRefreshing(true);
    setNotice(null);
    try {
      const out = await refreshFromProvider(result.settings.exchange!);
      if (out.updated.length === 0) {
        setNotice(t.providerFailed);
        return;
      }
      await persist({ ...result.settings, exchange: out.settings }, t.providerDone(out.updated.length));
      if (out.failed.length > 0) setNotice(t.providerFailed);
    } catch {
      setNotice(t.providerFailed);
    } finally {
      setRefreshing(false);
    }
  }

  const activeSet = draft.sets.find((s) => s.set.id === draft.activeId)?.set;
  const providerAvailable = activeSet ? draft.enabled.some((c) => providerSupports(activeSet, c)) : false;

  return (
    <>
      <div className="grid gap-5">
        <div className="grid gap-5 tablet:grid-cols-2">
          <Field label={t.primary} help={t.primaryHelp}>
            {(p) => (
              <Select
                {...p}
                name="primaryCurrency"
                value={draft.primary}
                onChange={(e) => {
                  const primary = e.target.value as CurrencyCode;
                  update({ primary, enabled: draft.enabled.includes(primary) ? draft.enabled : [...draft.enabled, primary] });
                }}
              >
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {es.common.currencies[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t.rateSet} help={t.rateSetHelp}>
            {(p) => (
              <Select {...p} name="activeRateSet" value={draft.activeId} onChange={(e) => update({ activeId: e.target.value })}>
                {draft.sets.map((s) => (
                  <option key={s.set.id} value={s.set.id}>
                    {s.set.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1.5 type-label text-ink-2">{t.enabled}</legend>
          <div className="flex flex-wrap gap-2">
            {CURRENCY_CODES.map((c) => {
              const on = draft.enabled.includes(c);
              const locked = c === draft.primary;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  disabled={locked}
                  title={es.common.currencies[c]}
                  onClick={() => update({ enabled: on ? draft.enabled.filter((x) => x !== c) : [...draft.enabled, c] })}
                  className={cn(
                    "h-11 rounded-full border border-line px-3.5 type-body-sm focus-visible:outline-2 focus-visible:outline-focus-ring desktop:h-8",
                    on && "border-transparent bg-forest-tint text-forest",
                    locked && "opacity-100",
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p className="type-caption text-ink-2">{t.enabledHelp}</p>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1.5 type-label text-ink-2">{t.defaultMode}</legend>
          <div role="radiogroup" aria-label={t.defaultMode} className="grid h-10 max-w-[28rem] grid-cols-2 rounded-sm bg-paper-2 p-0.75">
            {(["manual", "automatic"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={draft.defaultMode === m}
                onClick={() => update({ defaultMode: m })}
                className={cn("rounded-xs type-nav text-ink-2", draft.defaultMode === m && "bg-surface font-semibold text-ink ring-1 ring-line")}
              >
                {t.modes[m]}
              </button>
            ))}
          </div>
          <p className="type-caption text-ink-2">{t.modeHelp[draft.defaultMode]}</p>
        </fieldset>
      </div>

      <div className="grid gap-4">
        <h3 className="type-subheading">{t.rateSets}</h3>
        {draft.sets.map((s) => (
          <RateSetEditor
            key={s.set.id}
            draft={s}
            currencies={draft.enabled.filter((c) => c !== s.set.base)}
            errors={errors}
            active={s.set.id === draft.activeId}
            canRemove={draft.sets.length > 1 && s.set.id !== draft.activeId}
            onText={(code, value) => updateSet(s.set.id, (x) => ({ ...x, manualText: { ...x.manualText, [code]: value } }))}
            onKind={(kind) => updateSet(s.set.id, (x) => ({ ...x, set: { ...x.set, kind } }))}
            onRemove={() => setRemoving(s.set)}
          />
        ))}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim().slice(0, 40);
            if (!name) return;
            const id = slug(name, new Set(draft.sets.map((x) => x.set.id)));
            update({ sets: [...draft.sets, { set: { id, name, kind: "custom", base: draft.primary, manual: {}, automatic: {} }, manualText: {} }] });
            setNewName("");
          }}
        >
          <Field label={t.newRateSet} className="min-w-0 flex-1">
            {(p) => <Input {...p} name="newRateSet" value={newName} maxLength={40} placeholder={t.rateSetNamePlaceholder} onChange={(e) => setNewName(e.target.value)} />}
          </Field>
          <Button type="submit" variant="secondary" disabled={newName.trim() === ""}>
            {t.addRateSet}
          </Button>
        </form>
      </div>

      <div className="grid gap-3 rounded-sm border border-line p-4">
        <h3 className="type-subheading">{t.provider}</h3>
        <p className="type-body-sm text-ink-2">{t.providerHint}</p>
        <label className="flex items-center gap-2 type-body-sm">
          <input type="checkbox" className="size-4 accent-forest" checked={draft.providerEnabled} onChange={(e) => update({ providerEnabled: e.target.checked })} />
          {t.providerEnable}
        </label>
        {draft.providerEnabled && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => void refresh()} disabled={refreshing || !providerAvailable} aria-busy={refreshing}>
              {refreshing ? t.providerRefreshing : t.providerRefresh}
            </Button>
            {!providerAvailable && <span className="type-caption text-ink-2">{activeSet?.base !== "ARS" ? t.providerOnlyArs : t.providerUnsupportedSet}</span>}
          </div>
        )}
        {notice && (
          <p role="status" className="type-body-sm text-warning-text">
            {notice}
          </p>
        )}
      </div>

      {errors.form && (
        <p role="alert" className="type-body-sm text-alert-text">
          {errors.form}
        </p>
      )}
      <div className="flex justify-end border-t border-line pt-4">
        <Button type="button" variant="primary" onClick={() => void save()} disabled={saving} aria-busy={saving}>
          {saving ? es.common.saving : t.save}
        </Button>
      </div>

      <div className="grid gap-3 border-t border-line pt-6">
        <h3 className="type-subheading">{t.converter}</h3>
        <p className="type-body-sm text-ink-2">{t.converterHint}</p>
        <Converter ctx={ctx} currencies={savedCurrencies} />
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={t.removeRateSet}
        confirmLabel={t.removeRateSet}
        onConfirm={() => {
          if (removing) update({ sets: draft.sets.filter((s) => s.set.id !== removing.id) });
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      >
        {removing ? t.removeRateSetConfirm(removing.name) : null}
      </ConfirmDialog>
    </>
  );
}

function RateSetEditor({
  draft,
  currencies,
  errors,
  active,
  canRemove,
  onText,
  onKind,
  onRemove,
}: {
  draft: SetDraft;
  currencies: CurrencyCode[];
  errors: DraftErrors;
  active: boolean;
  canRemove: boolean;
  onText: (code: CurrencyCode, value: string) => void;
  onKind: (kind: RateSetKind) => void;
  onRemove: () => void;
}) {
  const { set } = draft;
  return (
    <div className={cn("grid gap-3 rounded-sm border p-4", active ? "border-gold" : "border-line")} data-testid={`rate-set-${set.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-body font-semibold">
          {set.name}
          {active && <span className="ml-2 type-caption text-gold-text">· {t.rateSet}</span>}
        </p>
        <div className="flex items-center gap-2">
          <Select aria-label={`${set.name}: tipo`} className="h-9 w-auto desktop:h-9" value={set.kind} onChange={(e) => onKind(e.target.value as RateSetKind)}>
            {RATE_SET_KINDS.map((k) => (
              <option key={k} value={k}>
                {t.kinds[k]}
              </option>
            ))}
          </Select>
          {canRemove && (
            <Button type="button" variant="ghost" onClick={onRemove}>
              {t.removeRateSet}
            </Button>
          )}
        </div>
      </div>
      {currencies.length === 0 ? (
        <p className="type-body-sm text-ink-2">{t.enabledHelp}</p>
      ) : (
        <div className="grid gap-3 tablet:grid-cols-2">
          {currencies.map((code) => {
            const auto = set.automatic[code];
            const manual = set.manual[code];
            return (
              <Field
                key={code}
                label={t.quoteLabel(code, set.base)}
                error={errors[`${set.id}:${code}`]}
                help={
                  <>
                    {manual && `${t.manualQuote}: ${t.updated(formatInstant(manual.updatedAt))}`}
                    {auto && (
                      <span className="block">
                        {t.automaticQuote}: {formatRate(auto.rate)} · {t.sources[auto.source]} · {t.updated(formatInstant(auto.updatedAt))}
                      </span>
                    )}
                  </>
                }
              >
                {(p) => (
                  <Input
                    {...p}
                    name={`quote-${set.id}-${code}`}
                    inputMode="decimal"
                    autoComplete="off"
                    className="num text-right"
                    placeholder={t.quotePlaceholder}
                    value={draft.manualText[code] ?? ""}
                    onChange={(e) => onText(code, e.target.value)}
                  />
                )}
              </Field>
            );
          })}
        </div>
      )}
    </div>
  );
}
