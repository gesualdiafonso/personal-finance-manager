"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/components/shared/theme-provider";
import { AREAS, isActive } from "@/lib/config/navigation";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { AureonMonogram } from "./aureon-logo";

/**
 * Quick light/dark switch. It writes the same preference as Configuración → Apariencia
 * (LocalStorage `pfm.theme`, applied before the first paint by THEME_INIT_SCRIPT); "Sistema"
 * stays available there.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setPreference } = useTheme();
  const dark = resolved === "dark";
  const label = dark ? es.brand.toLight : es.brand.toDark;
  return (
    <button
      type="button"
      onClick={() => setPreference(dark ? "paper" : "dark")}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-surface-hover hover:text-ink",
        className,
      )}
      data-testid="theme-toggle"
    >
      {dark ? (
        <Sun aria-hidden="true" className="size-4.5" strokeWidth={1.5} />
      ) : (
        <Moon aria-hidden="true" className="size-4.5" strokeWidth={1.5} />
      )}
    </button>
  );
}

/**
 * Profile access. AUREON is single-user and local-first: there is no online account, so the
 * profile is this device's local profile, managed in Configuración (data, backups, theme).
 */
export function ProfileLink({
  pathname,
  compact = false,
}: {
  pathname: string;
  compact?: boolean;
}) {
  const active = isActive(pathname, AREAS.settings.href);
  return (
    <Link
      href={AREAS.settings.href}
      aria-label={compact ? es.brand.profileLabel : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-sm p-1.5 hover:bg-surface-hover",
        active && "bg-forest-tint",
      )}
      data-testid="profile-link"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-tint ring-1 ring-gold/40">
        <AureonMonogram className="size-5" />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate type-body-sm font-semibold text-ink">
            {es.brand.profile}
          </span>
          <span className="block truncate type-caption text-ink-2">
            {es.brand.profileHint}
          </span>
        </span>
      )}
    </Link>
  );
}
