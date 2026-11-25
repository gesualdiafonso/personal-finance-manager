import {
  ChartNoAxesColumn,
  CalendarDays,
  CreditCard,
  House,
  Landmark,
  List,
  Repeat,
  Settings2,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { AreaId } from "@/lib/config/navigation";

/**
 * One icon per area, shared by the sidebar, the rail and the phone menu (consistent set:
 * Lucide, 1.5px stroke). No wallet or currency pictograms (docs/branding/UI-BRANDING.md).
 */
export const NAV_ICONS: Record<AreaId, LucideIcon> = {
  dashboard: House,
  transactions: List,
  bills: CalendarDays,
  cards: CreditCard,
  recurrences: Repeat,
  accounts: Landmark,
  budget: Target,
  reports: ChartNoAxesColumn,
  settings: Settings2,
};
