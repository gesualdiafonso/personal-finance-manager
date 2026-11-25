import { z } from "zod";
import { ACCOUNT_TYPES, type Account } from "@/domain/schemas";
import { CURRENCY_CODES, isCurrencyCode, type CurrencyCode } from "@/domain/currency";
import { isAppError } from "@/lib/errors/app-error";
import { formatMoney, parseMoneyInput } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import type { Input } from "@/services/repositories/repositories";

/**
 * The account form's own schema (what the user types, as strings) and its conversion to the
 * domain input. The repository validates the domain record again (Step 02), so the form can
 * never store something the domain refuses; this layer only gives field-level Spanish errors.
 */
const t = es.accounts.form.errors;
const CARD_NUMBER = /\d(?:[ -]?\d){11,18}/;

export const MONEY_ERRORS = {
  empty: t.amountEmpty,
  invalid: t.amountInvalid,
  "too-many-decimals": t.amountDecimals,
  "out-of-range": t.amountRange,
} as const;

/** Amount typed as text → minor units; decimals allowed follow `currency` (none for CLP/PYG). */
export const moneyField = (options: { allowNegative?: boolean; currency?: CurrencyCode } = {}) =>
  z.string().transform((value, ctx) => {
    const parsed = parseMoneyInput(value, options);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: MONEY_ERRORS[parsed.error] });
      return z.NEVER;
    }
    return parsed.value as number;
  });

const name = z
  .string()
  .trim()
  .min(1, t.nameRequired)
  .max(80, t.nameTooLong)
  .refine((v) => !CARD_NUMBER.test(v), t.cardNumber);
const institution = z
  .string()
  .trim()
  .max(80, t.institutionTooLong)
  .refine((v) => !CARD_NUMBER.test(v), t.cardNumber);
const accountType = z.enum(ACCOUNT_TYPES, { error: t.type });
const currency = z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]], { error: t.currency });
/** The currency chosen in the form, when valid — decides how the amounts are read. */
export const formCurrency = (value: string): CurrencyCode => (isCurrencyCode(value) ? value : "ARS");

export const createAccountFormSchema = z.object({
  name,
  institution,
  accountType,
  currency,
  initialBalance: moneyField({ allowNegative: true }),
});
export const editAccountFormSchema = z.object({
  name,
  institution,
  accountType,
  currency,
  status: z.enum(["active", "archived"]),
});

export type AccountFormValues = {
  name: string;
  institution: string;
  accountType: string;
  currency: string;
  initialBalance: string;
  status: string;
};
export type FieldErrors = Partial<Record<keyof AccountFormValues, string>>;

export function emptyAccountForm(): AccountFormValues {
  return {
    name: "",
    institution: "",
    accountType: "checking",
    currency: "ARS",
    initialBalance: "",
    status: "active",
  };
}

export function accountToForm(a: Account): AccountFormValues {
  return {
    name: a.name,
    institution: a.institution ?? "",
    accountType: a.accountType,
    currency: a.currency,
    initialBalance: formatMoney(a.initialBalance, { currency: a.currency }),
    status: a.status,
  };
}

function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof AccountFormValues | undefined;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export function parseCreateForm(
  values: AccountFormValues,
): { ok: true; input: Input<"accounts"> } | { ok: false; errors: FieldErrors } {
  const r = createAccountFormSchema
    .extend({ initialBalance: moneyField({ allowNegative: true, currency: formCurrency(values.currency) }) })
    .safeParse(values);
  if (!r.success) return { ok: false, errors: fieldErrors(r.error) };
  return {
    ok: true,
    input: {
      name: r.data.name,
      institution: r.data.institution === "" ? null : r.data.institution,
      accountType: r.data.accountType,
      currency: r.data.currency,
      initialBalance: r.data.initialBalance,
      openingDate: null,
      status: "active",
    },
  };
}

export function parseEditForm(
  values: AccountFormValues,
):
  | { ok: true; patch: Partial<Input<"accounts">> }
  | { ok: false; errors: FieldErrors } {
  const r = editAccountFormSchema.safeParse(values);
  if (!r.success) return { ok: false, errors: fieldErrors(r.error) };
  return {
    ok: true,
    patch: {
      name: r.data.name,
      institution: r.data.institution === "" ? null : r.data.institution,
      accountType: r.data.accountType,
      currency: r.data.currency,
      status: r.data.status,
    },
  };
}

/** Maps a repository error to a form message (never echoes values). */
export function saveErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "CONFLICT") return t.conflict;
    if (error.code === "REFERENCE_CONSTRAINT")
      return es.accounts.form.currencyLocked;
  }
  return t.saveFailed;
}
