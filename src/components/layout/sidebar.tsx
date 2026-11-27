"use client";

import {
  NEW_TRANSACTION_HREF,
  openNewTransactionHere,
} from "@/features/transactions/new-transaction";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AureonLogo } from "@/components/brand/aureon-logo";
import { ProfileMenu, ThemeToggle } from "@/components/brand/brand-controls";
import { Button, Kbd } from "@/components/ui/button";
import {
  AREAS,
  isActive,
  SIDEBAR_GROUPS,
  type AreaId,
} from "@/lib/config/navigation";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { DataStatus } from "./data-status";
import { NAV_ICONS } from "./nav-icons";

function NavItem({ id, pathname }: { id: AreaId; pathname: string }) {
  const area = AREAS[id];
  const Icon = NAV_ICONS[id];
  const active = isActive(pathname, area.href);
  return (
    <Link
      href={area.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-2.5 rounded-sm px-2.5 type-nav text-ink-2 hover:bg-surface-hover hover:text-ink",
        // Active: Forest tint with a Heritage Gold hairline on the left edge (brand accent).
        active &&
          "bg-forest-tint font-semibold text-forest before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-gold hover:bg-forest-tint hover:text-forest",
      )}
    >
      <Icon
        aria-hidden="true"
        className="size-4.5 shrink-0"
        strokeWidth={1.5}
      />
      {area.label}
    </Link>
  );
}

/** Desktop sidebar (≥1200px): AUREON logo, icon + label navigation, local profile and theme switch. */
export function Sidebar() {
  return <SidebarView pathname={usePathname()} />;
}

/**
 * Rendered with an explicit pathname so the app shell can show it inside a Suspense
 * fallback while the pathname is unknown (prerendered detail shells, Step 03).
 */
export function SidebarView({ pathname }: { pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-(--layout-sidebar) shrink-0 flex-col border-r border-line bg-paper-2 px-4 py-6 desktop:flex">
      <Link
        href="/"
        aria-label={es.brand.home}
        className="mb-6 block px-2 pt-1"
        data-testid="brand-logo"
      >
        <AureonLogo className="h-9 w-auto" />
      </Link>
      <Button asChild variant="primary" className="mb-5 w-full justify-between">
        <Link
          href={NEW_TRANSACTION_HREF}
          onClick={(e) => openNewTransactionHere(e, pathname)}
        >
          {es.nav.newTransaction}
          <Kbd>N</Kbd>
        </Link>
      </Button>
      <nav aria-label={es.nav.primaryLabel} className="flex flex-col gap-1">
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label ?? "main"} className="flex flex-col gap-1">
            {group.label && (
              <div className="px-2.5 pt-5 pb-1.5 type-label text-ink-2">
                {group.label}
              </div>
            )}
            {group.areas.map((id) => (
              <NavItem key={id} id={id} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
        <NavItem id="settings" pathname={pathname} />
        <DataStatus />
        <div className="mt-2 flex items-center gap-1 border-t border-line pt-3">
          <div className="min-w-0 flex-1">
            <ProfileMenu pathname={pathname} />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
