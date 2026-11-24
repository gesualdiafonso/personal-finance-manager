import { z } from "zod";
import { periodContaining, periodEnd } from "@/domain/rules/budgets";
import {
  BUDGET_PERIODS,
  GOAL_KINDS,
  type Budget,
  type Goal,
} from "@/domain/schemas";
import { isAppError } from "@/lib/errors/app-error";
import { formatMoney, parseMoneyInput } from "@/lib/formatting/money";
import { isLocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import type { Input } from "@/services/repositories/repositories";
import { MONEY_ERRORS } from "../accounts/account-form";

/**
 * Form schemas of the Presupuesto area (strings as typed) and their conversion to domain
 * inputs. The repository validates every record again and applies the policies.
 */
const CARD_NUMBER = /\d(?:[ -]?\d){11,18}/;
const noCardNumber = (v: string) => !CARD_NUMBER.test(v);

function money(
  messages: { required: string; zero: string },
  allowZero = false,
) {
  return z.string().transform((value, ctx) => {
    const parsed = parseMoneyInput(value);
    if (!parsed.ok) {
      ctx.addIssue({
        code: "custom",
        message:
          parsed.error === "empty"
            ? messages.required
            : MONEY_ERRORS[parsed.error],
      });
      return z.NEVER;
    }
    if (parsed.value < 0 || (!allowZero && parsed.value === 0)) {
      ctx.addIssue({ code: "custom", message: messages.zero });
      return z.NEVER;
    }
    return parsed.value;
  });
}

type FieldErrors<T> = Partial<Record<keyof T, string>>;
function fieldErrors<T>(error: z.ZodError): FieldErrors<T> {
  const out: FieldErrors<T> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof T | undefined;
    if (key !== undefined && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Only the fields that changed (small outbox operations, clear intent). */
export function patchOf<T extends object>(
  before: T,
  fields: Record<string, unknown>,
): Partial<T> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (
      JSON.stringify((before as Record<string, unknown>)[k] ?? null) !==
      JSON.stringify(v ?? null)
    )
      patch[k] = v;
  }
  return patch as Partial<T>;
}

/* ------------------------------------------------------------------------------ */
/* Budgets                                                                          */
/* ------------------------------------------------------------------------------ */

const bt = es.planning.budgets.form.errors;

export type BudgetFormValues = {
  name: string;
  categoryId: string;
  amount: string;
  currency: string;
  period: string;
  startDate: string;
  endDate: string;
  description: string;
};
export type BudgetFieldErrors = FieldErrors<BudgetFormValues>;
type BudgetFields = Omit<Input<"budgets">, "status">;

/** The dates a period will really use (weekly/monthly/quarterly/yearly snap to the period containing the start date). */
export function budgetRange(
  period: string,
  startDate: string,
  endDate: string,
  firstDayOfWeek: "monday" | "sunday",
): { startDate: string; endDate: string } | null {
  if (
    !isLocalDate(startDate) ||
    !(BUDGET_PERIODS as readonly string[]).includes(period)
  )
    return null;
  if (period === "custom")
    return isLocalDate(endDate) ? { startDate, endDate } : null;
  const range = periodContaining(
    period as Budget["period"],
    startDate,
    firstDayOfWeek,
  );
  return {
    startDate: range.startDate,
    endDate: periodEnd(period as Budget["period"], range.startDate)!,
  };
}

export function emptyBudgetForm(
  today: string,
  currency: string,
): BudgetFormValues {
  return {
    name: "",
    categoryId: "",
    amount: "",
    currency,
    period: "monthly",
    startDate: today,
    endDate: today,
    description: "",
  };
}

export function budgetToForm(b: Budget): BudgetFormValues {
  return {
    name: b.name,
    categoryId: b.categoryId ?? "",
    amount: formatMoney(b.amount, { currency: b.currency }),
    currency: b.currency,
    period: b.period,
    startDate: b.startDate,
    endDate: b.endDate,
    description: b.description ?? "",
  };
}

export function parseBudgetForm(
  values: BudgetFormValues,
  firstDayOfWeek: "monday" | "sunday",
):
  | { ok: true; fields: BudgetFields }
  | { ok: false; errors: BudgetFieldErrors } {
  const schema = z
    .object({
      name: z
        .string()
        .trim()
        .min(1, bt.nameRequired)
        .max(80, bt.nameTooLong)
        .refine(noCardNumber, bt.cardNumber),
      categoryId: z.string(),
      amount: money({ required: bt.amountRequired, zero: bt.amountZero }),
      currency: z.enum(["ARS", "USD"]),
      period: z.enum(BUDGET_PERIODS),
      startDate: z.string().refine(isLocalDate, bt.startDate),
      endDate: z.string(),
      description: z
        .string()
        .trim()
        .max(200, bt.descriptionTooLong)
        .refine(noCardNumber, bt.cardNumber),
    })
    .superRefine((v, ctx) => {
      if (v.period !== "custom") return;
      if (!isLocalDate(v.endDate))
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: bt.endDate,
        });
      else if (v.endDate < v.startDate)
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: bt.endBeforeStart,
        });
    });
  const r = schema.safeParse(values);
  if (!r.success)
    return { ok: false, errors: fieldErrors<BudgetFormValues>(r.error) };
  const d = r.data;
  const range = budgetRange(d.period, d.startDate, d.endDate, firstDayOfWeek)!;
  return {
    ok: true,
    fields: {
      name: d.name,
      categoryId: d.categoryId === "" ? null : d.categoryId,
      amount: d.amount,
      currency: d.currency,
      period: d.period,
      startDate: range.startDate as Budget["startDate"],
      endDate: range.endDate as Budget["endDate"],
      description: d.description === "" ? null : d.description,
    },
  };
}

