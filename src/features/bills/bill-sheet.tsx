"use client";

import { CurrencyOptions } from "@/features/exchange/currency-options";
import { useRef, useState, type FormEvent } from "react";
import type { Account, Bill, Category } from "@/domain/schemas";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import {
  Field,
  Input,
  MoneyInput,
  Select,
  inputClass,
} from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { mutate } from "@/hooks/use-local-data";
import { es } from "@/lib/i18n/es";
import {
  billPatch,
  billSaveErrorMessage,
  billToForm,
  emptyBillForm,
  newBillInput,
  parseBillForm,
  type BillFieldErrors,
  type BillFormValues,
} from "./bill-form";
import { categoryLabel } from "./data";

const t = es.bills.form;

export interface BillFormContext {
  /** Active accounts (choices). */
  accounts: Account[];
  /** Every live account, archived included (names of what a bill already uses). */
  allAccounts: Account[];
  categories: Category[];
  allCategories: Category[];
  today: string;
  baseCurrency: string;
}

/** New bill, in the side sheet (arquitetura.md "Criar / editar"). */
export function NewBillSheet({
  open,
  context,
  onClose,
}: {
  open: boolean;
  context: BillFormContext;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.createTitle}
      description={t.createHint}
      testId="bill-sheet"
    >
      {open && <BillForm bill={null} context={context} onDone={onClose} />}
    </Sheet>
  );
}

/**
 * Create or edit a bill. Writes only through the repositories; the form keeps what was typed
 * if saving fails; a second submit while saving is ignored (no duplicate bills).
 * A paid or cancelled bill is closed: only its notes can be edited (the repository refuses
 * anything else).
 */
export function BillForm({
  bill,
  hasPayments = false,
  context,
  onDone,
}: {
  bill: Bill | null;
  hasPayments?: boolean;
  context: BillFormContext;
  onDone: () => void;
}) {
  const feedback = useFeedback();
  const [values, setValues] = useState<BillFormValues>(() =>
    bill
      ? billToForm(bill)
      : emptyBillForm(context.today, context.baseCurrency),
  );
  const [errors, setErrors] = useState<BillFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const notesOnly = bill !== null && bill.status !== "pending";

  // An archived account or inactive category already on the bill stays selectable (history).
  const accounts = context.accounts.filter(
    (a) => a.currency === values.currency,
  );
  const keptAccount =
    bill?.accountId && !accounts.some((a) => a.id === bill.accountId)
      ? bill.accountId
      : null;
  const categories = context.categories;
  const keptCategory =
    bill?.categoryId && !categories.some((c) => c.id === bill.categoryId)
      ? (context.allCategories.find((c) => c.id === bill.categoryId) ?? null)
      : null;

  const set =
    (key: keyof BillFormValues) => (e: { target: { value: string } }) => {
      const value = e.target.value;
      setValues((v) => ({
        ...v,
        [key]: value,
        // Changing the currency drops an account of the other currency.
        ...(key === "currency" &&
        v.accountId &&
        context.accounts.find((a) => a.id === v.accountId)?.currency !== value
          ? { accountId: "" }
          : {}),
      }));
      setErrors((er) => ({ ...er, [key]: undefined }));
    };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return; // double submit
    setFormError(null);
    if (notesOnly) {
      const notes = values.notes.trim();
      if (notes.length > 500) {
        setErrors({ notes: es.bills.form.errors.notesTooLong });
        return;
      }
      await save(() =>
        mutate((r) =>
          r.bills.update(
            bill.id,
            { notes: notes === "" ? null : notes },
            bill.rev,
          ),
        ),
      );
      return;
    }
    const parsed = parseBillForm(values, context.accounts);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    if (bill) {
      const patch = billPatch(bill, parsed.fields);
      if (Object.keys(patch).length === 0) {
        onDone();
        return;
      }
      await save(() => mutate((r) => r.bills.update(bill.id, patch, bill.rev)));
    } else {
      await save(() =>
        mutate((r) => r.bills.create(newBillInput(parsed.fields))),
      );
    }
  }

  async function save(work: () => Promise<unknown>) {
    busy.current = true;
    setSaving(true);
    try {
      await work();
      feedback(bill ? t.updated : t.created);
      onDone();
    } catch (err) {
      setFormError(billSaveErrorMessage(err));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-5"
      aria-label={bill ? t.editTitle : t.createTitle}
      data-testid="bill-form"
    >
      {notesOnly ? (
        <p className="type-body-sm text-ink-2">{es.bills.detail.closedNote}</p>
      ) : (
        <>
          <Field label={t.name} error={errors.name}>
            {(p) => (
              <Input
                {...p}
                name="name"
                value={values.name}
                onChange={set("name")}
                placeholder={t.namePlaceholder}
                maxLength={80}
                autoComplete="off"
                data-autofocus
              />
            )}
          </Field>
          <div className="grid gap-5 tablet:grid-cols-2">
            <Field label={t.amount} error={errors.amount}>
              {(p) => (
                <MoneyInput
                  {...p}
                  name="amount"
                  value={values.amount}
                  onChange={set("amount")}
                  placeholder="0,00"
                />
              )}
            </Field>
            <Field
              label={t.currency}
              error={errors.currency}
              help={hasPayments ? t.currencyLocked : undefined}
            >
              {(p) => (
                <Select
                  {...p}
                  name="currency"
                  value={values.currency}
                  onChange={set("currency")}
                  disabled={hasPayments}
                >
                  <CurrencyOptions value={values.currency} />
                </Select>
              )}
            </Field>
          </div>
          <Field label={t.dueDate} error={errors.dueDate}>
            {(p) => (
              <input
                {...p}
                type="date"
                name="dueDate"
                value={values.dueDate}
                onChange={set("dueDate")}
                className={inputClass}
                required
              />
            )}
          </Field>
          <Field label={t.category} error={errors.categoryId}>
            {(p) => (
              <Select
                {...p}
                name="categoryId"
                value={values.categoryId}
                onChange={set("categoryId")}
              >
                <option value="">{t.noCategory}</option>
                {keptCategory && (
                  <option value={keptCategory.id}>
                    {categoryLabel(keptCategory, context.allCategories)}
                  </option>
                )}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c, context.allCategories)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t.account}
            help={t.accountHelp}
            error={errors.accountId}
          >
            {(p) => (
              <Select
                {...p}
                name="accountId"
                value={values.accountId}
                onChange={set("accountId")}
              >
                <option value="">{t.noAccount}</option>
                {keptAccount && (
                  <option value={keptAccount}>
                    {context.allAccounts.find((a) => a.id === keptAccount)
                      ?.name ?? es.bills.detail.none}
                  </option>
                )}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t.description}
            help={t.descriptionHelp}
            error={errors.description}
          >
            {(p) => (
              <Input
                {...p}
                name="description"
                value={values.description}
                onChange={set("description")}
                maxLength={200}
                autoComplete="off"
              />
            )}
          </Field>
        </>
      )}
      <Field label={t.notes} error={errors.notes}>
        {(p) => (
          <textarea
            {...p}
            name="notes"
            value={values.notes}
            onChange={set("notes")}
            maxLength={500}
            rows={3}
            className={`${inputClass} h-auto py-2 desktop:h-auto`}
            {...(notesOnly ? { "data-autofocus": true } : {})}
          />
        )}
      </Field>

      {formError && (
        <p role="alert" className="type-body-sm text-alert-text">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
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
          {saving ? es.common.saving : bill ? es.common.save : t.create}
        </Button>
      </div>
    </form>
  );
}
