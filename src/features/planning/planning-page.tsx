"use client";

import { useEffect, useState } from "react";
import type { BudgetState } from "@/domain/rules/budgets";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/shared/money";
import { LocalOnlyMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackProvider } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { mutate, useLocalQuery } from "@/hooks/use-local-data";
import { AREAS } from "@/lib/config/navigation";
import { formatDate, type LocalDate } from "@/lib/formatting/date";
import { formatMoney } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { ensureDefaultCategories } from "@/services/repositories/repositories";
import { BudgetDetailSheet } from "./budget-detail";
import { NewBudgetSheet, type BudgetFormContext } from "./budget-form";
import {
  categoryLabel,
  loadPlanningView,
  type BudgetRow,
  type GoalRow,
  type PlanningView,
} from "./data";
import { GoalDetailSheet, type GoalDetailContext } from "./goal-detail";
import { NewGoalSheet } from "./goal-form";
import {
  BudgetStateBadge,
  GoalStatusBadge,
  ProgressBar,
  budgetBarTone,
} from "./ui";

const t = es.planning;
const TABS = ["summary", "budgets", "goals"] as const;
type Tab = (typeof TABS)[number];
/** Hash of each section, so a reload or a shared link reopens it (#presupuestos, #metas). */
const HASH: Record<Tab, string> = {
  summary: "",
  budgets: "#presupuestos",
  goals: "#metas",
};
const tabFromHash = (hash: string): Tab =>
  TABS.find((x) => HASH[x] === hash && hash !== "") ?? "summary";

/**
 * Presupuesto (Plan): module summary, budgets and savings goals of this device. Details and
 * forms open in the side sheet. All figures come from src/domain/rules/budgets.ts and goals.ts.
 */
export function PlanningPage() {
  return (
    <FeedbackProvider>
      <PlanningContent />
    </FeedbackProvider>
  );
}

