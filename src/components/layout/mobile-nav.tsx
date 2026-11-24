"use client";

import { CalendarDays, Ellipsis, House, List, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AREAS, isActive, OBLIGATION_AREAS, SIDEBAR_GROUPS, type ObligationArea } from "@/lib/config/navigation";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { readPreference } from "@/services/storage/preferences";

function useLastObligationArea(): ObligationArea {
  return useSyncExternalStore(
    () => () => {},
    () => readPreference("pfm.obligations.lastArea") ?? "bills",
    () => "bills",
  );
}

function TabLink({ href, label, Icon, active }: { href: string; label: string; Icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex min-h-11 flex-col items-center justify-center gap-0.5 type-caption text-ink-2", active && "font-semibold text-forest")}
    >
      <Icon aria-hidden="true" className="size-5.5" strokeWidth={1.5} />
      {label}
    </Link>
  );
}

/** "Más": the index of all nine areas as a bottom sheet (docs/design-system NavMobile). */
function MoreSheet({ onClose, pathname }: { onClose: () => void; pathname: string }) {
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const groups = [...SIDEBAR_GROUPS, { label: null, areas: ["settings" as const] }];
  return (
    <div className="fixed inset-0 z-40 landscape:hidden">
      <button type="button" aria-label={es.nav.mobile.close} className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={es.nav.mobile.more}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-lg bg-surface pt-2 pb-6 shadow-overlay safe-bottom"
      >
        <div aria-hidden="true" className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-line" />
        <nav aria-label={es.nav.primaryLabel}>
          {groups.map((group, gi) => (
            <div key={group.label ?? `g${gi}`}>
              {group.label && <div className="px-5 pt-4 pb-1.5 type-label text-ink-2">{group.label}</div>}
              {group.areas.map((id, i) => {
                const area = AREAS[id];
                const active = isActive(pathname, area.href);
                return (
                  <Link
                    key={id}
                    ref={gi === 0 && i === 0 ? first : undefined}
                    href={area.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex h-12 items-center border-b border-line px-5 type-body", active && "font-semibold text-forest")}
                  >
                    {area.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}

/** Phone and tablet portrait (<1024px): tab bar Inicio · Transacciones · + · Obligaciones · Más. */
export function TabBar() {
  const pathname = usePathname();
  const lastObligation = useLastObligationArea();
  const [moreOpen, setMoreOpen] = useState(false);
  const obligationActive = OBLIGATION_AREAS.some((id) => isActive(pathname, AREAS[id].href));
  return (
    <>
      <nav
        aria-label={es.nav.primaryLabel}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 bg-paper px-2 pt-1.5 shadow-tabbar safe-bottom landscape:hidden"
      >
        <TabLink href={AREAS.dashboard.href} label={es.nav.mobile.home} Icon={House} active={isActive(pathname, "/")} />
        <TabLink href={AREAS.transactions.href} label={es.nav.mobile.transactions} Icon={List} active={isActive(pathname, AREAS.transactions.href)} />
        <div className="flex items-center justify-center">
          <Link
            href={AREAS.transactions.href}
            aria-label={es.nav.newTransaction}
            className="grid size-13 place-items-center rounded-full bg-forest text-on-primary"
          >
            <Plus aria-hidden="true" className="size-6" strokeWidth={1.75} />
          </Link>
        </div>
        <TabLink href={AREAS[lastObligation].href} label={es.nav.mobile.obligations} Icon={CalendarDays} active={obligationActive} />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className="flex min-h-11 flex-col items-center justify-center gap-0.5 type-caption text-ink-2"
        >
          <Ellipsis aria-hidden="true" className="size-5.5" strokeWidth={1.5} />
          {es.nav.mobile.more}
        </button>
      </nav>
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} pathname={pathname} />}
    </>
  );
}