export const newBudgetInput = (fields: BudgetFields): Input<"budgets"> => ({
  ...fields,
  status: "active",
});

export function budgetSaveError(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "CONFLICT") return bt.conflict;
    if (error.code === "POSSIBLE_DUPLICATE") return bt.overlap;
    if (
      error.code === "VALIDATION_FAILED" ||
      error.code === "REFERENCE_CONSTRAINT"
    )
      return bt.category;
  }
  return bt.saveFailed;
}

/* ------------------------------------------------------------------------------ */
/* Goals                                                                            */
/* ------------------------------------------------------------------------------ */

const gt = es.planning.goals.form.errors;

export type GoalFormValues = {
  name: string;
  description: string;
  kind: string;
  amount: string;
  initialAmount: string;
  currency: string;
  startDate: string;
  targetDate: string;
};
export type GoalFieldErrors = FieldErrors<GoalFormValues>;
type GoalFields = Pick<
  Input<"goals">,
  | "name"
  | "description"
  | "kind"
  | "amount"
  | "initialAmount"
  | "currency"
  | "startDate"
  | "targetDate"
>;

export function emptyGoalForm(today: string, currency: string): GoalFormValues {
  return {
    name: "",
    description: "",
    kind: "emergency",
    amount: "",
    initialAmount: "0",
    currency,
    startDate: today,
    targetDate: "",
  };
}

export function goalToForm(g: Goal): GoalFormValues {
  return {
    name: g.name,
    description: g.description ?? "",
    kind: g.kind,
    amount: formatMoney(g.amount, { currency: g.currency }),
    initialAmount: formatMoney(g.initialAmount, { currency: g.currency }),
    currency: g.currency,
    startDate: g.startDate,
    targetDate: g.targetDate ?? "",
  };
}

