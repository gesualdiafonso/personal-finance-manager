"use client";

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { isCreditCardPurchase, type CardTypes } from "@/domain/rules/balances";
import {
  canCancel,
  canDelete,
  listedAmount,
} from "@/domain/rules/transactions";
import type { Account, Card, Category, Transaction } from "@/domain/schemas";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFeedback } from "@/components/ui/feedback";
import { Field, inputClass } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { mutate } from "@/hooks/use-local-data";
import { isAppError } from "@/lib/errors/app-error";
import { formatDate, type LocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import type { TransactionFormData } from "./form-data";
import { TransactionForm } from "./transaction-sheet";

const t = es.transactions.detail;
const f = es.transactions.form;

export interface DetailContext {
  accounts: Account[];
  categories: Category[];
  cards: Card[];
  cardTypes: CardTypes;
  form: TransactionFormData;
}

/**
 * Transaction detail in the side sheet (D4-10; Ledger: a click opens the sheet). Shows every
 * field unambiguously, then the allowed actions: edit (D4-05), cancel — final, audited, the
 * record is kept (D4-03) — and delete, only for pending or cancelled movements (D4-04).
 */
export function TransactionDetailSheet({
  transaction,
  context,
  onClose,
}: {
  transaction: Transaction | null;
  context: DetailContext;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const close = () => {
    setMode("view");
    onClose();
  };
  const title =
    mode === "edit"
      ? transaction?.status === "cancelled"
        ? f.editNotesTitle
        : f.editTitle
      : t.title;
  return (
    <Sheet
      open={transaction !== null}
      onClose={close}
      title={title}
      testId="transaction-detail"
    >
      {transaction &&
        (mode === "view" ? (
          <DetailView
            key={transaction.id + transaction.rev}
            tx={transaction}
            context={context}
            onEdit={() => setMode("edit")}
            onDone={close}
          />
        ) : transaction.status === "cancelled" ? (
          <NotesForm tx={transaction} onDone={close} />
        ) : (
          <TransactionForm
            data={withOwnReferences(context, transaction)}
            transaction={transaction}
            onDone={close}
          />
        ))}
    </Sheet>
  );
}

/** The movement's own account(s), card and category stay selectable even if archived since (D4-07). */
function withOwnReferences(
  c: DetailContext,
  tx: Transaction,
): TransactionFormData {
  const accounts = [...c.form.accounts];
  for (const id of [tx.accountId, tx.destinationAccountId]) {
    const a = id ? c.accounts.find((x) => x.id === id) : undefined;
    if (a && !accounts.some((x) => x.id === a.id)) accounts.push(a);
  }
  const cards = [...c.form.cards];
  const card = tx.cardId ? c.cards.find((x) => x.id === tx.cardId) : undefined;
  if (card && !cards.some((x) => x.id === card.id)) cards.push(card);
  const categories = {
    income: [...c.form.categories.income],
    expense: [...c.form.categories.expense],
  };
  const cat = tx.categoryId
    ? c.categories.find((x) => x.id === tx.categoryId)
    : undefined;
  if (cat && !categories[cat.type].some((o) => o.category.id === cat.id))
    categories[cat.type].push({ category: cat, label: cat.name });
  return { accounts, cards, categories };
}

function Row({
  term,
  children,
  testId,
}: {
  term: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 border-b border-line py-2.5"
      data-testid={testId}
    >
      <dt className="type-body-sm text-ink-2">{term}</dt>
      <dd className="text-right type-body">{children}</dd>
    </div>
  );
}

function DetailView({
  tx,
  context,
  onEdit,
  onDone,
}: {
  tx: Transaction;
  context: DetailContext;
  onEdit: () => void;
  onDone: () => void;
}) {
  const feedback = useFeedback();
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const account = (id: string | null) =>
    id ? (context.accounts.find((a) => a.id === id)?.name ?? t.none) : t.none;
  const category = useMemo(() => {
    const c = tx.categoryId
      ? context.categories.find((x) => x.id === tx.categoryId)
      : undefined;
    const parent = c?.parentId
      ? context.categories.find((x) => x.id === c.parentId)
      : undefined;
    return c ? (parent ? `${parent.name} › ${c.name}` : c.name) : t.none;
  }, [tx.categoryId, context.categories]);
  const card = tx.cardId
    ? context.cards.find((c) => c.id === tx.cardId)
    : undefined;
  const amount = listedAmount(tx);

  async function run(action: "cancel" | "delete") {
    if (running.current) return; // no repeated reversals
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "cancel")
        await mutate((r) =>
          r.transactions.update(tx.id, { status: "cancelled" }, tx.rev),
        );
      else await mutate((r) => r.transactions.delete(tx.id, tx.rev));
      feedback(action === "cancel" ? t.cancelled : t.removed);
      setConfirm(null);
      onDone();
    } catch (err) {
      setConfirm(null);
      setError(
        isAppError(err) && err.code === "CONFLICT"
          ? t.conflict
          : isAppError(err) && err.code === "PROTECTED_OPERATION"
            ? t.removeBlocked
            : t.actionFailed,
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div data-testid="transaction-detail-view">
        <p
          className={cn(
            "type-heading",
            tx.status === "cancelled" && "text-ink-2 line-through",
          )}
        >
          {tx.description}
        </p>
        <p className="mt-2 type-amount-xl" data-testid="detail-amount">
          <Money
            amount={amount.amount}
            currency={tx.currency}
            sign={amount.sign}
          />
        </p>
        <div className="mt-2">
          <Badge
            tone={
              tx.status === "completed"
                ? "positive"
                : tx.status === "pending"
                  ? "soon"
                  : "neutral"
            }
          >
            {es.movements.statuses[tx.status]}
          </Badge>
        </div>
        {tx.status === "pending" && (
          <p className="mt-2 type-caption text-ink-2">{t.pendingNote}</p>
        )}
        {tx.status === "cancelled" && (
          <p className="mt-2 type-caption text-ink-2">{t.cancelledNote}</p>
        )}
        {isCreditCardPurchase(tx, context.cardTypes) && (
          <p className="mt-2 type-caption text-ink-2">{t.creditNote}</p>
        )}

        <dl className="mt-5">
          <Row term={t.type}>{es.movements.types[tx.type]}</Row>
          <Row term={t.date}>{formatDate(tx.date as LocalDate, "long")}</Row>
          {tx.type === "transfer" ? (
            <>
              <Row term={t.from} testId="detail-from">
                {account(tx.accountId)}
              </Row>
              <Row term={t.to} testId="detail-to">
                {account(tx.destinationAccountId)}
              </Row>
              <Row term={t.debited}>
                <Money
                  amount={-tx.amount}
                  currency={tx.currency}
                  sign="explicit"
                />
              </Row>
              <Row term={t.credited}>
                <Money
                  amount={tx.amount}
                  currency={tx.currency}
                  sign="explicit"
                />
              </Row>
            </>
          ) : (
            <>
              <Row term={t.account}>{account(tx.accountId)}</Row>
              <Row term={t.category}>{category}</Row>
              {tx.type === "expense" && (
                <Row term={t.card}>
                  {card
                    ? `${card.name}${card.lastFourDigits ? ` ··${card.lastFourDigits}` : ""} · ${es.cards.types[card.cardType]}`
                    : t.none}
                </Row>
              )}
            </>
          )}
          <Row term={t.currency}>{es.common.currencies[tx.currency]}</Row>
          <Row term={t.notes}>{tx.notes ?? t.none}</Row>
          <Row term={t.createdAt}>
            {formatDate(tx.createdAt.slice(0, 10) as LocalDate, "form")}
          </Row>
          <Row term={t.updatedAt}>
            {formatDate(tx.updatedAt.slice(0, 10) as LocalDate, "form")}
          </Row>
        </dl>
        {tx.type === "transfer" && (
          <p className="mt-2 type-caption text-ink-2">{t.sameAmount}</p>
        )}

        {error && (
          <p role="alert" className="mt-4 type-body-sm text-alert-text">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            {canCancel(tx) && (
              <Button
                variant="ghost"
                className="text-alert-text"
                onClick={() => setConfirm("cancel")}
                disabled={busy}
              >
                {t.cancel}
              </Button>
            )}
            {canDelete(tx) && (
              <Button
                variant="ghost"
                className="text-alert-text"
                onClick={() => setConfirm("delete")}
                disabled={busy}
              >
                {t.remove}
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={onEdit} disabled={busy}>
            {tx.status === "cancelled" ? t.editNotes : t.edit}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm === "cancel"}
        title={t.cancelTitle}
        confirmLabel={t.cancelConfirm}
        destructive
        busy={busy}
        onConfirm={() => void run("cancel")}
        onCancel={() => setConfirm(null)}
      >
        {t.cancelBody}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "delete"}
        title={t.removeTitle}
        confirmLabel={t.removeConfirm}
        destructive
        busy={busy}
        onConfirm={() => void run("delete")}
        onCancel={() => setConfirm(null)}
      >
        {t.removeBody}
      </ConfirmDialog>
    </>
  );
}

/** A cancelled movement is final: only its notes can change (D4-03). */
function NotesForm({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const feedback = useFeedback();
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const value = notes.trim();
    if (value.length > 500) return setError(f.errors.notesTooLong);
    if (/\d(?:[ -]?\d){11,18}/.test(value))
      return setError(f.errors.cardNumber);
    setSaving(true);
    try {
      await mutate((r) =>
        r.transactions.update(
          tx.id,
          { notes: value === "" ? null : value },
          tx.rev,
        ),
      );
      feedback(f.updated);
      onDone();
    } catch {
      setError(f.errors.saveFailed);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={f.editNotesTitle}
      className="grid gap-5"
    >
      <p className="type-body-sm text-ink-2">{f.cancelledLocked}</p>
      <Field label={f.notes} error={error}>
        {(p) => (
          <textarea
            {...p}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={600}
            className={cn(inputClass, "h-auto py-2")}
            data-autofocus
          />
        )}
      </Field>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onDone}
          disabled={saving}
        >
          {es.common.cancel}
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? es.common.saving : f.saveChanges}
        </Button>
      </div>
    </form>
  );
}
