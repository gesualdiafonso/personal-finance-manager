"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Kbd } from "@/components/ui/button";
import { AREAS, isActive, SIDEBAR_GROUPS, type AreaId } from "@/lib/config/navigation";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { DataStatus } from "./data-status";

function NavItem({ id, pathname }: { id: AreaId; pathname: string }) {
  const area = AREAS[id];
  const active = isActive(pathname, area.href);
  return (
    <Link
      href={area.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center rounded-sm px-2.5 type-nav text-ink-2 hover:text-ink",
        active && "bg-forest-tint font-semibold text-forest hover:text-forest",
      )}
    >
      {area.label}
    </Link>
  );
}

/** Desktop sidebar (≥1200px): text only, no icons (docs/design-system/arquitetura.md). */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-(--layout-sidebar) shrink-0 flex-col border-r border-line bg-paper-2 px-4 py-6 desktop:flex">
      <div className="px-2 pb-5 brand-wordmark">{es.app.name}</div>
      <Button asChild variant="primary" className="mb-5 w-full justify-between">
        <Link href={AREAS.transactions.href}>
          {es.nav.newTransaction}
          <Kbd>N</Kbd>
        </Link>
      </Button>
      <nav aria-label={es.nav.primaryLabel} className="flex flex-col gap-1">
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label ?? "main"} className="flex flex-col gap-1">
            {group.label && <div className="px-2.5 pt-5 pb-1.5 type-label text-ink-2">{group.label}</div>}
            {group.areas.map((id) => (
              <NavItem key={id} id={id} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
        <NavItem id="settings" pathname={pathname} />
        <DataStatus />
      </div>
    </aside>
  );
}
