"use client";

import { useRef, useState, type ReactNode } from "react";
import { Money } from "@/components/shared/money";
import { LocalOnlyMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFeedback } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { mutate } from "@/hooks/use-local-data";
import { isAppError } from "@/lib/errors/app-error";
import { formatDate, type LocalDate } from "@/lib/formatting/date";
import { formatMoney } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { BudgetForm, type BudgetFormContext } from "./budget-form";
import { categoryLabel, type BudgetRow } from "./data";
import { BudgetStateBadge, ProgressBar, budgetBarTone } from "./ui";

const t = es.planning.budgets.detail;
const EXPENSES_SHOWN = 20;

export function BudgetDetailSheet({
  row,
  context,
  onClose,
}: {
  row: BudgetRow | null;
  context: BudgetFormContext;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const close = () => {
    setMode("view");
    onClose();
  };
  return (
    <Sheet
      open={row !== null}
      onClose={close}
      title={mode === "edit" ? es.planning.budgets.form.editTitle : t.title}
      testId="budget-detail"
    >
      {row &&
        (mode === "view" ? (
          <BudgetView
            key={row.budget.id + row.budget.rev}
            row={row}
            context={context}
            onEdit={() => setMode("edit")}
            onDone={close}
          />
        ) : (
          <BudgetForm
            key={row.budget.id + row.budget.rev}
            budget={row.budget}
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

const money = (amount: number, currency: "ARS" | "USD") =>
  formatMoney(amount, { currency });

/** Usage, history against the same limit and the expenses counted; edit, archive and delete. */
function BudgetView({
  row,
  context,
  onEdit,
  onDone,
}: {
  row: BudgetRow;
  context: BudgetFormContext;
  onEdit: () => void;
  onDone: () => void;
}) {
  const { budget, usage } = row;
  const feedback = useFeedback();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const exceeded = usage.state === "exceeded";
  const maxSpent = Math.max(
    budget.amount,
    ...row.history.map((h) => h.spent),
    1,
  );

  async function run(action: "archive" | "unarchive" | "delete") {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "delete")
        await mutate((r) => r.budgets.delete(budget.id, budget.rev));
      else
        await mutate((r) =>
          r.budgets.update(
            budget.id,
            { status: action === "archive" ? "archived" : "active" },
            budget.rev,
          ),
        );
      feedback(
        action === "delete"
          ? t.removed
          : action === "archive"
            ? t.archivedDone
            : t.unarchivedDone,
      );
      setConfirm(false);
      if (action === "delete") onDone();
    } catch (err) {
      setConfirm(false);
      setError(
        isAppError(err) && err.code === "CONFLICT"
          ? t.conflict
          : isAppError(err) && err.code === "POSSIBLE_DUPLICATE"
            ? t.overlap
            : t.actionFailed,
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div data-testid="budget-detail-view">
        <p className="type-heading">{budget.name}</p>
        <p className="mt-1 type-body-sm text-ink-2">
          {categoryLabel(row.category, context.allCategories) ??
            es.planning.budgets.general}{" "}
          · {es.planning.periods[budget.period]}
        </p>
        <p className="mt-3 type-label text-ink-2">
          {exceeded ? t.over : t.remaining}
        </p>
        <p
          className={cn("mt-1 type-amount-xl", exceeded && "text-alert-text")}
          data-testid="budget-detail-remaining"
        >
          <Money
            amount={exceeded ? usage.over : usage.remaining}
            currency={budget.currency}
            attention={exceeded}
          />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <BudgetStateBadge state={usage.state} />
          {row.archived && (
            <span className="type-caption text-ink-2">{t.archived}</span>
          )}
          {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
        </div>
        <div className="mt-4">
          <ProgressBar
            percent={usage.percent}
            tone={budgetBarTone(usage.state)}
            label={t.used}
            valueText={es.planning.budgets.percent(usage.percent)}
            pace={row.pace}
            size="thick"
          />
          <p className="mt-2 flex flex-wrap justify-between gap-2 type-caption text-ink-2">
            <span>
              {es.planning.budgets.spentOf(
                money(usage.spent, budget.currency),
                money(budget.amount, budget.currency),
              )}
            </span>
            {row.pace !== null && (
              <span>{es.planning.budgets.pace(row.pace)}</span>
            )}
          </p>
        </div>

        <dl className="mt-5">
          <Row term={t.limit}>
            <Money amount={budget.amount} currency={budget.currency} />
          </Row>
          <Row term={t.spent} testId="budget-detail-spent">
            <Money amount={usage.spent} currency={budget.currency} />
          </Row>
          <Row term={t.used} testId="budget-detail-percent">
            {es.planning.budgets.percent(usage.percent)}
          </Row>
          {usage.pending > 0 && (
            <Row term={t.pendingNote}>
              <Money amount={usage.pending} currency={budget.currency} />
            </Row>
          )}
          <Row term={t.dates}>
            {formatDate(budget.startDate as LocalDate, "form")} –{" "}
            {formatDate(budget.endDate as LocalDate, "form")}
          </Row>
          <Row term={t.status}>
            {row.archived ? t.archived : es.planning.timing[row.timing]}
          </Row>
          <Row term={t.currency}>{es.common.currencies[budget.currency]}</Row>
          {budget.description && (
            <Row term={t.description}>{budget.description}</Row>
          )}
        </dl>
        <p className="mt-3 type-caption text-ink-2">{t.rules}</p>

        <section aria-labelledby="budget-history" className="mt-6">
          <h3 id="budget-history" className="type-subheading">
            {t.history}
          </h3>
          <p className="mt-1 type-caption text-ink-2">{t.historyHint}</p>
          <ol
            className="mt-3 grid grid-cols-6 items-end gap-2"
            data-testid="budget-history"
          >
            {row.history.map((h) => (
              <li
                key={h.from}
                className="grid justify-items-center gap-1"
                title={money(h.spent, budget.currency)}
              >
                <span className="relative flex h-20 w-full max-w-8 items-end overflow-hidden rounded-xs bg-paper-2">
                  <span
                    className={cn(
                      "block w-full",
                      h.state === "exceeded"
                        ? "bg-alert"
                        : h.state !== "within"
                          ? "bg-warning"
                          : h.current
                            ? "bg-forest"
                            : "bg-sage",
                    )}
                    style={{
                      height: `${Math.max(2, Math.round((h.spent * 100) / maxSpent))}%`,
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 h-px bg-ink"
                    style={{
                      bottom: `${Math.round((budget.amount * 100) / maxSpent)}%`,
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "type-caption",
                    h.current ? "text-ink" : "text-ink-2",
                  )}
                >
                  {formatDate(h.from as LocalDate)}
                </span>
                <span className="sr-only">
                  {money(h.spent, budget.currency)} ·{" "}
                  {es.planning.budgetStates[h.state]}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="budget-expenses" className="mt-6">
          <h3 id="budget-expenses" className="type-subheading">
            {t.expenses}
          </h3>
          {row.expenses.length === 0 ? (
            <p className="mt-2 type-body-sm text-ink-2">{t.expensesNone}</p>
          ) : (
            <ul className="mt-2" data-testid="budget-expenses">
              {row.expenses.slice(0, EXPENSES_SHOWN).map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate type-body">
                      {tx.description}
                    </span>
                    <span className="type-caption text-ink-2">
                      {formatDate(tx.date as LocalDate)}
                      {tx.status === "pending" && ` · ${t.pendingTag}`}
                    </span>
                  </span>
                  <Money
                    amount={tx.amount}
                    currency={tx.currency}
                    className={cn(
                      "type-amount",
                      tx.status === "pending" && "text-ink-2",
                    )}
                  />
                </li>
              ))}
              {row.expenses.length > EXPENSES_SHOWN && (
                <li className="pt-2 type-caption text-ink-2">
                  {t.expensesMore(row.expenses.length - EXPENSES_SHOWN)}
                </li>
              )}
            </ul>
          )}
        </section>

        {error && (
          <p role="alert" className="mt-4 type-body-sm text-alert-text">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => void run(row.archived ? "unarchive" : "archive")}
              disabled={busy}
            >
              {row.archived ? t.unarchive : t.archive}
            </Button>
            <Button
              variant="ghost"
              className="text-alert-text"
              onClick={() => setConfirm(true)}
              disabled={busy}
            >
              {t.remove}
            </Button>
          </div>
          {!row.archived && (
            <Button variant="secondary" onClick={onEdit} disabled={busy}>
              {t.edit}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t.removeTitle}
        confirmLabel={t.removeConfirm}
        destructive
        busy={busy}
        onConfirm={() => void run("delete")}
        onCancel={() => setConfirm(false)}
      >
        {t.removeBody}
      </ConfirmDialog>
    </>
  );
}
