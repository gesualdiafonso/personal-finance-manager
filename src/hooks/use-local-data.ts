"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DependencyList,
} from "react";
import { toAppError, type AppError } from "@/lib/errors/app-error";
import {
  createRepositories,
  type Repositories,
} from "@/services/repositories/repositories";
import { openLocalStore, type LocalDb } from "@/services/storage/local-store";

/**
 * The interface's only door to local data: one IndexedDB connection per tab, reads through
 * the Step 02 services, writes through the repositories (ARCH-01). After every write,
 * `notifyDataChanged` tells every mounted query — in this tab and in other tabs of the same
 * device (BroadcastChannel; nothing leaves the device) — to read again.
 */
const EVENT = "pfm:data-changed";
let dbPromise: Promise<LocalDb> | null = null;
let channel: BroadcastChannel | null = null;

export function getLocalDb(): Promise<LocalDb> {
  if (!dbPromise) {
    dbPromise = openLocalStore()
      .then((db) => {
        // A newer version opened in another tab: let it upgrade, reopen on next use.
        db.addEventListener("versionchange", () => {
          db.close();
          dbPromise = null;
        });
        return db;
      })
      .catch((e: unknown) => {
        dbPromise = null;
        throw e;
      });
  }
  return dbPromise;
}

/** Tests only: forget the connection (each test gets a fresh IndexedDB). */
export async function resetLocalDb(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p.catch(() => null))?.close();
}

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel("pfm-data");
  return channel;
}

export function notifyDataChanged(): void {
  window.dispatchEvent(new Event(EVENT));
  getChannel()?.postMessage("changed");
}

export function onDataChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  const ch = getChannel();
  const onMessage = () => listener();
  ch?.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener(EVENT, listener);
    ch?.removeEventListener("message", onMessage);
  };
}

/** Runs a write through the repositories and refreshes every query. */
export async function mutate<T>(
  work: (repos: Repositories, db: LocalDb) => Promise<T>,
): Promise<T> {
  const db = await getLocalDb();
  const result = await work(createRepositories({ db }), db);
  notifyDataChanged();
  return result;
}

export type QueryState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: AppError };

export function useLocalQuery<T>(
  query: (db: LocalDb) => Promise<T>,
  deps: DependencyList,
): QueryState<T> & { reload: () => void } {
  const [state, setState] = useState<QueryState<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => onDataChanged(reload), [reload]);
  useEffect(() => {
    let cancelled = false;
    getLocalDb()
      .then((db) => queryRef.current(db))
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch(
        (e: unknown) =>
          !cancelled && setState({ status: "error", error: toAppError(e) }),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { ...state, reload };
}
