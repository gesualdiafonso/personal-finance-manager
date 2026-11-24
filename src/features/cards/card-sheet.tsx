"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { CARD_TYPES, type Account } from "@/domain/schemas";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFeedback } from "@/components/ui/feedback";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { mutate } from "@/hooks/use-local-data";
import { es } from "@/lib/i18n/es";
import {
  cardSaveErrorMessage,
  cardToForm,
  emptyCardForm,
  parseCardForm,
  type CardFieldErrors,
  type CardFormValues,
} from "./card-form";
import type { CardRow } from "./data";

const t = es.cards;

/**
 * Create / edit a card in the side sheet (bottom sheet on the phone). Conditional fields:
 * only credit cards show limit and statement days (D3-01). The paying account is required
 * (D3-03) and the currency follows it (D2-02). Writes only through the Card repository.
 */
export function CardSheet({
  open,
  row,
  accounts,
  onClose,
}: {
  open: boolean;
  row: CardRow | null;
  accounts: Account[];
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={row ? t.form.editTitle : t.form.createTitle}
      description={t.form.createHint}
      testId="card-sheet"
    >
      {open && (
        <CardForm
          key={row?.card.id ?? "new"}
          row={row}
          accounts={accounts}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function CardForm({
  row,
  accounts,
  onDone,
}: {
  row: CardRow | null;
  accounts: Account[];
  onDone: () => void;
}) {
  const feedback = useFeedback();
  // The card's own account stays selectable even if it was archived since.
  const options = useMemo(
    () =>
      row?.account && !accounts.some((a) => a.id === row.account!.id)
        ? [row.account, ...accounts]
        : accounts,
    [row, accounts],
  );
  const [values, setValues] = useState<CardFormValues>(() =>
    row
      ? cardToForm(row.card)
      : emptyCardForm(accounts.length === 1 ? accounts[0]!.id : ""),
  );
  const [errors, setErrors] = useState<CardFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const busy = useRef(false);
  const accountLocked =
    row !== null && row.references > 0 && row.card.accountId !== null;
  const selected = options.find((a) => a.id === values.accountId);
  const isCredit = values.cardType === "credit";

  const set =
    (key: keyof CardFormValues) => (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setErrors((er) => ({ ...er, [key]: undefined }));
    };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    setFormError(null);
    const parsed = parseCardForm(values, options);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      if (row) {
        await mutate((r) =>
          r.cards.update(row.card.id, parsed.input, row.card.rev),
        );
        feedback(t.form.updated);
      } else {
        await mutate((r) => r.cards.create(parsed.input));
        feedback(t.form.created);
      }
      onDone();
    } catch (err) {
      setFormError(cardSaveErrorMessage(err));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function remove() {
    if (!row || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await mutate((r) => r.cards.delete(row.card.id, row.card.rev));
      feedback(t.remove.done);
      setRemoving(false);
      onDone();
    } catch (err) {
      setRemoving(false);
      setFormError(cardSaveErrorMessage(err));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <form
        onSubmit={submit}
        noValidate
        className="grid gap-5"
        aria-label={row ? t.form.editTitle : t.form.createTitle}
      >
        <Field label={t.form.name} error={errors.name}>
          {(p) => (
            <Input
              {...p}
              name="name"
              value={values.name}
              onChange={set("name")}
              placeholder={t.form.namePlaceholder}
              maxLength={80}
              autoComplete="off"
            />
          )}
        </Field>
        <div className="grid gap-5 tablet:grid-cols-2">
          <Field label={t.form.type} error={errors.cardType}>
            {(p) => (
              <Select
                {...p}
                name="cardType"
                value={values.cardType}
                onChange={set("cardType")}
              >
                {CARD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.types[type]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t.form.lastFour}
            help={t.form.lastFourHelp}
            error={errors.lastFourDigits}
          >
            {(p) => (
              <Input
                {...p}
                name="lastFourDigits"
                value={values.lastFourDigits}
                onChange={set("lastFourDigits")}
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                className="num"
                placeholder="1234"
              />
            )}
          </Field>
        </div>
        <Field
          label={t.form.account}
          error={errors.accountId}
          help={accountLocked ? t.form.accountLocked : undefined}
        >
          {(p) => (
            <Select
              {...p}
              name="accountId"
              value={values.accountId}
              onChange={set("accountId")}
              disabled={accountLocked}
            >
              <option value="">{t.form.accountPlaceholder}</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div>
          <div className="type-label text-ink-2">{t.form.currency}</div>
          <p className="mt-1 type-body" data-testid="card-currency">
            {selected ? es.common.currencies[selected.currency] : "—"}
          </p>
          <p className="type-body-sm text-ink-2">{t.form.currencyHelp}</p>
        </div>

        {isCredit && (
          <fieldset
            className="grid gap-5 border-t border-line pt-4"
            data-testid="credit-fields"
          >
            <Field
              label={t.form.creditLimit}
              help={t.form.creditLimitHelp}
              error={errors.creditLimit}
            >
              {(p) => (
                <MoneyInput
                  {...p}
                  name="creditLimit"
                  value={values.creditLimit}
                  onChange={set("creditLimit")}
                  placeholder="0,00"
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-5">
              <Field label={t.form.closingDay} error={errors.closingDay}>
                {(p) => (
                  <Input
                    {...p}
                    name="closingDay"
                    value={values.closingDay}
                    onChange={set("closingDay")}
                    inputMode="numeric"
                    maxLength={2}
                    className="num"
                  />
                )}
              </Field>
              <Field label={t.form.dueDay} error={errors.dueDay}>
                {(p) => (
                  <Input
                    {...p}
                    name="dueDay"
                    value={values.dueDay}
                    onChange={set("dueDay")}
                    inputMode="numeric"
                    maxLength={2}
                    className="num"
                  />
                )}
              </Field>
            </div>
            <p className="-mt-3 type-body-sm text-ink-2">{t.form.dayHelp}</p>
          </fieldset>
        )}

        {row && (
          <Field label={t.form.status}>
            {(p) => (
              <Select
                {...p}
                name="status"
                value={values.status}
                onChange={set("status")}
              >
                <option value="active">{t.status.active}</option>
                <option value="inactive">{t.status.inactive}</option>
              </Select>
            )}
          </Field>
        )}

        {formError && (
          <p role="alert" className="type-body-sm text-alert-text">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="min-w-0">
            {row &&
              (row.references === 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-alert-text"
                  onClick={() => setRemoving(true)}
                  disabled={saving}
                >
                  {t.remove.action}
                </Button>
              ) : (
                <p className="max-w-xs type-caption text-ink-2">
                  {t.remove.blocked(row.references)}
                </p>
              ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onDone}
              disabled={saving}
            >
              {es.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? es.common.saving : row ? es.common.save : t.form.create}
            </Button>
          </div>
        </div>
      </form>
      {row && (
        <ConfirmDialog
          open={removing}
          title={t.remove.title}
          confirmLabel={t.remove.confirm}
          destructive
          busy={saving}
          onConfirm={remove}
          onCancel={() => setRemoving(false)}
        >
          {t.remove.body}
        </ConfirmDialog>
      )}
    </>
  );
}
