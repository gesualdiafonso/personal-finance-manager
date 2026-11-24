"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  canArchiveGoal,
  canCompleteGoal,
  canContribute,
  canDeleteGoal,
  canEditGoal,
} from "@/domain/rules/goals";
import type { Account, GoalContribution, Transaction } from "@/domain/schemas";
import { Money } from "@/components/shared/money";
import { LocalOnlyMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { isAppError } from "@/lib/errors/app-error";
import {
  formatDate,
  toIsoWithOffset,
  type LocalDate,
} from "@/lib/formatting/date";
import { formatMoney } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import type { GoalRow } from "./data";
import {
  contributionSaveError,
  parseContributionForm,
  type ContributionFieldErrors,
  type ContributionFormValues,
} from "./forms";
import { GoalForm, type GoalFormContext } from "./goal-form";
import { GoalStatusBadge, ProgressBar } from "./ui";

const t = es.planning.goals.detail;
const ct = es.planning.goals.contribution;

export interface GoalDetailContext extends GoalFormContext {
  accounts: Account[];
  allAccounts: Account[];
  linkableTransactions: Transaction[];
}

type Mode = "view" | "edit" | "contribute";

export function GoalDetailSheet({
  row,
  context,
  onClose,
}: {
  row: GoalRow | null;
  context: GoalDetailContext;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const close = () => {
    setMode("view");
    onClose();
  };
  const title =
    mode === "contribute"
      ? ct.title
      : mode === "edit"
        ? row && row.goal.status !== "active"
          ? t.editDescription
          : es.planning.goals.form.editTitle
        : t.title;
  return (
    <Sheet
      open={row !== null}
      onClose={close}
      title={title}
      description={mode === "contribute" ? ct.hint : undefined}
      testId="goal-detail"
    >
      {row &&
        (mode === "view" ? (
          <GoalView
            key={row.goal.id + row.goal.rev}
            row={row}
            context={context}
            onMode={setMode}
            onDone={close}
          />
        ) : mode === "edit" ? (
          <GoalForm
            key={row.goal.id + row.goal.rev}
            goal={row.goal}
            hasContributions={row.contributions.length > 0}
            context={context}
            onDone={() => setMode("view")}
          />
        ) : (
          <ContributionForm
            row={row}
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

type Action = "complete" | "cancel" | "archive" | "unarchive" | "delete";

function GoalView({
  row,
  context,
  onMode,
  onDone,
}: {
  row: GoalRow;
  context: GoalDetailContext;
  onMode: (m: Mode) => void;
  onDone: () => void;
}) {
  const { goal, progress } = row;
  const feedback = useFeedback();
  const [confirm, setConfirm] = useState<
    "cancel" | "delete" | { contribution: GoalContribution } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const money = (amount: number) =>
    formatMoney(amount, { currency: goal.currency });
  const active = goal.status === "active";

  async function guarded(
    work: () => Promise<unknown>,
    done: string,
    close = false,
  ) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      feedback(done);
      setConfirm(null);
      if (close) onDone();
    } catch (err) {
      setConfirm(null);
      setError(
        isAppError(err) && err.code === "CONFLICT"
          ? t.conflict
          : isAppError(err) &&
              err.code === "PROTECTED_OPERATION" &&
              err.message.includes("target")
            ? t.notReached
            : t.actionFailed,
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function run(action: Action) {
    const stamp = toIsoWithOffset(new Date());
    const patches = {
      complete: { status: "completed" as const, completedAt: stamp },
      cancel: { status: "cancelled" as const },
      archive: { archivedAt: stamp },
      unarchive: { archivedAt: null },
    };
    const messages = {
      complete: t.completed,
      cancel: t.cancelled,
      archive: t.archivedDone,
      unarchive: t.unarchivedDone,
      delete: t.removed,
    };
    if (action === "delete")
      return guarded(
        () => mutate((r) => r.goals.delete(goal.id, goal.rev)),
        messages.delete,
        true,
      );
    return guarded(
      () => mutate((r) => r.goals.update(goal.id, patches[action], goal.rev)),
      messages[action],
    );
  }

  const cancelContribution = (c: GoalContribution) =>
    guarded(
      () =>
        mutate((r) =>
          r.goalContributions.update(
            c.id,
            { cancelledAt: toIsoWithOffset(new Date()) },
            c.rev,
          ),
        ),
      ct.cancelledDone,
    );

  return (
    <>
      <div data-testid="goal-detail-view">
        <p
          className={cn(
            "type-heading",
            goal.status === "cancelled" && "text-ink-2",
          )}
        >
          {goal.name}
        </p>
        <p className="mt-1 type-body-sm text-ink-2">
          {es.planning.goalKinds[goal.kind]}
        </p>
        <p className="mt-3 type-label text-ink-2">{t.saved}</p>
        <p className="mt-1 type-amount-xl" data-testid="goal-detail-saved">
          <Money amount={progress.saved} currency={goal.currency} />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <GoalStatusBadge status={row.status} />
          {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
        </div>
        <div className="mt-4">
          <ProgressBar
            percent={progress.percent}
            tone={active ? "forest" : "sage"}
            label={t.percent}
            valueText={`${progress.percent} %`}
            size="thick"
          />
          <p className="mt-2 flex flex-wrap justify-between gap-2 type-caption text-ink-2">
            <span>
              {es.planning.goals.savedOf(
                money(progress.saved),
                money(goal.amount),
              )}
            </span>
            <span data-testid="goal-detail-percent">{progress.percent} %</span>
          </p>
        </div>
        {active && progress.reached && (
          <p className="mt-3 type-body-sm text-forest">
            {es.planning.goals.reachedHint}
          </p>
        )}
        {progress.overdue && (
          <p
            className="mt-3 type-body-sm text-warning-text"
            data-testid="goal-overdue"
          >
            {t.overdueNote}
          </p>
        )}
        {!active && (
          <p className="mt-3 type-caption text-ink-2">{t.closedNote}</p>
        )}

        <dl className="mt-5">
          <Row term={t.target}>
            <Money amount={goal.amount} currency={goal.currency} />
          </Row>
          <Row term={t.initial}>
            <Money amount={goal.initialAmount} currency={goal.currency} />
          </Row>
          <Row term={t.contributed}>
            <Money amount={progress.contributed} currency={goal.currency} />
          </Row>
          <Row term={t.remaining} testId="goal-detail-remaining">
            <Money amount={progress.remaining} currency={goal.currency} />
          </Row>
          <Row term={t.startDate}>
            {formatDate(goal.startDate as LocalDate, "form")}
          </Row>
          <Row term={t.targetDate}>
            {goal.targetDate ? (
              <>
                {formatDate(goal.targetDate as LocalDate, "form")}
                {active && progress.daysLeft !== null && (
                  <span className="block type-caption text-ink-2">
                    {progress.daysLeft >= 0
                      ? t.daysLeft(progress.daysLeft)
                      : t.daysPassed(-progress.daysLeft)}
                  </span>
                )}
              </>
            ) : (
              es.planning.goals.noDate
            )}
          </Row>
          {active && !progress.reached && (
            <Row term={t.pace} testId="goal-detail-pace">
              {progress.perMonth !== null && progress.perWeek !== null ? (
                <>
                  {t.perMonth(money(progress.perMonth))}
                  <span className="block type-caption text-ink-2">
                    {t.perWeek(money(progress.perWeek))}
                  </span>
                </>
              ) : (
                <span className="type-body-sm text-ink-2">{t.paceNone}</span>
              )}
            </Row>
          )}
          <Row term={t.currency}>{es.common.currencies[goal.currency]}</Row>
          {goal.description && (
            <Row term={t.description}>{goal.description}</Row>
          )}
        </dl>

        <section aria-labelledby="goal-contributions" className="mt-6">
          <h3 id="goal-contributions" className="type-subheading">
            {t.contributions}
          </h3>
          {row.contributions.length === 0 ? (
            <p className="mt-2 type-body-sm text-ink-2">
              {t.contributionsNone}
            </p>
          ) : (
            <ul className="mt-2" data-testid="goal-contributions">
              {row.contributions.map((c) => {
                const account = c.accountId
                  ? context.allAccounts.find((a) => a.id === c.accountId)
                  : undefined;
                const cancelled = c.cancelledAt !== null;
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
                    data-testid="goal-contribution"
                  >
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate type-body",
                          cancelled && "text-ink-2 line-through",
                        )}
                      >
                        {c.description ??
                          formatDate(c.date as LocalDate, "long")}
                      </span>
                      <span className="type-caption text-ink-2">
                        {[
                          formatDate(c.date as LocalDate),
                          account ? t.fromAccount(account.name) : null,
                          c.transactionId ? t.linked : null,
                          cancelled ? t.cancelledTag : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Money
                        amount={c.amount}
                        currency={c.currency}
                        className={cn(
                          "type-amount",
                          cancelled && "text-ink-2 line-through",
                        )}
                      />
                      {!cancelled && active && (
                        <Button
                          variant="ghost"
                          className="text-alert-text"
                          onClick={() => setConfirm({ contribution: c })}
                          disabled={busy}
                          aria-label={`${ct.cancel}: ${money(c.amount)}`}
                        >
                          {es.common.cancel}
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {error && (
          <p role="alert" className="mt-4 type-body-sm text-alert-text">
            {error}
          </p>
        )}
        <div className="mt-6 grid gap-3 border-t border-line pt-4">
          {(canContribute(goal) || canCompleteGoal(goal, progress)) && (
            <div className="flex flex-wrap justify-end gap-2">
              {canCompleteGoal(goal, progress) && (
                <Button
                  variant={progress.reached ? "primary" : "secondary"}
                  onClick={() => void run("complete")}
                  disabled={busy}
                >
                  {t.complete}
                </Button>
              )}
              {canContribute(goal) && (
                <Button
                  variant={progress.reached ? "secondary" : "primary"}
                  onClick={() => onMode("contribute")}
                  disabled={busy}
                >
                  {t.addContribution}
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {active && (
                <Button
                  variant="ghost"
                  className="text-alert-text"
                  onClick={() => setConfirm("cancel")}
                  disabled={busy}
                >
                  {t.cancel}
                </Button>
              )}
              {canArchiveGoal(goal) && (
                <Button
                  variant="ghost"
                  onClick={() => void run("archive")}
                  disabled={busy}
                >
                  {t.archive}
                </Button>
              )}
              {goal.archivedAt !== null && (
                <Button
                  variant="ghost"
                  onClick={() => void run("unarchive")}
                  disabled={busy}
                >
                  {t.unarchive}
                </Button>
              )}
              {canDeleteGoal(goal, row.contributions) && (
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
            <Button
              variant="secondary"
              onClick={() => onMode("edit")}
              disabled={busy}
            >
              {canEditGoal(goal) ? t.edit : t.editDescription}
            </Button>
          </div>
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
      <ConfirmDialog
        open={typeof confirm === "object" && confirm !== null}
        title={ct.cancelTitle}
        confirmLabel={ct.cancelConfirm}
        destructive
        busy={busy}
        onConfirm={() =>
          typeof confirm === "object" &&
          confirm !== null &&
          void cancelContribution(confirm.contribution)
        }
        onCancel={() => setConfirm(null)}
      >
        {ct.cancelBody}
      </ConfirmDialog>
    </>
  );
}

/**
 * Registers a contribution. It is its own record (never an income or expense: balances do not
 * change). It can name the account it came from and link one existing transfer or expense of
 * the goal's currency that is not linked yet; a transaction backs one contribution at most.
 */
function ContributionForm({
  row,
  context,
  onDone,
}: {
  row: GoalRow;
  context: GoalDetailContext;
  onDone: () => void;
}) {
  const { goal } = row;
  const feedback = useFeedback();
  const [values, setValues] = useState<ContributionFormValues>({
    amount: "",
    date: context.today,
    description: "",
    accountId: "",
    transactionId: "",
  });
  const [errors, setErrors] = useState<ContributionFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const accounts = context.accounts.filter((a) => a.currency === goal.currency);
  const transactions = context.linkableTransactions.filter(
    (tx) => tx.currency === goal.currency,
  );

  const set =
    (key: keyof ContributionFormValues) =>
    (e: { target: { value: string } }) => {
      const value = e.target.value;
      setValues((v) => ({ ...v, [key]: value }));
      setErrors((er) => ({ ...er, [key]: undefined }));
      setDuplicate(false);
    };

  async function submit(e: FormEvent, allowPossibleDuplicate = false) {
    e.preventDefault();
    if (busy.current) return;
    setFormError(null);
    const parsed = parseContributionForm(values, goal);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      await mutate((r) =>
        r.goalContributions.create(parsed.input, { allowPossibleDuplicate }),
      );
      feedback(ct.saved);
      onDone();
    } catch (err) {
      if (isAppError(err) && err.code === "POSSIBLE_DUPLICATE")
        setDuplicate(true);
      else setFormError(contributionSaveError(err));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="grid gap-5"
      aria-label={ct.title}
      data-testid="contribution-form"
    >
      <div className="grid gap-5 tablet:grid-cols-2">
        <Field label={ct.amount} error={errors.amount}>
          {(p) => (
            <MoneyInput
              {...p}
              name="amount"
              value={values.amount}
              onChange={set("amount")}
              placeholder="0,00"
              data-autofocus
            />
          )}
        </Field>
        <Field label={ct.date} error={errors.date}>
          {(p) => (
            <input
              {...p}
              type="date"
              name="date"
              value={values.date}
              onChange={set("date")}
              className={inputClass}
              required
            />
          )}
        </Field>
      </div>
      <Field label={ct.description} error={errors.description}>
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
      <Field label={ct.account} help={ct.accountHelp}>
        {(p) => (
          <Select
            {...p}
            name="accountId"
            value={values.accountId}
            onChange={set("accountId")}
          >
            <option value="">{ct.noAccount}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={ct.transaction} help={ct.transactionHelp}>
        {(p) => (
          <Select
            {...p}
            name="transactionId"
            value={values.transactionId}
            onChange={set("transactionId")}
          >
            <option value="">{ct.noTransaction}</option>
            {transactions.map((tx) => (
              <option key={tx.id} value={tx.id}>
                {`${formatDate(tx.date as LocalDate)} · ${tx.description} · ${formatMoney(tx.amount, { currency: tx.currency })}`}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {duplicate && (
        <div role="alert" className="grid gap-2 rounded-sm bg-warning-tint p-3">
          <p className="type-body-sm text-warning-text">{ct.duplicate}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={(e) => void submit(e as unknown as FormEvent, true)}
            disabled={saving}
          >
            {ct.saveAnyway}
          </Button>
        </div>
      )}
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
          {saving ? es.common.saving : ct.save}
        </Button>
      </div>
    </form>
  );
}
