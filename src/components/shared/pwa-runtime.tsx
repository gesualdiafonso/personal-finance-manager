"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useUpdateAvailable } from "@/hooks/use-pwa";
import { es } from "@/lib/i18n/es";
import { applyUpdate, registerServiceWorker, startInstallCapture } from "@/services/pwa/runtime";

/**
 * Root-level PWA runtime (docs/PWA.md): captures the install prompt, registers /sw.js in
 * production builds only (in development a caching worker would serve stale code) and offers
 * a new version when one is waiting. Mounted once in the root layout.
 */
export function PwaRuntime() {
  useEffect(() => {
    startInstallCapture();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    registerServiceWorker().catch(() => {
      // Registration failure leaves the app fully usable online; nothing to show the user.
    });
  }, []);
  return <UpdatePrompt />;
}

/**
 * "Hay una nueva versión": a toast in the Design System's place (bottom-left on desktop, above
 * the tab bar on the phone). Never applied automatically — reloading could interrupt a form.
 */
export function UpdatePrompt() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-24 z-50 flex justify-center landscape:bottom-6 desktop:right-auto desktop:bottom-8 desktop:left-8 print:hidden"
      data-testid="update-prompt"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-sm bg-ink px-4 py-2.5 text-paper shadow-overlay">
        <p className="type-body-sm">{es.pwa.update}</p>
        <Button variant="ghost" className="text-paper hover:bg-ink-2" onClick={() => applyUpdate()}>
          {es.pwa.updateAction}
        </Button>
      </div>
    </div>
  );
}
