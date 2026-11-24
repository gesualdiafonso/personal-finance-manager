import type { BudgetState } from "@/domain/rules/budgets";
import type { GoalDisplayStatus } from "@/domain/rules/goals";
import { Badge } from "@/components/ui/badge";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";

const t = es.planning;

/** Colour of a budget state (Design System: forest within pace, warning, alert over). */
const BAR: Record<BudgetState, "forest" | "warning" | "alert"> = {
  within: "forest",
  attention: "warning",
  near: "warning",
  exceeded: "alert",
};
const BADGE: Record<BudgetState, "positive" | "soon" | "late"> = {
  within: "positive",
  attention: "soon",
  near: "soon",
  exceeded: "late",
};

/** Literal class names (Tailwind only generates classes it can read in the source). */
const FILL = {
  forest: "bg-forest",
  warning: "bg-warning",
  alert: "bg-alert",
  sage: "bg-sage",
} as const;

/**
 * Thin progress bar (arquitetura.md "Orçamento"): the fill is capped at the track; the
 * optional marker shows the share of the period already elapsed ("ritmo esperado").
 * Exposed as a meter with its text value, so the colour is never the only signal.
 */
export function ProgressBar({
  percent,
  tone,
  label,
  valueText,
  pace = null,
  size = "thin",
}: {
  percent: number | null;
  tone: "forest" | "warning" | "alert" | "sage";
  label: string;
  valueText: string;
  pace?: number | null;
  size?: "thin" | "thick";
}) {
  const width = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
      aria-valuetext={valueText}
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-paper-2",
        size === "thin" ? "h-1.5" : "h-2.5",
      )}
    >
      <div
        className={cn("h-full rounded-full", FILL[tone])}
        style={{ width: `${width}%` }}
      />
      {pace !== null && (
        <span
          aria-hidden="true"
          className="absolute top-0 h-full w-0.5 bg-ink"
          style={{ left: `calc(${Math.min(100, pace)}% - 1px)` }}
        />
      )}
    </div>
  );
}

export const budgetBarTone = (state: BudgetState): keyof typeof FILL =>
  BAR[state];

export function BudgetStateBadge({ state }: { state: BudgetState }) {
  return (
    <span data-testid="budget-state">
      <Badge tone={BADGE[state]}>{t.budgetStates[state]}</Badge>
    </span>
  );
}

const GOAL_TONE: Record<
  GoalDisplayStatus,
  "positive" | "soon" | "late" | "neutral"
> = {
  active: "neutral",
  reached: "positive",
  overdue: "soon",
  completed: "positive",
  cancelled: "neutral",
  archived: "neutral",
};

export function GoalStatusBadge({ status }: { status: GoalDisplayStatus }) {
  return (
    <span data-testid="goal-status">
      <Badge tone={GOAL_TONE[status]}>{t.goalStatuses[status]}</Badge>
    </span>
  );
}
