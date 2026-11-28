"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getLocalDb, notifyDataChanged } from "@/hooks/use-local-data";
import { setNumericDateFormat } from "@/lib/formatting/date";
import { parseSupabaseConfig } from "@/lib/supabase/config";
import * as auth from "@/services/auth/auth-service";
import type { AuthState } from "@/services/auth/auth-service";
import { AuthContext, type AuthContextValue } from "./auth-state";
import { CloudAuthProvider } from "./cloud-auth-provider";

export { useAuth, useProfile } from "./auth-state";

/**
 * Who is signed in on this browser, for the whole application (D-AUTH-04). One provider at
 * the root; every module reads the same profile through `useProfile()` / `useAuth()`, so a
 * change made once is seen everywhere.
 *
 * Session marker: a tab session ("Recordar sesión" off) is tied to `sessionStorage`, which
 * the browser empties when it closes. Only an opaque random id is kept there; LocalStorage
 * holds nothing about the account.
 */
export const TAB_SESSION_KEY = "aureon.session";
const DATA_EVENT = "pfm:data-changed";
const AUTH_CHANNEL = "aureon-auth";
/** How often the session is re-checked while the app is open, and activity is recorded. */
const CHECK_MS = 60_000;

type Status = "loading" | "signed-out" | "signed-in";

/** Supabase configured at build time → Supabase Auth (Step 14); otherwise the local account. */
export const AUTH_MODE = parseSupabaseConfig().status === "configured" ? "cloud" : "local";

export function AuthProvider({ children }: { children: ReactNode }) {
  return AUTH_MODE === "cloud" ? <CloudAuthProvider>{children}</CloudAuthProvider> : <LocalAuthProvider>{children}</LocalAuthProvider>;
}

function readTabSession(): string | null {
  try {
    return window.sessionStorage.getItem(TAB_SESSION_KEY);
  } catch {
    return null;
  }
}
function writeTabSession(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(TAB_SESSION_KEY, id);
    else window.sessionStorage.removeItem(TAB_SESSION_KEY);
  } catch {
    // Storage blocked (private mode): the session then lasts only while the page is open.
  }
}

/** Step 10 local account (Supabase not configured). Behaviour unchanged. */
export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [hasAccount, setHasAccount] = useState(false);
  const [state, setState] = useState<AuthState | null>(null);
  const [endedReason, setEndedReason] = useState<"expired" | null>(null);
  // Latest state for callbacks; written together with the state in `apply`.
  const stateRef = useRef<AuthState | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastTouch = useRef(0);

  const apply = useCallback((next: AuthState | null, account: boolean, reason: "expired" | null = null) => {
    stateRef.current = next;
    setState(next);
    setHasAccount(account);
    setStatus(next ? "signed-in" : "signed-out");
    if (next) setNumericDateFormat(next.view.profile.dateFormat);
    if (!next && reason) setEndedReason(reason);
  }, []);

  const resolve = useCallback(async () => {
    const db = await getLocalDb();
    const before = stateRef.current;
    const next = await auth.resolveSession(db, { tabSessionId: readTabSession(), preferredId: before?.session.id ?? null });
    apply(next, await auth.hasAccount(db), before && !next ? "expired" : null);
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void resolve().catch(() => {
      if (!cancelled) apply(null, false);
    });
    const recheck = () => void resolve().catch(() => undefined);
    const timer = window.setInterval(recheck, CHECK_MS);
    const onVisible = () => document.visibilityState === "visible" && recheck();
    // A profile or settings change in this or another tab: read the profile again.
    const onData = () => recheck();
    // Record activity (a tab session ends after 30 minutes without it), at most once a minute.
    const onActivity = () => {
      const current = stateRef.current;
      if (!current || current.session.remember || Date.now() - lastTouch.current < CHECK_MS) return;
      lastTouch.current = Date.now();
      void getLocalDb().then((db) => auth.touchSession(db, current.session.id));
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(DATA_EVENT, onData);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    if (typeof BroadcastChannel !== "undefined") {
      channelRef.current = new BroadcastChannel(AUTH_CHANNEL);
      channelRef.current.onmessage = recheck;
    }
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(DATA_EVENT, onData);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [apply, resolve]);

  const broadcast = () => channelRef.current?.postMessage("changed");

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: "local",
      status,
      hasAccount,
      state,
      view: state?.view ?? null,
      identity: null,
      offline: false,
      linkSummary: null,
      localAccountHint: null,
      cloudProfileSynced: null,
      cloud: null,
      endedReason,
      async signIn(input) {
        const db = await getLocalDb();
        const next = await auth.login(db, input);
        writeTabSession(next.session.remember ? null : next.session.id);
        setEndedReason(null);
        apply(next, true);
      },
      async signUp(input) {
        const db = await getLocalDb();
        const result = await auth.register(db, input);
        writeTabSession(result.session.remember ? null : result.session.id);
        setEndedReason(null);
        apply(result, true);
        notifyDataChanged(); // the preferred currency may have changed the settings
        return result;
      },
      async signOut() {
        const current = stateRef.current;
        if (current) await auth.logout(await getLocalDb(), current.session.id);
        writeTabSession(null);
        apply(null, true);
        broadcast();
      },
      async saveProfile(update) {
        const current = stateRef.current;
        if (!current) throw new Error("Not signed in");
        const view = await auth.updateProfile(await getLocalDb(), current.view.profile.id, update);
        apply({ ...current, view }, true);
        notifyDataChanged(); // every module re-reads currency and locale
        return view;
      },
      async changePassword(input) {
        const current = stateRef.current;
        if (!current) throw new Error("Not signed in");
        await auth.changePassword(await getLocalDb(), { ...input, userId: current.view.profile.id, currentSessionId: current.session.id });
        broadcast();
      },
    }),
    [status, hasAccount, state, endedReason, apply],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
