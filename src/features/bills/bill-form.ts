import { z } from "zod";
import type { Account, Bill } from "@/domain/schemas";
import { isAppError } from "@/lib/errors/app-error";
import { formatMoney, parseMoneyInput } from "@/lib/formatting/money";
import { isLocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import type { Input } from "@/services/repositories/repositories";
import { MONEY_ERRORS } from "../accounts/account-form";

/**
 * The bill form's own schema (strings as typed) and its conversion to the domain input. The
 * repository validates the record again and applies the bill policy (new bills are pending,
 * "paid" follows the payments, closed bills only change their notes — D5-03/D5-04).
 */
const t = es.bills.form.errors;
const CARD_NUMBER = /\d(?:[ -]?\d){11,18}/;
const noCardNumber = (v: string) => !CARD_NUMBER.test(v);

export type BillFormValues = {
  name: string;
  description: string;
  amount: string;
  currency: string;
  dueDate: string;
  categoryId: string;
  accountId: string;
  notes: string;
};
export type BillFieldErrors = Partial<Record<keyof BillFormValues, string>>;

export function billFormSchema(accounts: readonly Account[]) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t.nameRequired)
        .max(80, t.nameTooLong)
        .refine(noCardNumber, t.cardNumber),
      description: z
        .string()
        .trim()
        .max(200, t.descriptionTooLong)
        .refine(noCardNumber, t.cardNumber),
      amount: z.string().transform((value, ctx) => {
        const parsed = parseMoneyInput(value);
        if (!parsed.ok) {
          ctx.addIssue({
            code: "custom",
            message:
              parsed.error === "empty"
                ? es.transactions.form.errors.amountRequired
                : MONEY_ERRORS[parsed.error],
          });
          return z.NEVER;
        }
        if (parsed.value <= 0) {
          ctx.addIssue({
            code: "custom",
            message: es.transactions.form.errors.amountZero,
          });
          return z.NEVER;
        }
        return parsed.value;
      }),
      currency: z.enum(["ARS", "USD"], { error: t.currency }),
      dueDate: z.string().refine(isLocalDate, t.dueDate),
      categoryId: z.string(),
      accountId: z.string(),
      notes: z
        .string()
        .trim()
        .max(500, t.notesTooLong)
        .refine(noCardNumber, t.cardNumber),
    })
    .superRefine((v, ctx) => {
      const account = accounts.find((a) => a.id === v.accountId);
      if (v.accountId && account && account.currency !== v.currency)
        ctx.addIssue({
          code: "custom",
          path: ["accountId"],
          message: t.accountCurrency,
        });
    });
}

export function emptyBillForm(today: string, currency: string): BillFormValues {
  return {
    name: "",
    description: "",
    amount: "",
    currency,
    dueDate: today,
    categoryId: "",
    accountId: "",
    notes: "",
  };
}

export function billToForm(b: Bill): BillFormValues {
  return {
    name: b.name,
    description: b.description ?? "",
    amount: formatMoney(b.amount, { currency: b.currency }),
    currency: b.currency,
    dueDate: b.dueDate,
    categoryId: b.categoryId ?? "",
    accountId: b.accountId ?? "",
    notes: b.notes ?? "",
  };
}

function fieldErrors(error: z.ZodError): BillFieldErrors {
  const out: BillFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof BillFormValues | undefined;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

type BillFields = Omit<
  Input<"bills">,
  "status" | "recurrenceId" | "occurrenceDate"
>;

export function parseBillForm(
  values: BillFormValues,
  accounts: readonly Account[],
): { ok: true; fields: BillFields } | { ok: false; errors: BillFieldErrors } {
  const r = billFormSchema(accounts).safeParse(values);
  if (!r.success) return { ok: false, errors: fieldErrors(r.error) };
  const d = r.data;
  return {
    ok: true,
    fields: {
      name: d.name,
      description: d.description === "" ? null : d.description,
      amount: d.amount,
      currency: d.currency,
      dueDate: d.dueDate,
      categoryId: d.categoryId === "" ? null : d.categoryId,
      accountId: d.accountId === "" ? null : d.accountId,
      notes: d.notes === "" ? null : d.notes,
    },
  };
}

export const newBillInput = (fields: BillFields): Input<"bills"> => ({
  ...fields,
  status: "pending",
  recurrenceId: null,
  occurrenceDate: null,
});

/** Only the fields that changed (keeps the outbox operation small and the intent clear). */
export function billPatch(
  before: Bill,
  fields: BillFields,
): Partial<Input<"bills">> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (
      JSON.stringify((before as Record<string, unknown>)[k] ?? null) !==
      JSON.stringify(v)
    )
      patch[k] = v;
  }
  return patch as Partial<Input<"bills">>;
}

/** Maps a repository error to a form message (never echoes values). */
export function billSaveErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "CONFLICT") return t.conflict;
    if (error.code === "CURRENCY_MISMATCH") return t.accountCurrency;
    if (error.code === "PROTECTED_OPERATION") return t.closed;
    if (error.code === "REFERENCE_CONSTRAINT") return t.inactive;
    if (error.code === "VALIDATION_FAILED") return t.category;
  }
  return t.saveFailed;
}
