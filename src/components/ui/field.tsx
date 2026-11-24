import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Form fields (Controls): label in `label` above the input, help in body-sm ink-2, error in
 * alert-text with the instruction to fix it. 44px tall on touch formats, 40px on desktop.
 */
export const inputClass =
  "h-11 w-full rounded-sm border border-line-strong bg-surface px-3 type-body text-ink placeholder:text-ink-3 focus-visible:border-lake focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring aria-invalid:border-alert disabled:bg-paper-2 disabled:text-ink-3 desktop:h-10";

export function Field({
  label,
  help,
  error,
  children,
  className,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, help ? helpId : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="type-label text-ink-2">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
      })}
      {error && (
        <p id={errorId} className="type-body-sm text-alert-text">
          {error}
        </p>
      )}
      {help && (
        <p id={helpId} className="type-body-sm text-ink-2">
          {help}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

/** Amounts: right-aligned, tabular figures (Controls: "Inputs de valor alinham à direita"). */
export function MoneyInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      inputMode="decimal"
      autoComplete="off"
      className={cn(inputClass, "num text-right", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "pr-8", className)} {...props} />;
}
