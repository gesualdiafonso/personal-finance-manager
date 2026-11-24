"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFeedback } from "@/components/ui/feedback";
import {
  Field,
  Input,
  inputClass,
  MoneyInput,
  Select,
} from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { mutate } from "@/hooks/use-local-data";
import { isAppError } from "@/lib/errors/app-error";
import { toLocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import {
  readPreference,
  writePreference,
} from "@/services/storage/preferences";
import type { Transaction } from "@/domain/schemas";
import { Money } from "@/components/shared/money";
import { getLocalDb } from "@/hooks/use-local-data";
import type { BalanceImpact } from "@/domain/rules/transactions";
import { loadEditImpact } from "./edit-impact";
import type { TransactionFormData } from "./form-data";
import {
  editPatch,
  transactionToForm,
  emptyTransactionForm,
  parseTransactionForm,
  transactionSaveError,
  type TransactionFieldErrors,
  type TransactionFormValues,
  type TransactionType,
} from "./transaction-form";

const t = es.transactions.form;
const TYPES: TransactionType[] = ["expense", "income", "transfer"];

/**
 * New transaction (QuickAdd, D4-15): type → amount (largest element) → category chips (the 4
 * most used + "Más…") → save; account (last used) and date (today) come prefilled. Side sheet
 * on desktop, full-height bottom sheet on the phone. The system decimal keyboard is used
 * instead of a custom keypad (approved deviation).
 */
export function TransactionSheet({
  open,
  data,
  onClose,
}: {
  open: boolean;
  data: TransactionFormData;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.createTitle}
      testId="transaction-sheet"
    >
      {open && <TransactionForm data={data} onDone={onClose} />}
    </Sheet>
  );
}

function initialAccount(data: TransactionFormData): string {
  const last = readPreference("pfm.quickAdd.lastAccountId");
  if (last && data.accounts.some((a) => a.id === last)) return last;
  return data.accounts[0]?.id ?? "";
}

/**
 * Create or edit (with `transaction`). Editing never changes the type (D4-01) and, before
 * saving a change that moves money, shows how each affected account's current balance changes
 * (D4-05) — computed by the domain on the stored data, saved by the repository in one write.
 */
