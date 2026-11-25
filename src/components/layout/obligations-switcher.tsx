"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  AREAS,
  OBLIGATION_AREAS,
  type ObligationArea,
} from "@/lib/config/navigation";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { writePreference } from "@/services/storage/preferences";

/**
 * Phone / tablet portrait only: segmented control between the three obligation areas.
 * Each segment is its own route; the visited area is remembered so the "Obligaciones" tab
 * reopens it (arquitetura.md, "Garantias do agrupamento").
 */
export function ObligationsSwitcher({ current }: { current: ObligationArea }) {
  useEffect(() => {
    writePreference("pfm.obligations.lastArea", current);
  }, [current]);
  return (
    <nav
      aria-label={es.nav.groups.obligations}
      className="mb-6 grid grid-cols-[1.25fr_1fr_1.1fr] rounded-sm bg-paper-2 p-0.75 landscape:hidden"
    >
      {OBLIGATION_AREAS.map((id) => (
        <Link
          key={id}
          href={AREAS[id].href}
          aria-current={id === current ? "page" : undefined}
          className={cn(
            "grid h-8 place-items-center rounded-xs type-body-sm text-ink-2",
            id === current &&
              "bg-surface font-semibold text-ink ring-1 ring-line",
          )}
        >
          {AREAS[id].label}
        </Link>
      ))}
    </nav>
  );
}
