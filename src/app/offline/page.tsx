import type { Metadata } from "next";
import { AureonLogo } from "@/components/brand/aureon-logo";
import { es } from "@/lib/i18n/es";

export const metadata: Metadata = { title: es.offline.title };

/**
 * Fallback served by the service worker for navigations to pages that are not cached yet
 * while offline. Static, outside the app shell, so it can always be precached.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center px-6">
      <AureonLogo className="mb-10 h-8 w-auto" />
      <h1 className="mb-4 type-title-page-mobile">{es.offline.title}</h1>
      <p className="mb-6 type-body text-ink-2">{es.offline.body}</p>
      {/* A full page load on purpose: retry the network, not a client-side navigation. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="type-nav text-lake underline-offset-4 hover:underline">
        {es.offline.retry}
      </a>
    </main>
  );
}