function PlanningContent() {
  const query = useLocalQuery((db) => loadPlanningView(db), []);
  const [tab, setTab] = useState<Tab>("summary");
  const [sheet, setSheet] = useState<"newBudget" | "newGoal" | null>(null);
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const data = query.status === "ready" ? query.data : null;

  useEffect(() => {
    const sync = () => setTab(tabFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  // Initial categories, once per device with none (D4-09): budgets use expense categories.
  useEffect(() => {
    void mutate((_r, db) => ensureDefaultCategories({ db })).catch(
      () => undefined,
    );
  }, []);

  const choose = (next: Tab) => {
    setTab(next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${HASH[next]}`,
    );
  };

  const budgetContext: BudgetFormContext | null = data && {
    categories: data.categories,
    allCategories: data.allCategories,
    today: data.today,
    baseCurrency: data.settings.baseCurrency,
    firstDayOfWeek: data.settings.firstDayOfWeek,
  };
  const goalContext: GoalDetailContext | null = data && {
    today: data.today,
    baseCurrency: data.settings.baseCurrency,
    accounts: data.accounts,
    allAccounts: data.allAccounts,
    linkableTransactions: data.linkableTransactions,
  };
  const selectedBudget =
    data && budgetId
      ? (data.budgets.find((r) => r.budget.id === budgetId) ?? null)
      : null;
  const selectedGoal =
    data && goalId
      ? (data.goals.find((r) => r.goal.id === goalId) ?? null)
      : null;

  return (
    <>
      <PageHeader
        label={es.nav.groups.plan}
        title={AREAS.budget.label}
        actions={
          // One action (arquitetura.md "Cabeçalho"): it follows the open section.
          data && (
            <Button
              variant="primary"
              onClick={() =>
                setSheet(tab === "goals" ? "newGoal" : "newBudget")
              }
            >
              {tab === "goals" ? t.goals.newGoal : t.budgets.newBudget}
            </Button>
          )
        }
      />
      <p className="-mt-4 mb-6 max-w-[60ch] type-body text-ink-2 desktop:-mt-8">
        {t.description}
      </p>
      <div
        role="tablist"
        aria-label={t.tabs.label}
        className="mb-8 grid max-w-[28rem] grid-cols-3 rounded-sm bg-paper-2 p-0.75"
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => choose(id)}
            className={cn(
              "grid h-9 place-items-center rounded-xs type-body-sm text-ink-2",
              tab === id &&
                "bg-surface font-semibold text-ink ring-1 ring-line",
            )}
          >
            {t.tabs[id]}
          </button>
        ))}
      </div>

      {query.status === "loading" && (
        <div data-testid="planning-loading" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-12 w-64" />
          <div className="mt-10 grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      )}
      {query.status === "error" && (
        <section role="alert" className="max-w-[60ch]">
          <p className="type-body text-alert-text">
            {query.error.code === "STORAGE_UNAVAILABLE"
              ? es.accounts.storageUnavailable
              : t.loadError}
          </p>
          <Button className="mt-4" onClick={query.reload}>
            {es.common.retry}
          </Button>
        </section>
      )}
      {data && budgetContext && goalContext && (
        <>
          {data.invalid > 0 && (
            <p role="alert" className="mb-6 type-body-sm text-alert-text">
              {t.invalidRecords(data.invalid)}
            </p>
          )}
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "summary" && (
              <SummaryPanel
                view={data}
                onBudget={(r) => setBudgetId(r.budget.id)}
                onGoal={(r) => setGoalId(r.goal.id)}
              />
            )}
            {tab === "budgets" && (
              <BudgetsPanel
                view={data}
                onOpen={(r) => setBudgetId(r.budget.id)}
                onCreate={() => setSheet("newBudget")}
              />
            )}
            {tab === "goals" && (
              <GoalsPanel
                view={data}
                onOpen={(r) => setGoalId(r.goal.id)}
                onCreate={() => setSheet("newGoal")}
              />
            )}
          </div>
          <NewBudgetSheet
            open={sheet === "newBudget"}
            context={budgetContext}
            onClose={() => setSheet(null)}
          />
          <NewGoalSheet
            open={sheet === "newGoal"}
            context={goalContext}
            onClose={() => setSheet(null)}
          />
          <BudgetDetailSheet
            row={selectedBudget}
            context={budgetContext}
            onClose={() => setBudgetId(null)}
          />
          <GoalDetailSheet
            row={selectedGoal}
            context={goalContext}
            onClose={() => setGoalId(null)}
          />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------------ */
/* Summary                                                                          */
/* ------------------------------------------------------------------------------ */

function SummaryPanel({
  view,
  onBudget,
  onGoal,
}: {
  view: PlanningView;
  onBudget: (r: BudgetRow) => void;
  onGoal: (r: GoalRow) => void;
}) {
  const { budgetSummary: bs, goalSummary: gs } = view;
  const current = view.budgets.filter(
    (r) => r.timing === "current" && !r.archived,
  );
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-12"
      data-testid="planning-summary"
    >
      <section
        aria-labelledby="sum-budgets"
        className="grid grid-cols-[minmax(0,1fr)] gap-8 desktop:grid-cols-12"
      >
        <div className="desktop:col-span-7">
          <h2 id="sum-budgets" className="type-label text-ink-2">
            {t.summary.budgetsTitle}
          </h2>
          {bs.byCurrency.length === 0 ? (
            <p className="mt-3 type-body text-ink-2">{t.summary.noBudgets}</p>
          ) : (
            bs.byCurrency.map((r, i) => (
              <div
                key={r.currency}
                className={cn(i > 0 && "mt-5")}
                data-testid={`budget-total-${r.currency}`}
              >
                <p
                  className={cn(
                    i === 0
                      ? "mt-3 type-display-hero-mobile desktop:type-display-hero"
                      : "type-amount-lg",
                  )}
                >
                  <Money
                    amount={r.spent}
                    currency={r.currency}
                    cents="auto"
                    attention={r.spent > r.budgeted}
                  />
                </p>
                <p className="mt-1 type-body-sm text-ink-2">
                  {t.summary.spent} · {t.summary.budgeted}{" "}
                  {formatMoney(r.budgeted, { currency: r.currency })}
                  {r.scope === "general" && ` · ${t.summary.scopeGeneral}`}
                </p>
              </div>
            ))
          )}
          <p
            className="mt-4 type-body-sm text-ink-2"
            data-testid="budget-counts"
          >
            {[
              t.summary.active(bs.active),
              bs.exceeded > 0 ? t.summary.exceeded(bs.exceeded) : null,
              bs.attention > 0 ? t.summary.attention(bs.attention) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {bs.byCurrency.length > 1 && (
            <p className="mt-1 type-caption text-ink-2">{t.perCurrency}</p>
          )}
        </div>
        <div className="desktop:col-span-5 desktop:border-l desktop:border-line desktop:pl-8">
          <h3 className="type-label text-ink-2">{t.summary.topCategories}</h3>
          {view.topCategories.length === 0 ? (
            <p className="mt-3 type-body-sm text-ink-2">
              {t.summary.topCategoriesNone}
            </p>
          ) : (
            view.topCategories.map(({ currency, rows }) => (
              <ul
                key={currency}
                className="mt-3 grid gap-3"
                data-testid={`top-categories-${currency}`}
              >
                {rows.map((c) => {
                  const name = c.categoryId
                    ? (categoryLabel(
                        view.allCategories.find((x) => x.id === c.categoryId) ??
                          null,
                        view.allCategories,
                      ) ?? t.summary.noCategory)
                    : t.summary.noCategory;
                  const max = Math.max(
                    ...rows.map((x) => Math.max(x.spent, x.budgeted ?? 0)),
                  );
                  const over = c.budgeted !== null && c.spent > c.budgeted;
                  return (
                    <li key={c.categoryId ?? "none"}>
                      <p className="flex items-baseline justify-between gap-3">
                        <span className="truncate type-body-sm">{name}</span>
                        <Money
                          amount={c.spent}
                          currency={currency}
                          cents="auto"
                          className="type-amount"
                          attention={over}
                        />
                      </p>
                      <ProgressBar
                        percent={Math.floor((c.spent * 100) / max)}
                        tone={over ? "alert" : "sage"}
                        label={name}
                        valueText={formatMoney(c.spent, { currency })}
                        pace={
                          c.budgeted !== null
                            ? Math.floor((c.budgeted * 100) / max)
                            : null
                        }
                      />
                      <p className="mt-1 type-caption text-ink-2">
                        {c.budgeted !== null
                          ? t.summary.ofBudget(
                              formatMoney(c.budgeted, {
                                currency,
                                cents: "auto",
                              }),
                            )
                          : t.summary.noBudgetForCategory}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ))
          )}
        </div>
      </section>

      {current.length > 0 && (
        <BudgetList
          title={es.planning.budgets.sections.current}
          rows={current}
          onOpen={onBudget}
          id="sum-current"
        />
      )}

      <section
        aria-labelledby="sum-goals"
        className="grid grid-cols-[minmax(0,1fr)] gap-8 desktop:grid-cols-12"
        data-testid="goals-summary"
      >
        <div className="desktop:col-span-7">
          <h2 id="sum-goals" className="type-label text-ink-2">
            {t.summary.saved}
          </h2>
          {gs.byCurrency.length === 0 ? (
            <p className="mt-3 type-body text-ink-2">{t.summary.noGoals}</p>
          ) : (
            gs.byCurrency.map((r, i) => (
              <div
                key={r.currency}
                className={cn(i > 0 && "mt-4")}
                data-testid={`goal-total-${r.currency}`}
              >
                <p
                  className={cn(
                    i === 0 ? "mt-3 type-amount-xl" : "type-amount-lg",
                  )}
                >
                  <Money amount={r.saved} currency={r.currency} cents="auto" />
                </p>
                <p className="mt-1 type-body-sm text-ink-2">
                  {es.planning.goals.savedOf(
                    formatMoney(r.saved, {
                      currency: r.currency,
                      cents: "auto",
                    }),
                    formatMoney(r.target, {
                      currency: r.currency,
                      cents: "auto",
                    }),
                  )}
                </p>
              </div>
            ))
          )}
          <p className="mt-4 type-body-sm text-ink-2" data-testid="goal-counts">
            {[
              t.summary.goalsActive(gs.active),
              t.summary.goalsCompleted(gs.completed),
              gs.reached > 0 ? t.summary.goalsReached(gs.reached) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="desktop:col-span-5 desktop:border-l desktop:border-line desktop:pl-8">
          <h3 className="type-label text-ink-2">{t.summary.upcoming}</h3>
          {gs.upcoming.length === 0 ? (
            <p className="mt-3 type-body-sm text-ink-2">—</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {gs.upcoming.map((g) => {
                const row = view.goals.find((r) => r.goal.id === g.id)!;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="flex w-full items-baseline justify-between gap-3 text-left hover:underline"
                      onClick={() => onGoal(row)}
                    >
                      <span className="truncate type-body">{g.name}</span>
                      <span className="shrink-0 type-body-sm text-ink-2">
                        {formatDate(g.targetDate as LocalDate)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------------ */
/* Budgets                                                                          */
/* ------------------------------------------------------------------------------ */

type BudgetFilter = "all" | "attention" | "exceeded" | "within";
const FILTER_MATCH: Record<BudgetFilter, (s: BudgetState) => boolean> = {
  all: () => true,
  within: (s) => s === "within",
  attention: (s) => s === "attention" || s === "near",
  exceeded: (s) => s === "exceeded",
};

function BudgetsPanel({
  view,
  onOpen,
  onCreate,
}: {
  view: PlanningView;
  onOpen: (r: BudgetRow) => void;
  onCreate: () => void;
}) {
  const [filter, setFilter] = useState<BudgetFilter>("all");
  if (view.budgets.length === 0) {
    return (
      <section
        aria-labelledby="sin-presupuestos"
        className="max-w-[60ch]"
        data-testid="budgets-empty"
      >
        <h2 id="sin-presupuestos" className="type-heading">
          {t.budgets.empty.title}
        </h2>
        <p className="mt-2 mb-5 type-body text-ink-2">{t.budgets.empty.body}</p>
        <Button variant="primary" onClick={onCreate}>
          {t.budgets.empty.action}
        </Button>
      </section>
    );
  }
  const live = view.budgets.filter((r) => !r.archived);
  const current = live.filter(
    (r) => r.timing === "current" && FILTER_MATCH[filter](r.usage.state),
  );
  const upcoming = live.filter((r) => r.timing === "upcoming");
  const past = live.filter((r) => r.timing === "past").reverse();
  const archived = view.budgets.filter((r) => r.archived);
  return (
    <div data-testid="budgets-panel">
      <div className="mb-6 max-w-[20rem]">
        <label htmlFor="budget-filter" className="type-label text-ink-2">
          {t.budgets.filter.label}
        </label>
        <Select
          id="budget-filter"
          className="mt-1"
          value={filter}
          onChange={(e) => setFilter(e.target.value as BudgetFilter)}
        >
          {(["all", "attention", "exceeded", "within"] as const).map((f) => (
            <option key={f} value={f}>
              {t.budgets.filter[f]}
            </option>
          ))}
        </Select>
      </div>
      {filter !== "all" && current.length === 0 && (
        <div className="mb-10" data-testid="budgets-no-results">
          <p className="type-body text-ink-2">{t.budgets.noResults}</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => setFilter("all")}
          >
            {t.budgets.clearFilter}
          </Button>
        </div>
      )}
      <BudgetList
        id="budgets-current"
        title={t.budgets.sections.current}
        rows={current}
        onOpen={onOpen}
      />
      <BudgetList
        id="budgets-upcoming"
        title={t.budgets.sections.upcoming}
        rows={upcoming}
        onOpen={onOpen}
      />
      <BudgetList
        id="budgets-past"
        title={t.budgets.sections.past}
        rows={past}
        onOpen={onOpen}
        muted
      />
      <BudgetList
        id="budgets-archived"
        title={t.budgets.sections.archived(archived.length)}
        rows={archived}
        onOpen={onOpen}
        muted
      />
    </div>
  );
}

function BudgetList({
  id,
  title,
  rows,
  onOpen,
  muted = false,
}: {
  id: string;
  title: string;
  rows: BudgetRow[];
  onOpen: (r: BudgetRow) => void;
  muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-title`} className="mb-10" data-testid={id}>
      <h2
        id={`${id}-title`}
        className={cn("mb-3 type-subheading", muted && "text-ink-2")}
      >
        {title}
      </h2>
      <ul className="rounded-md bg-surface">
        {rows.map((row) => (
          <li
            key={row.budget.id}
            className="border-b border-line last:border-b-0"
          >
            <BudgetLine row={row} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BudgetLine({
  row,
  onOpen,
}: {
  row: BudgetRow;
  onOpen: (r: BudgetRow) => void;
}) {
  const { budget, usage } = row;
  const money = (n: number) => formatMoney(n, { currency: budget.currency });
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="grid w-full grid-cols-[minmax(0,1fr)] gap-2 px-4 py-3 text-left hover:bg-paper-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
      data-testid="budget-row"
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0">
          <span className="block truncate type-body">{budget.name}</span>
          <span className="block truncate type-caption text-ink-2">
            {es.planning.periods[budget.period]} ·{" "}
            {formatDate(budget.startDate as LocalDate)} –{" "}
            {formatDate(budget.endDate as LocalDate)}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <BudgetStateBadge state={usage.state} />
          <span className="text-right type-amount">
            <Money
              amount={usage.spent}
              currency={budget.currency}
              attention={usage.state === "exceeded"}
            />
            <span className="block type-caption text-ink-2">
              {es.planning.budgets.spentOf("", money(budget.amount)).trim()}
            </span>
          </span>
        </span>
      </span>
      <ProgressBar
        percent={usage.percent}
        tone={budgetBarTone(usage.state)}
        label={budget.name}
        valueText={t.budgets.percent(usage.percent)}
        pace={row.pace}
      />
      <span className="flex flex-wrap justify-between gap-2 type-caption text-ink-2">
        <span>
          {usage.state === "exceeded"
            ? t.budgets.over(money(usage.over))
            : t.budgets.remaining(money(usage.remaining))}
        </span>
        <span>{t.budgets.percent(usage.percent)}</span>
      </span>
      {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
    </button>
  );
}

/* ------------------------------------------------------------------------------ */
/* Goals                                                                            */
/* ------------------------------------------------------------------------------ */

function GoalsPanel({
  view,
  onOpen,
  onCreate,
}: {
  view: PlanningView;
  onOpen: (r: GoalRow) => void;
  onCreate: () => void;
}) {
  if (view.goals.length === 0) {
    return (
      <section
        aria-labelledby="sin-metas"
        className="max-w-[60ch]"
        data-testid="goals-empty"
      >
        <h2 id="sin-metas" className="type-heading">
          {t.goals.empty.title}
        </h2>
        <p className="mt-2 mb-5 type-body text-ink-2">{t.goals.empty.body}</p>
        <Button variant="primary" onClick={onCreate}>
          {t.goals.empty.action}
        </Button>
      </section>
    );
  }
  const visible = view.goals.filter((r) => r.goal.archivedAt === null);
  const sections: {
    id: string;
    title: string;
    rows: GoalRow[];
    muted?: boolean;
  }[] = [
    {
      id: "goals-active",
      title: t.goals.sections.active,
      rows: visible.filter((r) => r.goal.status === "active"),
    },
    {
      id: "goals-completed",
      title: t.goals.sections.completed,
      rows: visible.filter((r) => r.goal.status === "completed"),
      muted: true,
    },
    {
      id: "goals-cancelled",
      title: t.goals.sections.cancelled,
      rows: visible.filter((r) => r.goal.status === "cancelled"),
      muted: true,
    },
  ];
  const archived = view.goals.filter((r) => r.goal.archivedAt !== null);
  if (archived.length > 0)
    sections.push({
      id: "goals-archived",
      title: t.goals.sections.archived(archived.length),
      rows: archived,
      muted: true,
    });
  return (
    <div data-testid="goals-panel">
      {sections
        .filter((s) => s.rows.length > 0)
        .map((s) => (
          <section
            key={s.id}
            aria-labelledby={`${s.id}-title`}
            className="mb-10"
            data-testid={s.id}
          >
            <h2
              id={`${s.id}-title`}
              className={cn("mb-3 type-subheading", s.muted && "text-ink-2")}
            >
              {s.title}
            </h2>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 tablet:grid-cols-2">
              {s.rows.map((row) => (
                <li key={row.goal.id}>
                  <GoalCard row={row} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function GoalCard({
  row,
  onOpen,
}: {
  row: GoalRow;
  onOpen: (r: GoalRow) => void;
}) {
  const { goal, progress } = row;
  const money = (n: number) => formatMoney(n, { currency: goal.currency });
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="grid h-full w-full grid-cols-[minmax(0,1fr)] gap-3 rounded-md bg-surface p-4 text-left hover:bg-paper-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
      data-testid="goal-card"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate type-body font-semibold">
            {goal.name}
          </span>
          <span className="block type-caption text-ink-2">
            {es.planning.goalKinds[goal.kind]}
          </span>
        </span>
        <GoalStatusBadge status={row.status} />
      </span>
      <span className="type-amount-lg">
        <Money amount={progress.saved} currency={goal.currency} cents="auto" />
      </span>
      <ProgressBar
        percent={progress.percent}
        tone={goal.status === "active" ? "forest" : "sage"}
        label={goal.name}
        valueText={`${progress.percent} %`}
      />
      <span className="flex flex-wrap justify-between gap-2 type-caption text-ink-2">
        <span>
          {t.goals.savedOf(`${progress.percent} %`, money(goal.amount))}
        </span>
        <span>
          {goal.targetDate
            ? t.goals.due(formatDate(goal.targetDate as LocalDate))
            : t.goals.noDate}
        </span>
      </span>
      {row.localOnly && <LocalOnlyMark label={es.common.localOnly} />}
    </button>
  );
}