export function parseGoalForm(
  values: GoalFormValues,
): { ok: true; fields: GoalFields } | { ok: false; errors: GoalFieldErrors } {
  const schema = z
    .object({
      name: z
        .string()
        .trim()
        .min(1, gt.nameRequired)
        .max(80, gt.nameTooLong)
        .refine(noCardNumber, gt.cardNumber),
      description: z
        .string()
        .trim()
        .max(200, gt.descriptionTooLong)
        .refine(noCardNumber, gt.cardNumber),
      kind: z.enum(GOAL_KINDS),
      amount: money({ required: gt.amountRequired, zero: gt.amountZero }),
      initialAmount: z.string().transform((v, ctx) => {
        if (v.trim() === "") return 0;
        const parsed = parseMoneyInput(v);
        if (!parsed.ok || parsed.value < 0) {
          ctx.addIssue({ code: "custom", message: gt.initialInvalid });
          return z.NEVER;
        }
        return parsed.value;
      }),
      currency: z.enum(["ARS", "USD"]),
      startDate: z.string().refine(isLocalDate, gt.startDate),
      targetDate: z.string(),
    })
    .superRefine((v, ctx) => {
      if (
        v.targetDate !== "" &&
        (!isLocalDate(v.targetDate) || v.targetDate < v.startDate)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["targetDate"],
          message: gt.targetBeforeStart,
        });
      }
    });
  const r = schema.safeParse(values);
  if (!r.success)
    return { ok: false, errors: fieldErrors<GoalFormValues>(r.error) };
  const d = r.data;
  return {
    ok: true,
    fields: {
      name: d.name,
      description: d.description === "" ? null : d.description,
      kind: d.kind,
      amount: d.amount,
      initialAmount: d.initialAmount,
      currency: d.currency,
      startDate: d.startDate as Goal["startDate"],
      targetDate: (d.targetDate === ""
        ? null
        : d.targetDate) as Goal["targetDate"],
    },
  };
}

export const newGoalInput = (fields: GoalFields): Input<"goals"> => ({
  ...fields,
  status: "active",
  completedAt: null,
  archivedAt: null,
});

export function goalSaveError(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "CONFLICT") return gt.conflict;
    if (
      error.code === "PROTECTED_OPERATION" ||
      error.code === "REFERENCE_CONSTRAINT"
    )
      return gt.closed;
  }
  return gt.saveFailed;
}

/* ------------------------------------------------------------------------------ */
/* Contributions                                                                    */
/* ------------------------------------------------------------------------------ */

const ct = es.planning.goals.contribution.errors;

export type ContributionFormValues = {
  amount: string;
  date: string;
  description: string;
  accountId: string;
  transactionId: string;
};
export type ContributionFieldErrors = FieldErrors<ContributionFormValues>;

export function parseContributionForm(
  values: ContributionFormValues,
  goal: Pick<Goal, "id" | "currency">,
):
  | { ok: true; input: Input<"goalContributions"> }
  | { ok: false; errors: ContributionFieldErrors } {
  const schema = z.object({
    amount: money({ required: ct.amountRequired, zero: ct.amountZero }),
    date: z.string().refine(isLocalDate, ct.date),
    description: z
      .string()
      .trim()
      .max(200, ct.descriptionTooLong)
      .refine(noCardNumber, ct.cardNumber),
    accountId: z.string(),
    transactionId: z.string(),
  });
  const r = schema.safeParse(values);
  if (!r.success)
    return { ok: false, errors: fieldErrors<ContributionFormValues>(r.error) };
  const d = r.data;
  return {
    ok: true,
    input: {
      goalId: goal.id,
      amount: d.amount,
      currency: goal.currency,
      date: d.date as Goal["startDate"],
      description: d.description === "" ? null : d.description,
      accountId: d.accountId === "" ? null : d.accountId,
      transactionId: d.transactionId === "" ? null : d.transactionId,
      cancelledAt: null,
    },
  };
}

export function contributionSaveError(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "PROTECTED_OPERATION")
      return error.message.includes("already backs") ? ct.linked : ct.closed;
  }
  return ct.saveFailed;
}
