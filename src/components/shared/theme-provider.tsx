"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  readPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/services/storage/preferences";

/** Browser chrome colour per theme (PWA status bar), from tokens bg-paper. */
const THEME_COLOR: Record<ResolvedTheme, string> = { paper: "#F5F3ED", dark: "#161A17" };

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const listeners = new Set<() => void>();
/** Used only when LocalStorage is unavailable: the choice then lasts for this session. */
let sessionPreference: ThemePreference | null = null;
function notify(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) listener();
  };
  media.addEventListener("change", listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string {
  const preference = readPreference(THEME_STORAGE_KEY) ?? sessionPreference ?? "system";
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return `${preference}|${resolveTheme(preference, prefersDark)}`;
}

function getServerSnapshot(): string {
  return "system|paper";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [preference, resolved] = snapshot.split("|") as [ThemePreference, ResolvedTheme];

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[resolved]);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    sessionPreference = writePreference(THEME_STORAGE_KEY, next) ? null : next;
    notify();
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}
