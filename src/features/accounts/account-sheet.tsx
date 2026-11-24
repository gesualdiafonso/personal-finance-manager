"use client";

import { useRef, useState, type FormEvent } from "react";
import { ACCOUNT_TYPES } from "@/domain/schemas";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFeedback } from "@/components/ui/feedback";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { mutate } from "@/hooks/use-local-data";
import { es } from "@/lib/i18n/es";
import {
  accountToForm,
  emptyAccountForm,
  parseCreateForm,
  parseEditForm,
  saveErrorMessage,
  type AccountFormValues,
  type FieldErrors,
} from "./account-form";
import type { AccountRow } from "./data";
import { InitialBalanceDialog } from "./initial-balance-dialog";

const t = es.accounts;

/**
 * Create / edit an account in the side sheet. Writes only through the repositories; the
 * sheet stays open (with what was typed) if saving fails; the submit button is disabled while
 * saving and a second submit is ignored (no duplicate records).
 * Editing never touches the initial balance: that has its own audited flow (D3-04).
 */
export function AccountSheet({
  open,
  row,
  onClose,
}: {
  open: boolean;
  row: AccountRow | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={row ? t.form.editTitle : t.form.createTitle}
      description={row ? undefined : t.form.createHint}
      testId="account-sheet"
    >
      {open && (
        <AccountForm
          key={row?.account.id ?? "new"}
          row={row}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function AccountForm({
  row,
  onDone,
}: {
  row: AccountRow | null;
  onDone: () => void;
}) {
  const feedback = useFeedback();
  const [values, setValues] = useState<AccountFormValues>(() =>
    row ? accountToForm(row.account) : emptyAccountForm(),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [correcting, setCorrecting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const currencyLocked = row !== null && row.references > 0;

  const set =
    (key: keyof AccountFormValues) => (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setErrors((er) => ({ ...er, [key]: undefined }));
    };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return; // double submit
    setFormError(null);
    const parsed = row ? parseEditForm(values) : parseCreateForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      if (row) {
        await mutate((r) =>
          r.accounts.update(
            row.account.id,
            (parsed as { patch: object }).patch,
            row.account.rev,
          ),
        );
        feedback(t.form.updated);
      } else {
        await mutate((r) =>
          r.accounts.create(
            (parsed as { input: Parameters<typeof r.accounts.create>[0] })
              .input,
          ),
        );
        feedback(t.form.created);
      }
      onDone();
    } catch (err) {
      setFormError(saveErrorMessage(err));
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
      await mutate((r) => r.accounts.delete(row.account.id, row.account.rev));
      feedback(t.remove.done);
      setRemoving(false);
      onDone();
    } catch (err) {
      setRemoving(false);
      setFormError(saveErrorMessage(err));
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
              maxLength={120}
              autoComplete="off"
            />
          )}
        </Field>
        <Field
          label={t.form.institution}
          help={t.form.institutionHelp}
          error={errors.institution}
        >
          {(p) => (
            <Input
              {...p}
              name="institution"
              value={values.institution}
              onChange={set("institution")}
              maxLength={120}
              autoComplete="off"
            />
          )}
        </Field>
        <div className="grid gap-5 tablet:grid-cols-2">
          <Field label={t.form.type} error={errors.accountType}>
            {(p) => (
              <Select
                {...p}
                name="accountType"
                value={values.accountType}
                onChange={set("accountType")}
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.types[type]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t.form.currency}
            error={errors.currency}
            help={currencyLocked ? t.form.currencyLocked : undefined}
          >
            {(p) => (
              <Select
                {...p}
                name="currency"
                value={values.currency}
                onChange={set("currency")}
                disabled={currencyLocked}
              >
                <option value="ARS">{es.common.currencies.ARS}</option>
                <option value="USD">{es.common.currencies.USD}</option>
              </Select>
            )}
          </Field>
        </div>

        {row ? (
          <>
            <Field label={t.form.status}>
              {(p) => (
                <Select
                  {...p}
                  name="status"
                  value={values.status}
                  onChange={set("status")}
                >
                  <option value="active">{t.status.active}</option>
                  <option value="archived">{t.status.archived}</option>
                </Select>
              )}
            </Field>
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-4">
              <div>
                <div className="type-label text-ink-2">{t.initialBalance}</div>
                <Money
                  amount={row.account.initialBalance}
                  currency={row.account.currency}
                  className="type-amount"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCorrecting(true)}
              >
                {t.correction.action}
              </Button>
            </div>
          </>
        ) : (
          <Field
            label={t.form.initialBalance}
            help={t.form.initialBalanceHelp}
            error={errors.initialBalance}
          >
            {(p) => (
              <MoneyInput
                {...p}
                name="initialBalance"
                value={values.initialBalance}
                onChange={set("initialBalance")}
                placeholder="0,00"
              />
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
        <>
          <InitialBalanceDialog
            open={correcting}
            row={row}
            onClose={() => setCorrecting(false)}
            onDone={onDone}
          />
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
        </>
      )}
    </>
  );
}
