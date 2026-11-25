"use client";

import { useEffect, useState } from "react";
import { useLocalStoreStatus } from "@/components/layout/data-status";
import { es } from "@/lib/i18n/es";
import {
  checkLocalIntegrity,
  openLocalStore,
} from "@/services/storage/local-store";

/**
 * Settings → Local data: proves the IndexedDB foundation on the device (version, publication,
 * pending changes, integrity). Shows counts and states only — never financial values.
 */
export function LocalDataPanel() {
  const state = useLocalStoreStatus();
  const [integrity, setIntegrity] = useState<"checking" | "ok" | "problems">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
    openLocalStore()
      .then(async (db) => {
        const report = await checkLocalIntegrity(db);
        db.close();
        if (!cancelled) setIntegrity(report.ok ? "ok" : "problems");
      })
      .catch(() => {
        if (!cancelled) setIntegrity("problems");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      aria-labelledby="datos-locales"
      className="grid gap-4 border-t border-line py-6 desktop:grid-cols-12 desktop:gap-6"
    >
      <div className="desktop:col-span-4">
        <h2 id="datos-locales" className="type-heading">
          {es.settings.localData}
        </h2>
        <p className="type-body-sm text-ink-2">{es.settings.localDataHint}</p>
      </div>
      <dl className="desktop:col-span-6" data-testid="local-data-panel">
        <Row term={es.settings.localStore}>
          {state.kind === "loading" && "…"}
          {state.kind === "unavailable" && (
            <span className="text-alert-text">
              {es.dataStatus.storageUnavailable}
            </span>
          )}
          {state.kind === "ready" && (
            <span data-testid="local-store-ready">
              {es.settings.storeReady(state.status.version)}
            </span>
          )}
        </Row>
        <Row term={es.settings.publication}>
          {state.kind === "ready" &&
            (state.status.latestPublication
              ? es.settings.revision(
                  state.status.latestPublication.dataRevision,
                )
              : es.dataStatus.noPublication)}
        </Row>
        <Row term={es.settings.pendingChanges}>
          {state.kind === "ready" && (
            <span className="num">{state.status.pendingOperations}</span>
          )}
        </Row>
        <Row term={es.settings.integrity}>
          {integrity === "checking" && "…"}
          {integrity === "ok" && (
            <span data-testid="integrity-ok">{es.settings.integrityOk}</span>
          )}
          {integrity === "problems" && (
            <span className="text-alert-text">
              {es.settings.integrityProblems}
            </span>
          )}
        </Row>
      </dl>
    </section>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3">
      <dt className="type-body-sm text-ink-2">{term}</dt>
      <dd className="type-body text-right">{children}</dd>
    </div>
  );
}
