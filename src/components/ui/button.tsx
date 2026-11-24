import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * shadcn/ui Button pattern, restyled with the PFM tokens (docs/design-system/cores.md §3).
 * Variants are reduced to the four the Design System allows; only one `primary` may be
 * visible at a time (rule P-17).
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent type-nav transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:pointer-events-none disabled:bg-paper-2 disabled:text-ink-3",
  {
    variants: {
      variant: {
        primary: "bg-forest text-on-primary hover:bg-forest-hover active:bg-forest-pressed",
        secondary: "border-line-strong bg-transparent text-ink hover:bg-paper-2 active:bg-line disabled:border-line disabled:bg-transparent",
        ghost: "bg-transparent text-ink hover:bg-paper-2 active:bg-line disabled:bg-transparent",
        destructive: "bg-alert text-on-alert hover:bg-alert-text active:bg-alert-text",
      },
      size: {
        md: "h-9 px-3.5",
        lg: "h-11 px-4",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/** Keyboard shortcut hint inside a button, e.g. "N". */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn("rounded-xs border border-current px-1.5 type-caption opacity-60", className)}
      {...props}
    />
  );
}
