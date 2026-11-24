import Link from "next/link";
import { es } from "@/lib/i18n/es";

/** Breadcrumb for pages with real depth (arquitetura.md): replaces the context label. */
export function Breadcrumb({ parent }: { parent: { href: string; label: string } }) {
  return (
    <nav aria-label={es.detail.breadcrumb}>
      <Link href={parent.href} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">
        {parent.label}
      </Link>
      <span aria-hidden="true"> ›</span>
    </nav>
  );
}