export function TransactionForm({
  data,
  transaction,
  onDone,
}: {
  data: TransactionFormData;
  transaction?: Transaction;
  onDone: () => void;
}) {
  const feedback = useFeedback();
  const [values, setValues] = useState<TransactionFormValues>(() =>
    transaction
      ? transactionToForm(transaction)
      : // Today in Buenos Aires; the form only renders on the client, after the sheet opens.
        emptyTransactionForm(toLocalDate(new Date()), initialAccount(data)),
  );
  const [errors, setErrors] = useState<TransactionFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [moreCategories, setMoreCategories] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [impact, setImpact] = useState<{
    rows: BalanceImpact[];
    names: Map<string, string>;
  } | null>(null);
  const busy = useRef(false);
  const editing = Boolean(transaction);

  const type = values.type;
  const card =
    type === "expense" && values.cardId
      ? data.cards.find((c) => c.id === values.cardId)
      : undefined;
  const effectiveAccountId = card?.accountId ?? values.accountId;
  const account = data.accounts.find((a) => a.id === effectiveAccountId);
  const categories = type === "transfer" ? [] : data.categories[type];
  const chips = categories.slice(0, 4);
  const chosenIsChip = chips.some((o) => o.category.id === values.categoryId);
  const cardsForAccount = useMemo(() => data.cards, [data.cards]);

  const set = <K extends keyof TransactionFormValues>(
    key: K,
    value: TransactionFormValues[K],
  ) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
    setFormError(null);
  };

  function changeType(next: TransactionType) {
    setValues((v) => ({
      ...v,
      type: next,
      categoryId: "",
      cardId: next === "expense" ? v.cardId : "",
      destinationAccountId: next === "transfer" ? v.destinationAccountId : "",
    }));
    setErrors({});
    setMoreCategories(false);
  }

  async function save(
    allowPossibleDuplicate: boolean,
    impactConfirmed = false,
  ) {
    if (busy.current) return; // double submit
    setFormError(null);
    const parsed = parseTransactionForm(values, data);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      if (transaction) {
        const patch = editPatch(parsed.input);
        if (!impactConfirmed) {
          const preview = await loadEditImpact(
            await getLocalDb(),
            transaction,
            { ...transaction, ...patch },
          );
          if (preview.impact.length > 0) {
            setImpact({
              rows: preview.impact,
              names: new Map(
                [...preview.accounts].map(([id, a]) => [id, a.name]),
              ),
            });
            return;
          }
        }
        await mutate((r) =>
          r.transactions.update(transaction.id, patch, transaction.rev),
        );
        setImpact(null);
        feedback(t.updated);
        onDone();
        return;
      }
      await mutate((r) =>
        r.transactions.create(parsed.input, { allowPossibleDuplicate }),
      );
      writePreference("pfm.quickAdd.lastAccountId", parsed.input.accountId);
      setDuplicate(false);
      feedback(t.created[parsed.input.type]); // only after the write committed (§7.6)
      onDone();
    } catch (err) {
      if (isAppError(err) && err.code === "POSSIBLE_DUPLICATE")
        setDuplicate(true);
      else {
        setDuplicate(false);
        setImpact(null);
        setFormError(transactionSaveError(err));
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  return (
    <>
      <form
        onSubmit={submit}
        noValidate
        className="grid gap-5"
        aria-label={editing ? t.editTitle : t.createTitle}
      >
        <div
          role="radiogroup"
          aria-label={t.typeLabel}
          className="grid grid-cols-3 rounded-sm bg-paper-2 p-0.75"
        >
          {TYPES.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={type === k}
              onClick={() => changeType(k)}
              disabled={editing && k !== type}
              title={editing ? t.typeLocked : undefined}
              className={cn(
                "h-9 rounded-xs type-body-sm text-ink-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
                type === k &&
                  "bg-surface font-semibold text-ink ring-1 ring-line",
              )}
            >
              {t.types[k]}
            </button>
          ))}
        </div>

        <Field label={t.amount} help={t.amountHelp} error={errors.amount}>
          {(p) => (
            <MoneyInput
              {...p}
              name="amount"
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="0,00"
              data-autofocus
              className="h-16 type-amount-xl desktop:h-16"
            />
          )}
        </Field>

        {type !== "transfer" && (
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 type-label text-ink-2">
              {t.category}
            </legend>
            {categories.length === 0 ? (
              <p className="type-body-sm text-ink-2">{t.categoryNone}</p>
            ) : (
              <div
                className="flex flex-wrap gap-2"
                data-testid="category-chips"
              >
                {chips.map((o) => {
                  const on = values.categoryId === o.category.id;
                  return (
                    <button
                      key={o.category.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("categoryId", on ? "" : o.category.id)}
                      className={cn(
                        "h-11 rounded-full border border-line px-3.5 type-body-sm focus-visible:outline-2 focus-visible:outline-focus-ring desktop:h-8",
                        on && "border-transparent bg-lake-tint text-lake",
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
                {categories.length > 4 && (
                  <button
                    type="button"
                    aria-expanded={
                      moreCategories ||
                      (values.categoryId !== "" && !chosenIsChip)
                    }
                    onClick={() => setMoreCategories((m) => !m)}
                    className="h-11 rounded-full border border-line px-3.5 type-body-sm text-ink-2 focus-visible:outline-2 focus-visible:outline-focus-ring desktop:h-8"
                  >
                    {t.categoryMore}
                  </button>
                )}
              </div>
            )}
            {(moreCategories ||
              (values.categoryId !== "" && !chosenIsChip)) && (
              <Select
                aria-label={t.categoryAll}
                value={values.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
              >
                <option value="">{t.categoryNone}</option>
                {categories.map((o) => (
                  <option key={o.category.id} value={o.category.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
            {errors.categoryId && (
              <p className="type-body-sm text-alert-text">
                {errors.categoryId}
              </p>
            )}
          </fieldset>
        )}

        <Field label={t.description} error={errors.description}>
          {(p) => (
            <Input
              {...p}
              name="description"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t.descriptionPlaceholder[type]}
              maxLength={160}
              autoComplete="off"
            />
          )}
        </Field>

        {type === "expense" && cardsForAccount.length > 0 && (
          <Field
            label={t.card}
            error={errors.cardId}
            help={
              card
                ? card.cardType === "credit"
                  ? t.cardCredit
                  : t.cardDebit
                : t.cardHelp
            }
          >
            {(p) => (
              <Select
                {...p}
                name="cardId"
                value={values.cardId}
                onChange={(e) => set("cardId", e.target.value)}
              >
                <option value="">{t.cardNone}</option>
                {cardsForAccount.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.lastFourDigits ? ` ··${c.lastFourDigits}` : ""} ·{" "}
                    {es.cards.types[c.cardType]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <div className="grid gap-5">
          <Field label={t.account[type]} error={errors.accountId}>
            {(p) => (
              <Select
                {...p}
                name="accountId"
                value={effectiveAccountId}
                onChange={(e) => set("accountId", e.target.value)}
                disabled={Boolean(card)}
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {type === "transfer" ? (
            <Field label={t.destination} error={errors.destinationAccountId}>
              {(p) => (
                <Select
                  {...p}
                  name="destinationAccountId"
                  value={values.destinationAccountId}
                  onChange={(e) => set("destinationAccountId", e.target.value)}
                >
                  <option value="">{es.cards.form.accountPlaceholder}</option>
                  {data.accounts
                    .filter((a) => a.id !== effectiveAccountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.currency}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          ) : (
            <p
              className="-mt-3 type-body-sm text-ink-2"
              data-testid="transaction-currency"
            >
              {t.currency}:{" "}
              {account ? es.common.currencies[account.currency] : "—"}
            </p>
          )}
        </div>

        <div className="grid gap-5 tablet:grid-cols-2">
          <Field label={t.date} error={errors.date}>
            {(p) => (
              <Input
                {...p}
                type="date"
                name="date"
                value={values.date}
                onChange={(e) => set("date", e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t.status}
            help={values.status === "pending" ? t.statusHelp : undefined}
          >
            {(p) => (
              <Select
                {...p}
                name="status"
                value={values.status}
                onChange={(e) =>
                  set(
                    "status",
                    e.target.value as TransactionFormValues["status"],
                  )
                }
              >
                <option value="completed">{t.statuses.completed}</option>
                <option value="pending">{t.statuses.pending}</option>
              </Select>
            )}
          </Field>
        </div>

        <Field label={t.notes} help={t.notesHelp} error={errors.notes}>
          {(p) => (
            <textarea
              {...p}
              name="notes"
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              maxLength={600}
              className={cn(inputClass, "h-auto py-2")}
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
            {saving ? es.common.saving : editing ? t.saveChanges : t.save[type]}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={duplicate}
        title={t.duplicateTitle}
        confirmLabel={t.duplicateConfirm}
        busy={saving}
        onConfirm={() => void save(true)}
        onCancel={() => setDuplicate(false)}
      >
        {t.duplicateBody}
      </ConfirmDialog>
      <ConfirmDialog
        open={impact !== null}
        title={t.impactTitle}
        confirmLabel={t.impactConfirm}
        busy={saving}
        onConfirm={() => void save(false, true)}
        onCancel={() => setImpact(null)}
      >
        <p>{t.impactBody}</p>
        <dl className="mt-3 grid gap-2" data-testid="edit-impact">
          {impact?.rows.map((r) => (
            <div
              key={r.accountId}
              className="flex flex-wrap items-baseline justify-between gap-2 text-ink"
            >
              <dt className="type-body-sm">{impact.names.get(r.accountId)}</dt>
              <dd className="type-body-sm">
                <Money amount={r.before.amount} currency={r.before.currency} />{" "}
                → <Money amount={r.after.amount} currency={r.after.currency} />
              </dd>
            </div>
          ))}
        </dl>
      </ConfirmDialog>
    </>
  );
}
