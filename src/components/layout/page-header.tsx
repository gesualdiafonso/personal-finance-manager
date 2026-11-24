import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Editorial page header (arquitetura.md "Cabeçalho"): a context label above a serif title,
 * one optional action on the right. There is no global top bar.
 */
export function PageHeader({
  label,
  title,
  actions,
  className,
}: {
  label?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex items-end justify-between gap-6 desktop:mb-12", className)}>
      <div className="min-w-0">
        {label && <div className="mb-1 type-label text-ink-2 desktop:mb-2">{label}</div>}
        <h1 className="type-title-page-mobile desktop:type-title-page">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
