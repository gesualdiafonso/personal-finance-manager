import { es } from "@/lib/i18n/es";

/**
 * The nine functional areas (docs/design-system/arquitetura.md). Each area is its own
 * destination with its own route on every device; "Obligaciones" on the phone is only a
 * way to reach three of them (rule O-13).
 * Routes are in Spanish with the interface language (ADR-005); the Design System listed
 * Portuguese slugs.
 */
export const AREAS = {
  dashboard: { href: "/", label: es.nav.areas.dashboard },
  transactions: { href: "/transacciones", label: es.nav.areas.transactions },
  bills: { href: "/cuentas-domesticas", label: es.nav.areas.bills },
  cards: { href: "/tarjetas", label: es.nav.areas.cards },
  recurrences: { href: "/recurrencias", label: es.nav.areas.recurrences },
  accounts: { href: "/cuentas", label: es.nav.areas.accounts },
  budget: { href: "/presupuesto", label: es.nav.areas.budget },
  reports: { href: "/informes", label: es.nav.areas.reports },
  settings: { href: "/configuracion", label: es.nav.areas.settings },
} as const;

export type AreaId = keyof typeof AREAS;

/** Sidebar order and groups (desktop). Settings sits in the footer. */
export const SIDEBAR_GROUPS: { label: string | null; areas: AreaId[] }[] = [
  { label: null, areas: ["dashboard", "transactions"] },
  { label: es.nav.groups.obligations, areas: ["bills", "cards", "recurrences"] },
  { label: es.nav.groups.assets, areas: ["accounts"] },
  { label: es.nav.groups.plan, areas: ["budget", "reports"] },
];

export const OBLIGATION_AREAS = ["bills", "cards", "recurrences"] as const satisfies readonly AreaId[];
export type ObligationArea = (typeof OBLIGATION_AREAS)[number];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
