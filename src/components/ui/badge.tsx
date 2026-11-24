import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Status badges (Controls): dot + text, never colour alone. */
const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1.5 rounded-xs px-2 type-caption font-medium whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:content-['']",
  {
    variants: {
      tone: {
        positive: "bg-forest-tint text-forest",
        soon: "bg-warning-tint text-warning-text",
        late: "bg-alert-tint text-alert-text",
        neutral: "bg-paper-2 text-ink-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  tone,
  children,
  className,
}: VariantProps<typeof badgeVariants> & {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(badgeVariants({ tone }), className)}>{children}</span>
  );
}

/** "Solo en este dispositivo" (Ledger, D1): records changed here and not yet published. */
export function LocalOnlyMark({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 type-caption text-ink-2">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-3" />
      {label}
    </span>
  );
}
