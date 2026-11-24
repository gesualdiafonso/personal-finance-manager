"use client";

import { useRef, useState, type FormEvent } from "react";
import { GOAL_KINDS, type Goal } from "@/domain/schemas";
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
  emptyGoalForm,
  goalSaveError,
  goalToForm,
  newGoalInput,
  parseGoalForm,
  patchOf,
  type GoalFieldErrors,
  type GoalFormValues,
} from "./forms";

const t = es.planning.goals.form;

export interface GoalFormContext {
  today: string;
  baseCurrency: string;
}

export function NewGoalSheet({
  open,
  context,
  onClose,
}: {
  open: boolean;
  context: GoalFormContext;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.createTitle}
      testId="goal-sheet"
    >
      {open && <GoalForm goal={null} context={context} onDone={onClose} />}
    </Sheet>
  );
}

/**
 * Create or edit a goal. An active goal edits every field (the currency only while it has no
 * contributions); a completed or cancelled one only its description (the repository refuses
 * anything else).
 */
export function GoalForm({
  goal,
  hasContributions = false,
  context,
  onDone,
}: {
  goal: Goal | null;
  hasContributions?: boolean;
  context: GoalFormContext;
  onDone: () => void;
}) {
  const feedback = useFeedback();
  const [values, setValues] = useState<GoalFormValues>(() =>
    goal
      ? goalToForm(goal)
      : emptyGoalForm(context.today, context.baseCurrency),
  );
  const [errors, setErrors] = useState<GoalFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const descriptionOnly = goal !== null && goal.status !== "active";

  const set =
    (key: keyof GoalFormValues) => (e: { target: { value: string } }) => {
      const value = e.target.value;
      setValues((v) => ({ ...v, [key]: value }));
      setErrors((er) => ({ ...er, [key]: undefined }));
    };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    setFormError(null);
    let work: (() => Promise<unknown>) | null;
    if (descriptionOnly) {
      const description = values.description.trim();
      if (description.length > 200) {
        setErrors({
          description: es.planning.goals.form.errors.descriptionTooLong,
        });
        return;
      }
      work = () =>
        mutate((r) =>
          r.goals.update(
            goal.id,
            { description: description === "" ? null : description },
            goal.rev,
          ),
        );
    } else {
      const parsed = parseGoalForm(values);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      if (goal) {
        const patch = patchOf(goal, parsed.fields);
        work =
          Object.keys(patch).length > 0
            ? () => mutate((r) => r.goals.update(goal.id, patch, goal.rev))
            : null;
      } else {
        work = () => mutate((r) => r.goals.create(newGoalInput(parsed.fields)));
      }
    }
    busy.current = true;
    setSaving(true);
    try {
      if (work) await work();
      feedback(goal ? t.updated : t.created);
      onDone();
    } catch (err) {
      setFormError(goalSaveError(err));
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
      aria-label={goal ? t.editTitle : t.createTitle}
      data-testid="goal-form"
    >
      {descriptionOnly ? (
        <p className="type-body-sm text-ink-2">
          {es.planning.goals.detail.closedNote}
        </p>
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
          <Field label={t.kind} error={errors.kind}>
            {(p) => (
              <Select
                {...p}
                name="kind"
                value={values.kind}
                onChange={set("kind")}
              >
                {GOAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {es.planning.goalKinds[k]}
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
            <Field
              label={t.currency}
              error={errors.currency}
              help={hasContributions ? t.currencyLocked : undefined}
            >
              {(p) => (
                <Select
                  {...p}
                  name="currency"
                  value={values.currency}
                  onChange={set("currency")}
                  disabled={hasContributions}
                >
                  <option value="ARS">{es.common.currencies.ARS}</option>
                  <option value="USD">{es.common.currencies.USD}</option>
                </Select>
              )}
            </Field>
          </div>
          <Field
            label={t.initialAmount}
            help={t.initialHelp}
            error={errors.initialAmount}
          >
            {(p) => (
              <MoneyInput
                {...p}
                name="initialAmount"
                value={values.initialAmount}
                onChange={set("initialAmount")}
                placeholder="0,00"
              />
            )}
          </Field>
          <div className="grid gap-5 tablet:grid-cols-2">
            <Field label={t.startDate} error={errors.startDate}>
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
            <Field
              label={t.targetDate}
              help={t.targetHelp}
              error={errors.targetDate}
            >
              {(p) => (
                <input
                  {...p}
                  type="date"
                  name="targetDate"
                  value={values.targetDate}
                  onChange={set("targetDate")}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
        </>
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
            {...(descriptionOnly ? { "data-autofocus": true } : {})}
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
          {saving ? es.common.saving : goal ? es.common.save : t.create}
        </Button>
      </div>
    </form>
  );
}
