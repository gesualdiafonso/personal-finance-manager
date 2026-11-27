"use client";

import { LogOut, Moon, Settings, Sun, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/shared/theme-provider";
import { AREAS, isActive } from "@/lib/config/navigation";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { AureonMonogram } from "./aureon-logo";
import { profileInitials } from "@/domain/profile";
import { useAuth, useProfile } from "@/features/auth/auth-context";

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
 * Profile menu (global user profile). Shows who is signed in on this device and leads to
 * Mi perfil, Configuración and Cerrar sesión. A disclosure of links (not an ARIA menu):
 * Tab moves through it, Escape or a click outside closes it.
 */
export function ProfileMenu({
  pathname,
  compact = false,
  placement = "up",
}: {
  pathname: string;
  compact?: boolean;
  placement?: "up" | "down" | "right";
}) {
  const profile = useProfile();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const name = profile ? profile.profile.fullName || profile.profile.username : es.brand.profile;
  const active = isActive(pathname, "/perfil") || isActive(pathname, AREAS.settings.href);
  const item = "flex min-h-11 items-center gap-2.5 rounded-xs px-3 type-body-sm text-ink hover:bg-surface-hover desktop:min-h-9";
  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={compact ? `${es.profile.menu}: ${name}` : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn("flex w-full min-w-0 items-center gap-2.5 rounded-sm p-1.5 text-left hover:bg-surface-hover", active && "bg-forest-tint")}
        data-testid="profile-menu"
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-tint type-caption font-semibold text-gold-text ring-1 ring-gold/40">
          {profile ? profileInitials(profile.profile) : <AureonMonogram className="size-5" />}
        </span>
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate type-body-sm font-semibold text-ink" data-testid="profile-menu-name">
              {name}
            </span>
            <span className="block truncate type-caption text-ink-2">{profile ? `@${profile.profile.username}` : es.brand.profileHint}</span>
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className={cn(
            "absolute z-50 grid w-56 gap-0.5 rounded-sm border border-line bg-surface p-1.5 shadow-overlay",
            placement === "up" && "bottom-full left-0 mb-2",
            placement === "down" && "top-full right-0 mt-2",
            placement === "right" && "bottom-0 left-full ml-2",
          )}
          data-testid="profile-menu-panel"
        >
          <Link href="/perfil" className={item} onClick={() => setOpen(false)} aria-current={isActive(pathname, "/perfil") ? "page" : undefined}>
            <UserRound aria-hidden="true" className="size-4 text-ink-2" />
            {es.profile.menuProfile}
          </Link>
          <Link href={AREAS.settings.href} className={item} onClick={() => setOpen(false)} aria-current={isActive(pathname, AREAS.settings.href) ? "page" : undefined}>
            <Settings aria-hidden="true" className="size-4 text-ink-2" />
            {es.profile.menuSettings}
          </Link>
          <button
            type="button"
            className={cn(item, "text-left")}
            onClick={() => {
              setOpen(false);
              // The route gate sends the now signed-out user to /entrar.
              void signOut();
            }}
          >
            <LogOut aria-hidden="true" className="size-4 text-ink-2" />
            {es.profile.logout}
          </button>
        </div>
      )}
    </div>
  );
}
