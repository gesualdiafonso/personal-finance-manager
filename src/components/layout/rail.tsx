"use client";

import {
  CalendarDays,
  ChartColumn,
  CreditCard,
  House,
  List,
  PiggyBank,
  Plus,
  Repeat,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AREAS, isActive, SIDEBAR_GROUPS, type AreaId } from "@/lib/config/navigation";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<AreaId, LucideIcon> = {
  dashboard: House,
  transactions: List,
  bills: CalendarDays,
  cards: CreditCard,
  recurrences: Repeat,
  accounts: Wallet,
  budget: PiggyBank,
  reports: ChartColumn,
  settings: Settings,
};

function RailItem({ id, pathname }: { id: AreaId; pathname: string }) {
  const area = AREAS[id];
  const Icon = ICONS[id];
  const active = isActive(pathname, area.href);
  return (
    <Link
      href={area.href}
      title={area.label}
      aria-label={area.label}
      aria-current={active ? "page" : undefined}
      className={cn("grid size-11 place-items-center rounded-sm text-ink-2 hover:text-ink", active && "bg-forest-tint text-forest")}
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
    </Link>
  );
}

/** Tablet landscape (1024–1199px): 72px icon rail with the + on top (responsivo.md). */
export function Rail() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-(--layout-rail) shrink-0 flex-col items-center gap-1 border-r border-line bg-paper-2 py-6 landscape:flex desktop:hidden">
      <Link
        href={AREAS.transactions.href}
        aria-label={es.nav.newTransaction}
        title={es.nav.newTransaction}
        className="mb-4 grid size-11 place-items-center rounded-full bg-forest text-on-primary"
      >
        <Plus aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </Link>
      <nav aria-label={es.nav.primaryLabel} className="flex flex-col items-center gap-1">
        {SIDEBAR_GROUPS.flatMap((g) => g.areas).map((id) => (
          <RailItem key={id} id={id} pathname={pathname} />
        ))}
      </nav>
      <div className="mt-auto">
        <RailItem id="settings" pathname={pathname} />
      </div>
    </aside>
  );
}
