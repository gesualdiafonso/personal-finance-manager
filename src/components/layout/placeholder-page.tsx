import type { ReactNode } from "react";
import { es } from "@/lib/i18n/es";
import { PageHeader } from "./page-header";

/**
 * Step 01 has no financial features (Step 01 §6). Each area exists as a route with its
 * editorial header so navigation, typography and themes can be validated; the content
 * arrives in later steps.
 */
export function PlaceholderPage({ title, label, before }: { title: string; label?: string; before?: ReactNode }) {
  return (
    <>
      <PageHeader label={label} title={title} />
      {before}
      <p className="max-w-[44ch] type-body text-ink-2">{es.placeholder.laterStep}</p>
    </>
  );
}
