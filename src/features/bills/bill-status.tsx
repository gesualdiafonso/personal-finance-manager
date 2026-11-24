import { isPartial } from "@/domain/rules/bills";
import { Badge } from "@/components/ui/badge";
import { es } from "@/lib/i18n/es";
import type { BillRow } from "./data";

const TONE = {
  pending: "neutral",
  dueToday: "soon",
  overdue: "late",
  paid: "positive",
  cancelled: "neutral",
} as const;

/** Derived status (D5-03) as dot + text, never colour alone; "Pago parcial" when it applies. */
export function BillStatusBadge({ row }: { row: BillRow }) {
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1.5"
      data-testid="bill-status"
    >
      <Badge tone={TONE[row.status]}>{es.bills.statuses[row.status]}</Badge>
      {isPartial(row.bill, row.balance) && (
        <Badge tone="soon">{es.bills.partial}</Badge>
      )}
    </span>
  );
}
