"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  canCancelBill,
  canDeleteBill,
  canEditBill,
} from "@/domain/rules/bills";
import { Money } from "@/components/shared/money";
import { LocalOnlyMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFeedback } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { mutate } from "@/hooks/use-local-data";
import { isAppError } from "@/lib/errors/app-error";
import { formatDate, type LocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { BillForm, type BillFormContext } from "./bill-sheet";
import { BillStatusBadge } from "./bill-status";
import { categoryLabel, type BillRow } from "./data";

const t = es.bills.detail;

/**
 * Bill detail in the side sheet: amount, what was paid and what is left (derived, D5-02),
 * the derived status (D5-03), then the allowed actions — edit (pending only; a closed bill
 * only changes its notes), cancel (final; payments are kept, D5-07) and delete (only a bill
 * that never had a payment).
 */
export function BillDetailSheet({
  row,
  context,
  onClose,
}: {
  row: BillRow | null;
  context: BillFormContext;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const close = () => {
    setMode("view");
    onClose();
  };
  const closed = row !== null && row.bill.status !== "pending";
  return (
    <Sheet
      open={row !== null}
      onClose={close}
      title={
        mode === "edit"
          ? closed
            ? t.editNotes
            : es.bills.form.editTitle
          : t.title
      }
      testId="bill-detail"
    >
      {row &&
        (mode === "view" ? (
          <DetailView
            key={row.bill.id + row.bill.rev}
            row={row}
            context={context}
            onEdit={() => setMode("edit")}
            onDone={close}
          />
        ) : (
          <BillForm
            key={row.bill.id + row.bill.rev}
            bill={row.bill}
            hasPayments={row.payments.length > 0}
            context={context}
            onDone={() => setMode("view")}
          />
        ))}
    </Sheet>
  );
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
  row,
  context,
  onEdit,
  onDone,
}: {
  row: BillRow;
  context: BillFormContext;
  onEdit: () => void;
  onDone: () => void;
}) {
  const { bill, balance } = row;
  const feedback = useFeedback();
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const payments = row.payments.filter((p) => p.status !== "cancelled").length;
  const deletable = canDeleteBill(bill, row.payments);

  async function run(action: "cancel" | "delete") {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "cancel")
        await mutate((r) =>
          r.bills.update(bill.id, { status: "cancelled" }, bill.rev),
        );
      else await mutate((r) => r.bills.delete(bill.id, bill.rev));
      feedback(action === "cancel" ? t.cancelled : t.removed);
      setConfirm(null);
      onDone();
    } catch (err) {
      setConfirm(null);
      setError(
        isAppError(err) && err.code === "CONFLICT"
          ? t.conflict
          : isAppError(err) && err.code === "REFERENCE_CONSTRAINT"
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
      <div data-testid="bill-detail-view">
        <p
          className={cn(
            "type-heading",
            bill.status === "cancelled" && "text-ink-2 line-through",
          )}
        >
          {bill.name}
        </p>
        <p className="mt-2 type-amount-xl" data-testid="bill-detail-remaining">
          <Money
            amount={bill.status === "pending" ? balance.remaining : bill.amount}
            currency={bill.currency}
          />
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <BillStatusBadge row={row} />
          {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
        </div>
        {bill.status !== "pending" && (
          <p className="mt-2 type-caption text-ink-2">{t.closedNote}</p>
        )}

        <dl className="mt-5">
          <Row term={t.amount}>
            <Money amount={bill.amount} currency={bill.currency} />
          </Row>
          <Row term={t.paid} testId="bill-detail-paid">
            <Money amount={balance.paid} currency={bill.currency} />
          </Row>
          {bill.status === "pending" && (
            <Row term={t.remaining}>
              <Money amount={balance.remaining} currency={bill.currency} />
            </Row>
          )}
          <Row term={t.dueDate}>
            {formatDate(bill.dueDate as LocalDate, "long")}
          </Row>
          <Row term={t.category}>
            {categoryLabel(row.category, context.allCategories) ?? t.none}
          </Row>
          <Row term={t.account}>{row.account?.name ?? t.none}</Row>
          <Row term={t.currency}>{es.common.currencies[bill.currency]}</Row>
          {bill.description && (
            <Row term={t.description}>{bill.description}</Row>
          )}
          <Row term={t.notes}>{bill.notes ?? t.none}</Row>
          <Row term={t.origin}>
            {bill.recurrenceId && bill.occurrenceDate
              ? t.fromRecurrence(
                  formatDate(bill.occurrenceDate as LocalDate, "form"),
                )
              : t.manual}
          </Row>
          <Row term={t.createdAt}>
            {formatDate(bill.createdAt.slice(0, 10) as LocalDate, "form")}
          </Row>
          <Row term={t.updatedAt}>
            {formatDate(bill.updatedAt.slice(0, 10) as LocalDate, "form")}
          </Row>
        </dl>

        {error && (
          <p role="alert" className="mt-4 type-body-sm text-alert-text">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            {canCancelBill(bill) && (
              <Button
                variant="ghost"
                className="text-alert-text"
                onClick={() => setConfirm("cancel")}
                disabled={busy}
              >
                {t.cancel}
              </Button>
            )}
            {deletable && (
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
            {canEditBill(bill) ? t.edit : t.editNotes}
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
        {payments > 0 ? t.cancelBodyWithPayments(payments) : t.cancelBody}
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
