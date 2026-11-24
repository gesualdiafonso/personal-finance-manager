import { z } from "zod";

/**
 * LocalStorage holds ONLY lightweight, non-financial preferences (decision D1).
 * The list of keys is closed: anything else (amounts, descriptions, balances, the
 * passphrase or keys) is forbidden here (docs/architecture/local-persistence.md).
 */
export const THEME_PREFERENCES = ["system", "paper", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

const preferenceSchemas = {
  "pfm.theme": z.enum(THEME_PREFERENCES),
  "pfm.obligations.lastArea": z.enum(["bills", "cards", "recurrences"]),
  "pfm.quickAdd.lastAccountId": z.uuid(),
  "pfm.dashboard.period": z.string().regex(/^\d{4}-\d{2}$/),
} as const;

export type PreferenceKey = keyof typeof preferenceSchemas;
export type PreferenceValue<K extends PreferenceKey> = z.infer<(typeof preferenceSchemas)[K]>;
export const PREFERENCE_KEYS = Object.keys(preferenceSchemas) as PreferenceKey[];

export const THEME_STORAGE_KEY = "pfm.theme" satisfies PreferenceKey;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // disabled storage, privacy mode, sandboxed frame
  }
}

/** Returns the stored value, or null when missing, invalid or storage is unavailable. */
export function readPreference<K extends PreferenceKey>(key: K): PreferenceValue<K> | null {
  try {
    const raw = storage()?.getItem(key);
    if (raw == null) return null;
    const parsed = preferenceSchemas[key].safeParse(raw);
    return parsed.success ? (parsed.data as PreferenceValue<K>) : null;
  } catch {
    return null;
  }
}

/** Writes a validated preference. Returns false when storage is unavailable. */
export function writePreference<K extends PreferenceKey>(key: K, value: PreferenceValue<K>): boolean {
  const parsed = preferenceSchemas[key].parse(value);
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(key, String(parsed));
    return true;
  } catch {
    return false;
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "paper";
  return preference;
}

/**
 * Inline script for <head>: applies the stored theme before the first paint so there is
 * no flash (Next.js guide "Preventing flash before hydration"). Kept tiny and dependency-free.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");if(p!=="paper"&&p!=="dark")p=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"paper";document.documentElement.setAttribute("data-theme",p)}catch(e){}})()`;
