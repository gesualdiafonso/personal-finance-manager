import { z } from "zod";
import { CARD_TYPES, type Account, type Card } from "@/domain/schemas";
import { isAppError } from "@/lib/errors/app-error";
import { formatMoney } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import type { Input } from "@/services/repositories/repositories";
import { moneyField } from "../accounts/account-form";

/**
 * Card form: what the user types (strings) → domain input. Only credit cards get a limit and
 * statement days (D3-01); the currency is always the paying account's (D2-02). There is no
 * field for a full number, CVV, PIN or any credential, and the repository's strict schema
 * refuses any extra field (Step 03 §5).
 */
const t = es.cards.form.errors;
const CARD_NUMBER = /\d(?:[ -]?\d){11,18}/;
const day = z
  .string()
  .trim()
  .regex(/^\d{1,2}$/, t.day)
  .transform(Number)
  .refine((n) => n >= 1 && n <= 31, t.day);

const base = z.object({
  name: z
    .string()
    .trim()
    .min(1, t.nameRequired)
    .max(60, t.nameTooLong)
    .refine((v) => !CARD_NUMBER.test(v), t.cardNumber),
  cardType: z.enum(CARD_TYPES, { error: t.type }),
  accountId: z.string().min(1, t.account),
  lastFourDigits: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}$/.test(v), t.lastFour),
  creditLimit: z.string(),
  closingDay: z.string(),
  dueDay: z.string(),
  status: z.enum(["active", "inactive"]),
});

export type CardFormValues = z.input<typeof base>;
export type CardFieldErrors = Partial<Record<keyof CardFormValues, string>>;

export function emptyCardForm(accountId = ""): CardFormValues {
  return {
    name: "",
    cardType: "credit",
    accountId,
    lastFourDigits: "",
    creditLimit: "",
    closingDay: "",
    dueDay: "",
    status: "active",
  };
}

export function cardToForm(c: Card): CardFormValues {
  return {
    name: c.name,
    cardType: c.cardType,
    accountId: c.accountId ?? "",
    lastFourDigits: c.lastFourDigits ?? "",
    creditLimit:
      c.creditLimit === null
        ? ""
        : formatMoney(c.creditLimit, { currency: c.currency }),
    closingDay: c.closingDay === null ? "" : String(c.closingDay),
    dueDay: c.dueDay === null ? "" : String(c.dueDay),
    status: c.status,
  };
}

export function parseCardForm(
  values: CardFormValues,
  accounts: readonly Account[],
):
  { ok: true; input: Input<"cards"> } | { ok: false; errors: CardFieldErrors } {
  const errors: CardFieldErrors = {};
  const r = base.safeParse(values);
  if (!r.success)
    for (const i of r.error.issues)
      errors[i.path[0] as keyof CardFormValues] ??= i.message;
  const account = accounts.find((a) => a.id === values.accountId);
  if (values.accountId && !account) errors.accountId = t.account;

  let creditLimit: number | null = null;
  let closingDay: number | null = null;
  let dueDay: number | null = null;
  if (values.cardType === "credit") {
    if (values.creditLimit.trim() !== "") {
      const limit = moneyField({ currency: account?.currency }).safeParse(values.creditLimit);
      if (limit.success) creditLimit = limit.data;
      else errors.creditLimit = limit.error.issues[0]!.message;
    }
    const c = day.safeParse(values.closingDay);
    if (c.success) closingDay = c.data;
    else errors.closingDay = t.day;
    const d = day.safeParse(values.dueDay);
    if (d.success) dueDay = d.data;
    else errors.dueDay = t.day;
  }
  if (!r.success || Object.keys(errors).length > 0 || !account)
    return { ok: false, errors };
  return {
    ok: true,
    input: {
      name: r.data.name,
      cardType: r.data.cardType,
      accountId: account.id,
      currency: account.currency,
      lastFourDigits:
        r.data.lastFourDigits === "" ? null : r.data.lastFourDigits,
      creditLimit,
      closingDay,
      dueDay,
      status: r.data.status,
    },
  };
}

export function cardSaveErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "CONFLICT") return t.conflict;
    if (error.code === "REFERENCE_CONSTRAINT") return t.locked;
    if (error.code === "CURRENCY_MISMATCH") return t.currency;
  }
  return t.saveFailed;
}
