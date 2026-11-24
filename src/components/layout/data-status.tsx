"use client";

import { useEffect, useState } from "react";
import { onDataChanged } from "@/hooks/use-local-data";
import { formatDate, toLocalDate } from "@/lib/formatting/date";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { getLocalStoreStatus, openLocalStore, type LocalStoreStatus } from "@/services/storage/local-store";

type State = { kind: "loading" } | { kind: "ready"; status: LocalStoreStatus } | { kind: "unavailable" };

/** Shared hook: opens IndexedDB and reads the local status (no financial values). */
export function useLocalStoreStatus(): State {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  // Pending changes go up after every local write (O-15).
  useEffect(() => onDataChanged(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    let cancelled = false;
    openLocalStore()
      .then(async (db) => {
        const status = await getLocalStoreStatus(db);
        db.close();
        if (!cancelled) setState({ kind: "ready", status });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return state;
}

/**
 * Where the data on screen comes from and what is pending export (rule O-15).
 * There is no automatic sync (D1), so this never says "synchronised".
 */
export function DataStatus({ className }: { className?: string }) {
  const state = useLocalStoreStatus();
  if (state.kind === "loading") return <div className={cn("h-10", className)} aria-hidden="true" />;
  if (state.kind === "unavailable") {
    return <p className={cn("px-2.5 pt-2 type-caption text-alert-text", className)}>{es.dataStatus.storageUnavailable}</p>;
  }
  const { latestPublication, pendingOperations } = state.status;
  return (
    <div className={cn("flex flex-col gap-0.5 px-2.5 pt-2 type-caption text-ink-2", className)} data-testid="data-status">
      <p className="flex items-center gap-1.5">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", latestPublication ? "bg-forest" : "bg-ink-3")} />
        {latestPublication
          ? es.dataStatus.publishedAt(formatDate(toLocalDate(new Date(latestPublication.importedAt)), "short"))
          : es.dataStatus.noPublication}
      </p>
      <p className="pl-3">{pendingOperations > 0 ? es.dataStatus.pendingExport(pendingOperations) : es.dataStatus.nothingToExport}</p>
    </div>
  );
}
