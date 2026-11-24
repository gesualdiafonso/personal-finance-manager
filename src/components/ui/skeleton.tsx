import { cn } from "@/lib/utils/cn";

/** Loading placeholder in the shape of the content (rule O-09), never a page spinner. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-xs bg-paper-2 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
