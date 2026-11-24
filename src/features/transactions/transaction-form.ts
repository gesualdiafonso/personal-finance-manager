import { isLocalDate } from "@/lib/formatting/date";
import { isAppError } from "@/lib/errors/app-error";
import { parseMoneyInput } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import type { Input } from "@/services/repositories/repositories";
import type { Transaction } from "@/domain/schemas";
import { formatMoney } from "@/lib/formatting/money";
import { MONEY_ERRORS } from "../accounts/account-form";
import type { TransactionFormData } from "./form-data";

/**
 * The transaction form: what the user types → the domain input. Field-level Spanish errors
 * here; the repository validates the full record again (schema, references, currency,
 * category type, card's paying account, archived references, duplicates).
 * The amount is always positive: the type decides the direction (Step 04 §7.5).
 */
const t = es.transactions.form.errors;
const CARD_NUMBER = /\d(?:[ -]?\d){11,18}/;

export type TransactionType = "expense" | "income" | "transfer";
export interface TransactionFormValues {
  type: TransactionType;
  amount: string;
  description: string;
  date: string;
  accountId: string;
  destinationAccountId: string;
  cardId: string;
  categoryId: string;
  status: "completed" | "pending";
  notes: string;
}
export type TransactionFieldErrors = Partial<
  Record<keyof TransactionFormValues, string>
>;

export function emptyTransactionForm(
  today: string,
  accountId = "",
  type: TransactionType = "expense",
): TransactionFormValues {
  return {
    type,
    amount: "",
    description: "",
    date: today,
    accountId,
    destinationAccountId: "",
    cardId: "",
    categoryId: "",
    status: "completed",
    notes: "",
  };
}

export function parseTransactionForm(
  v: TransactionFormValues,
  data: TransactionFormData,
):
  | { ok: true; input: Input<"transactions"> }
  | { ok: false; errors: TransactionFieldErrors } {
  const errors: TransactionFieldErrors = {};
  const description = v.description.trim();
  if (description === "") errors.description = t.descriptionRequired;
  else if (description.length > 140) errors.description = t.descriptionTooLong;
  else if (CARD_NUMBER.test(description)) errors.description = t.cardNumber;

  const amount = parseMoneyInput(v.amount);
  if (!amount.ok)
    errors.amount =
      amount.error === "empty" ? t.amountRequired : MONEY_ERRORS[amount.error];
  else if (amount.value <= 0) errors.amount = t.amountZero;

  if (!isLocalDate(v.date)) errors.date = t.date;

  const card =
    v.type === "expense" && v.cardId
      ? data.cards.find((c) => c.id === v.cardId)
      : undefined;
  if (v.type === "expense" && v.cardId && !card) errors.cardId = t.card;
  // With a card, the account is the card's paying account (Step 03 D3-03, D4-08).
  const accountId = card?.accountId ?? v.accountId;
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) errors.accountId = t.account;

  let destinationAccountId: string | null = null;
  if (v.type === "transfer") {
    const destination = data.accounts.find(
      (a) => a.id === v.destinationAccountId,
    );
    if (!destination) errors.destinationAccountId = t.destination;
    else if (destination.id === accountId)
      errors.destinationAccountId = t.sameAccount;
    else if (account && destination.currency !== account.currency)
      errors.destinationAccountId = t.crossCurrency; // D4-06
    destinationAccountId = destination?.id ?? null;
  }

  let categoryId: string | null = null;
  if (v.type !== "transfer" && v.categoryId) {
    const option = data.categories[v.type].find(
      (o) => o.category.id === v.categoryId,
    );
    if (!option) errors.categoryId = t.category;
    else categoryId = option.category.id;
  }

  const notes = v.notes.trim();
  if (notes.length > 500) errors.notes = t.notesTooLong;
  else if (CARD_NUMBER.test(notes)) errors.notes = t.cardNumber;

  if (Object.keys(errors).length > 0 || !account || !amount.ok)
    return { ok: false, errors };
  return {
    ok: true,
    input: {
      type: v.type,
      description,
      amount: amount.value,
      currency: account.currency,
      categoryId,
      accountId: account.id,
      destinationAccountId,
      cardId: card?.id ?? null,
      date: v.date as Input<"transactions">["date"],
      status: v.status,
      notes: notes === "" ? null : notes,
      billId: null,
      recurrenceId: null,
    },
  };
}

export function transactionSaveError(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "REFERENCE_CONSTRAINT") return t.inactive;
    if (error.code === "CURRENCY_MISMATCH") return t.currency;
  }
  return t.saveFailed;
}

/** Form values of a stored transaction (edit mode). */
export function transactionToForm(tx: Transaction): TransactionFormValues {
  return {
    type: tx.type,
    amount: formatMoney(tx.amount, { currency: tx.currency }),
    description: tx.description,
    date: tx.date,
    accountId: tx.accountId,
    destinationAccountId: tx.destinationAccountId ?? "",
    cardId: tx.cardId ?? "",
    categoryId: tx.categoryId ?? "",
    status: tx.status === "pending" ? "pending" : "completed",
    notes: tx.notes ?? "",
  };
}

/** The editable part of a parsed input (D4-01: never the type; bill/recurrence links are kept). */
export function editPatch(
  input: Input<"transactions">,
): Omit<Input<"transactions">, "type" | "billId" | "recurrenceId"> {
  const patch: Partial<Input<"transactions">> = { ...input };
  delete patch.type;
  delete patch.billId;
  delete patch.recurrenceId;
  return patch as Omit<
    Input<"transactions">,
    "type" | "billId" | "recurrenceId"
  >;
}
