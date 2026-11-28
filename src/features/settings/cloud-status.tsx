"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { es } from "@/lib/i18n/es";
import { parseSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseHealth } from "@/lib/supabase/health";

const t = es.cloud;

/**
 * Configuración → Nube (Supabase), Step 12. Shows whether the public Supabase variables are set
 * and, on request, the real result of GET /api/health/supabase. Nothing here reads or sends
 * financial data; the local data and the local login remain active until Step 14.
 */
export function CloudStatus() {
  const config = parseSupabaseConfig();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/health/supabase", { cache: "no-store" });
      const health = (await res.json()) as SupabaseHealth;
      setResult(
        health.status === "ok"
          ? t.results.ok(health.latencyMs)
          : health.status === "error"
            ? t.results.error(health.httpStatus)
            : t.results[health.status],
      );
    } catch {
      setResult(t.results.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="nube" className="grid gap-4 border-t border-line py-6 desktop:grid-cols-12 desktop:gap-6" data-testid="cloud-status">
      <div className="desktop:col-span-4">
        <h2 id="nube" className="type-heading">
          {t.title}
        </h2>
        <p className="type-body-sm text-ink-2">{config.status === "configured" ? t.hintActive : t.hint}</p>
      </div>
      <div className="grid min-w-0 content-start gap-3 desktop:col-span-8">
        <p className="flex flex-wrap items-center gap-2 type-body-sm">
          <span className="text-ink-2">{t.statusLabel}:</span>
          <span data-testid="cloud-config-status">
            <Badge tone={config.status === "configured" ? "positive" : config.status === "invalid" ? "soon" : "neutral"}>{t.states[config.status]}</Badge>
          </span>
          {config.status === "configured" && <span className="text-ink-2">{t.project(new URL(config.url).host)}</span>}
        </p>
        {config.status === "not-configured" && <p className="type-caption text-ink-2">{t.notConfiguredHelp}</p>}
        {config.status === "invalid" && <p className="type-caption text-warning-text">{t.invalidHelp}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => void check()} disabled={busy} aria-busy={busy}>
            {busy ? t.checking : t.check}
          </Button>
          {result && (
            <p role="status" className="type-body-sm text-ink" data-testid="cloud-health-result">
              {result}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
