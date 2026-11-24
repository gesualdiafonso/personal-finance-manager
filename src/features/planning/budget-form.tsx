"use client";

import { useRef, useState, type FormEvent } from "react";
import { BUDGET_PERIODS, type Budget, type Category } from "@/domain/schemas";
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
import { formatDate, type LocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { categoryLabel } from "./data";
import {
  budgetRange,
  budgetSaveError,
  budgetToForm,
  emptyBudgetForm,
  newBudgetInput,
  parseBudgetForm,
  patchOf,
  type BudgetFieldErrors,
  type BudgetFormValues,
} from "./forms";

const t = es.planning.budgets.form;

export interface BudgetFormContext {
  categories: Category[];
  allCategories: Category[];
  today: string;
  baseCurrency: string;
  firstDayOfWeek: "monday" | "sunday";
}

export function NewBudgetSheet({
  open,
  context,
  onClose,
}: {
  open: boolean;
  context: BudgetFormContext;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.createTitle}
      testId="budget-sheet"
    >
      {open && <BudgetForm budget={null} context={context} onDone={onClose} />}
    </Sheet>
  );
}

/**
 * Create or edit a budget. The period snaps to the week, month, quarter or year containing the
 * start date (the computed range is shown before saving); custom asks for both dates.
 * Writes only through the repositories; a double submit is ignored.
 */
export function BudgetForm({
  budget,
  context,
  onDone,
}: {
  budget: Budget | null;
  context: BudgetFormContext;
  onDone: () => void;
}) {
  const feedback = useFeedback();
  const [values, setValues] = useState<BudgetFormValues>(() =>
    budget
      ? budgetToForm(budget)
      : emptyBudgetForm(context.today, context.baseCurrency),
  );
  const [errors, setErrors] = useState<BudgetFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const keptCategory =
    budget?.categoryId &&
    !context.categories.some((c) => c.id === budget.categoryId)
      ? (context.allCategories.find((c) => c.id === budget.categoryId) ?? null)
      : null;
  const range = budgetRange(
    values.period,
    values.startDate,
    values.endDate,
    context.firstDayOfWeek,
  );

  const set =
    (key: keyof BudgetFormValues) => (e: { target: { value: string } }) => {
      const value = e.target.value;
      setValues((v) => ({ ...v, [key]: value }));
      setErrors((er) => ({ ...er, [key]: undefined }));
    };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    setFormError(null);
    const parsed = parseBudgetForm(values, context.firstDayOfWeek);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      if (budget) {
        const patch = patchOf(budget, parsed.fields);
        if (Object.keys(patch).length > 0)
          await mutate((r) => r.budgets.update(budget.id, patch, budget.rev));
        feedback(t.updated);
      } else {
        await mutate((r) => r.budgets.create(newBudgetInput(parsed.fields)));
        feedback(t.created);
      }
      onDone();
    } catch (err) {
      setFormError(budgetSaveError(err));
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
      aria-label={budget ? t.editTitle : t.createTitle}
      data-testid="budget-form"
    >
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
      <Field label={t.category} help={t.categoryHelp} error={errors.categoryId}>
        {(p) => (
          <Select
            {...p}
            name="categoryId"
            value={values.categoryId}
            onChange={set("categoryId")}
          >
            <option value="">{es.planning.budgets.general}</option>
            {keptCategory && (
              <option value={keptCategory.id}>
                {categoryLabel(keptCategory, context.allCategories)}
              </option>
            )}
            {context.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c, context.allCategories)}
              </option>
            ))}
          </Select>
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
        <Field label={t.currency} error={errors.currency}>
          {(p) => (
            <Select
              {...p}
              name="currency"
              value={values.currency}
              onChange={set("currency")}
            >
              <option value="ARS">{es.common.currencies.ARS}</option>
              <option value="USD">{es.common.currencies.USD}</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label={t.period} error={errors.period}>
        {(p) => (
          <Select
            {...p}
            name="period"
            value={values.period}
            onChange={set("period")}
          >
            {BUDGET_PERIODS.map((period) => (
              <option key={period} value={period}>
                {es.planning.periods[period]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-5 tablet:grid-cols-2">
        <Field
          label={t.startDate}
          help={t.startHelp[values.period as Budget["period"]]}
          error={errors.startDate}
        >
          {(p) => (
            <input
              {...p}
              type="date"
              name="startDate"
              value={values.startDate}
              onChange={set("startDate")}
              className={inputClass}
              required
            />
          )}
        </Field>
        {values.period === "custom" && (
          <Field label={t.endDate} error={errors.endDate}>
            {(p) => (
              <input
                {...p}
                type="date"
                name="endDate"
                value={values.endDate}
                onChange={set("endDate")}
                className={inputClass}
                required
              />
            )}
          </Field>
        )}
      </div>
      {range && range.endDate >= range.startDate && (
        <p className="-mt-2 type-body-sm text-ink-2" data-testid="budget-range">
          {t.range(
            formatDate(range.startDate as LocalDate, "form"),
            formatDate(range.endDate as LocalDate, "form"),
          )}
        </p>
      )}
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
          {saving ? es.common.saving : budget ? es.common.save : t.create}
        </Button>
      </div>
    </form>
  );
}
