"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  readPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/services/storage/preferences";

/** Browser chrome colour per theme (PWA status bar), from tokens bg-paper. */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  paper: "#F4F0E7",
  dark: "#0E1612",
};

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

/** Only marks that a ThemeProvider is mounted (the theme itself is read from the store). */
const ThemeContext = createContext<boolean>(false);

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
  const preference =
    readPreference(THEME_STORAGE_KEY) ?? sessionPreference ?? "system";
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return `${preference}|${resolveTheme(preference, prefersDark)}`;
}

function getServerSnapshot(): string {
  return "system|paper";
}

function useThemeSnapshot(): [ThemePreference, ResolvedTheme] {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return snapshot.split("|") as [ThemePreference, ResolvedTheme];
}

function setThemePreference(next: ThemePreference): void {
  sessionPreference = writePreference(THEME_STORAGE_KEY, next) ? null : next;
  notify();
}

/**
 * Applies the resolved theme to <html> and the browser chrome colour. It does not pass the
 * theme down through context: a context value that changes after the root hydrates reaches
 * Suspense boundaries that hydrate later (sidebar, phone header) and makes their markup
 * differ from the server HTML (React error #418, Step 10 QA). Each consumer reads the store
 * itself with useTheme(), so React uses the server snapshot while that consumer hydrates.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [, resolved] = useThemeSnapshot();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLOR[resolved]);
  }, [resolved]);

  return <ThemeContext.Provider value={true}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  if (!useContext(ThemeContext))
    throw new Error("useTheme must be used inside <ThemeProvider>");
  const [preference, resolved] = useThemeSnapshot();
  return { preference, resolved, setPreference: setThemePreference };
}
