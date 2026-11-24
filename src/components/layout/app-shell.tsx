import { Suspense, type ReactNode } from "react";
import { es } from "@/lib/i18n/es";
import { ConnectionStatus } from "./connection-status";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { TabBar, TabBarView } from "./mobile-nav";
import { Rail, RailView } from "./rail";
import { Sidebar, SidebarView } from "./sidebar";

/**
 * Application frame. Three navigations, one per format (responsivo.md):
 * sidebar ≥1200px · rail 1024–1199px · tab bar <1024px.
 * Content is capped at 1240px; wider screens grow negative space, not columns.
 * The navigations read the pathname; on detail shells prerendered without a known id
 * (/cuentas/[id], /tarjetas/[id]) they render with no active item until hydrated (Suspense).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        {es.app.skipToContent}
      </a>
      <Suspense fallback={<SidebarView pathname="" />}>
        <Sidebar />
      </Suspense>
      <Suspense fallback={<RailView pathname="" />}>
        <Rail />
      </Suspense>
      <main
        id="contenido"
        className="min-w-0 flex-1 px-4 pt-14 pb-28 tablet:px-8 landscape:pb-16 desktop:max-w-(--layout-content-max) desktop:px-12 desktop:pt-10 print:max-w-none print:p-0"
      >
        <ConnectionStatus />
        {children}
      </main>
      <Suspense fallback={<TabBarView pathname="" />}>
        <TabBar />
      </Suspense>
      <Suspense fallback={null}>
        <KeyboardShortcuts />
      </Suspense>
    </div>
  );
}
