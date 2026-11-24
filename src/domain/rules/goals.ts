import type { CurrencyCode } from "../currency";
import type { Goal, GoalContribution } from "../schemas";
import { daysBetween } from "./cards";

/**
 * Savings goals (Step 06). Pure and derived:
 * - saved = initialAmount + live contributions (not cancelled, not deleted), each counted once;
 * - remaining = target − saved, never below zero; percent is rounded down;
 * - a goal is never completed or changed automatically: reaching the target only makes
 *   "Marcar como cumplida" available, and a passed target date is only shown (D6 rules).
 * Contributions are separate records, never incomes or expenses: they do not touch balances.
 */

export type GoalDisplayStatus = "active" | "reached" | "overdue" | "completed" | "cancelled" | "archived";

export const liveContributions = (goalId: string, contributions: readonly GoalContribution[]) =>
  contributions.filter((c) => c.goalId === goalId && c.deletedAt === null && c.cancelledAt === null);

/** Every contribution of the goal, cancelled ones included, newest first (history). */
export const contributionHistory = (goalId: string, contributions: readonly GoalContribution[]) =>
  contributions
    .filter((c) => c.goalId === goalId && c.deletedAt === null)
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));

export interface GoalProgress {
  target: number;
  saved: number;
  /** Sum of live contributions only (without the initial amount). */
  contributed: number;
  remaining: number;
  /** Whole percent, rounded down; may pass 100 when more than the target was saved. */
  percent: number;
  reached: boolean;
  /** Days from today to the target date (negative when passed); null without target date. */
  daysLeft: number | null;
  /** Active, not reached and the target date has passed. Shown, never acted on. */
  overdue: boolean;
  /**
   * Saving pace needed to arrive on time, in minor units rounded UP (so the goal is reached):
   * per month counts started 30-day blocks, per week started 7-day blocks. Null when not
   * calculable (no target date, already reached, date passed, not active).
   */
  perMonth: number | null;
  perWeek: number | null;
}

export function goalProgress(goal: Goal, contributions: readonly GoalContribution[], today: string): GoalProgress {
  const contributed = liveContributions(goal.id, contributions).reduce((s, c) => s + c.amount, 0);
  const saved = goal.initialAmount + contributed;
  const remaining = Math.max(0, goal.amount - saved);
  const reached = saved >= goal.amount;
  const daysLeft = goal.targetDate === null ? null : daysBetween(today, goal.targetDate);
  const active = goal.status === "active";
  const calculable = active && !reached && daysLeft !== null && daysLeft >= 0;
  const days = (daysLeft ?? 0) + 1; // today counts
  return {
    target: goal.amount,
    saved,
    contributed,
    remaining,
    percent: Math.floor((saved * 100) / goal.amount),
    reached,
    daysLeft,
    overdue: active && !reached && daysLeft !== null && daysLeft < 0,
    perMonth: calculable ? Math.ceil(remaining / Math.ceil(days / 30)) : null,
    perWeek: calculable ? Math.ceil(remaining / Math.ceil(days / 7)) : null,
  };
}

export function goalDisplayStatus(goal: Goal, progress: Pick<GoalProgress, "reached" | "overdue">): GoalDisplayStatus {
  if (goal.archivedAt !== null) return "archived";
  if (goal.status !== "active") return goal.status;
  if (progress.reached) return "reached";
  if (progress.overdue) return "overdue";
  return "active";
}

/** Rules the repository enforces too. */
export const canCompleteGoal = (goal: Goal, progress: Pick<GoalProgress, "reached">) => goal.status === "active" && progress.reached;
export const canContribute = (goal: Goal) => goal.status === "active" && goal.archivedAt === null && goal.deletedAt === null;
export const canEditGoal = (goal: Goal) => goal.status === "active";
export const canArchiveGoal = (goal: Goal) => goal.status !== "active" && goal.archivedAt === null;
/** Deleting is only for a mistake: a goal with any contribution (even cancelled) is cancelled instead. */
export const canDeleteGoal = (goal: Goal, contributions: readonly GoalContribution[]) => contributionHistory(goal.id, contributions).length === 0;

export interface GoalCurrencySummary {
  currency: CurrencyCode;
  /** Saved in active (non-archived) goals. */
  saved: number;
  target: number;
}

export interface GoalsSummary {
  active: number;
  completed: number;
  reached: number;
  overdue: number;
  byCurrency: GoalCurrencySummary[];
  /** Active goals with a target date from today on, earliest first. */
  upcoming: Goal[];
}

export function summarizeGoals(
  goals: readonly Goal[],
  contributions: readonly GoalContribution[],
  options: { today: string; baseCurrency: CurrencyCode; upcomingLimit?: number },
): GoalsSummary {
  const live = goals.filter((g) => g.deletedAt === null);
  const active = live.filter((g) => g.status === "active" && g.archivedAt === null);
  const rows = new Map<CurrencyCode, GoalCurrencySummary>();
  let reached = 0;
  let overdue = 0;
  for (const g of active) {
    const p = goalProgress(g, contributions, options.today);
    if (p.reached) reached++;
    if (p.overdue) overdue++;
    const r = rows.get(g.currency) ?? { currency: g.currency, saved: 0, target: 0 };
    r.saved += p.saved;
    r.target += g.amount;
    rows.set(g.currency, r);
  }
  return {
    active: active.length,
    completed: live.filter((g) => g.status === "completed").length,
    reached,
    overdue,
    byCurrency: [...rows.values()].sort((a, b) =>
      a.currency === options.baseCurrency ? -1 : b.currency === options.baseCurrency ? 1 : a.currency.localeCompare(b.currency),
    ),
    upcoming: active
      .filter((g) => g.targetDate !== null && g.targetDate >= options.today)
      .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!) || a.name.localeCompare(b.name, "es-AR"))
      .slice(0, options.upcomingLimit ?? 3),
  };
}

/** Active first (by target date, undated last), then completed, cancelled and archived. */
export function sortGoals(goals: readonly Goal[]): Goal[] {
  const rank = (g: Goal) => (g.archivedAt !== null ? 3 : g.status === "active" ? 0 : g.status === "completed" ? 1 : 2);
  return [...goals].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.targetDate ?? "9999-12-31").localeCompare(b.targetDate ?? "9999-12-31") ||
      a.name.localeCompare(b.name, "es-AR"),
  );
}
