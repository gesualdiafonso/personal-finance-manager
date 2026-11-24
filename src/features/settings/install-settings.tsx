"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useInstallState } from "@/hooks/use-pwa";
import { es } from "@/lib/i18n/es";
import { promptInstall } from "@/services/pwa/runtime";

const t = es.pwa.install;

/**
 * Settings → Install (Formulário archetype, like Apariencia). Contextual: the app never pops an
 * install banner by itself. Hidden when the app already runs installed; the native prompt when
 * the browser offers it; instructions on iOS; a plain sentence where installing is impossible.
 */
export function InstallSettings() {
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(false);
  if (state === "unknown" || state === "installed") return null;
  return (
    <section aria-labelledby="instalar" className="grid gap-4 border-t border-line py-6 desktop:grid-cols-12 desktop:gap-6" data-testid="install-settings">
      <div className="desktop:col-span-4">
        <h2 id="instalar" className="type-heading">
          {t.title}
        </h2>
        <p className="type-body-sm text-ink-2">{t.hint}</p>
      </div>
      <div className="desktop:col-span-6" data-install-state={state}>
        {state === "available" && (
          <Button
            onClick={async () => {
              const outcome = await promptInstall();
              setDismissed(outcome === "dismissed");
            }}
          >
            {t.action}
          </Button>
        )}
        {state === "ios" && <p className="max-w-[60ch] type-body">{t.ios}</p>}
        {state === "unsupported" && <p className="max-w-[60ch] type-body text-ink-2">{dismissed ? t.dismissed : t.unsupported}</p>}
      </div>
    </section>
  );
}
