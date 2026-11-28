"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { getLocalDb, notifyDataChanged, setActiveLocalDb } from "@/hooks/use-local-data";
import { setNumericDateFormat } from "@/lib/formatting/date";
import type { AuthResult } from "@/lib/supabase/auth-service";
import { updateProfile, type ProfileView } from "@/services/auth/auth-service";
import {
  chooseSeparate,
  linkByMigration,
  linkConfirmed,
  loadIdentityView,
  readOwner,
  resolveIdentity,
  type CloudIdentity,
  type LinkSummary,
} from "@/services/auth/identity-binding";
import { LOCAL_DB_NAME, openLocalStore, type OwnerRecord } from "@/services/storage/local-store";
import { AuthContext, CloudAuthError, type AuthContextValue, type AuthStatus, type CloudActions, type CloudIdentityView } from "./auth-state";
import * as actions from "./cloud-actions";

/**
 * Supabase Auth on the client (Step 14). It never sees a token: it asks the server who is
 * signed in (GET /api/auth/session) and calls Server Actions for every change. Then it binds
 * the identity to ITS local database (identity-binding.ts) before anything is shown.
 *
 * Offline: a verified identity snapshot (id, email, verified flag, time — no token, no
 * password) is kept in localStorage for 14 days, so the PWA opens without a network after a
 * recent online check. A definite "no session" from the server always wins over the snapshot.
 */
export const IDENTITY_SNAPSHOT_KEY = "aureon.cloud.identity";
export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;
const CHECK_MS = 5 * 60_000;
const AUTH_CHANNEL = "aureon-auth";
const DATA_EVENT = "pfm:data-changed";

const userSchema = z.object({ id: z.uuid(), email: z.string().max(320), emailConfirmed: z.boolean(), fullName: z.string().max(200) });
const sessionSchema = z.object({ state: z.literal("authenticated"), user: userSchema });
const snapshotSchema = userSchema.extend({ validatedAt: z.number().int().positive() });
type SessionUser = z.infer<typeof userSchema>;
type Snapshot = z.infer<typeof snapshotSchema>;

type SessionAnswer = { state: "authenticated"; user: SessionUser } | { state: "anonymous" } | { state: "unavailable" };

export async function fetchSessionState(fetchImpl: typeof fetch = fetch): Promise<SessionAnswer> {
  try {
    const response = await fetchImpl("/api/auth/session", { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } });
    if (response.status === 401) return { state: "anonymous" };
    if (response.status !== 200) return { state: "unavailable" };
    const parsed = sessionSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : { state: "unavailable" };
  } catch {
    return { state: "unavailable" };
  }
}

export function readSnapshot(now = Date.now()): Snapshot | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = snapshotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || now - parsed.data.validatedAt > OFFLINE_GRACE_MS || parsed.data.validatedAt > now + 60_000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
function writeSnapshot(user: SessionUser | null) {
  try {
    if (user) window.localStorage.setItem(IDENTITY_SNAPSHOT_KEY, JSON.stringify({ ...user, validatedAt: Date.now() } satisfies Snapshot));
    else window.localStorage.removeItem(IDENTITY_SNAPSHOT_KEY);
  } catch {
    // Storage blocked: no offline access, nothing else changes.
  }
}

const openDb = (name: string) => openLocalStore(undefined, name);

function unwrap<T extends object>(result: AuthResult<T>): T {
  if (!result.ok) throw new CloudAuthError(result.code);
  return result;
}

/** Username of an unmigrated local account in the unowned default database (hint only). */
async function findLocalAccountHint(): Promise<string | null> {
  try {
    const db = await openDb(LOCAL_DB_NAME);
    try {
      if (await readOwner(db)) return null;
      for (const profile of await db.getAll("profiles")) {
        const credential = await db.get("credentials", profile.id);
        if (credential && !credential.disabledAt) return profile.username;
      }
      return null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

interface CloudState {
  status: AuthStatus;
  identity: CloudIdentityView | null;
  view: ProfileView | null;
  owner: OwnerRecord | null;
  offline: boolean;
  linkSummary: LinkSummary | null;
  endedReason: "expired" | null;
}

const INITIAL: CloudState = { status: "loading", identity: null, view: null, owner: null, offline: false, linkSummary: null, endedReason: null };

export function CloudAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CloudState>(INITIAL);
  const [localAccountHint, setLocalAccountHint] = useState<string | null>(null);
  const [cloudProfileSynced, setCloudProfileSynced] = useState<boolean | null>(null);
  const stateRef = useRef<CloudState>(INITIAL);
  const sequence = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const fullNameRef = useRef("");

  const commit = useCallback((next: CloudState) => {
    stateRef.current = next;
    setState(next);
    if (next.view) setNumericDateFormat(next.view.profile.dateFormat);
  }, []);

  const signedOut = useCallback(
    async (reason: "expired" | null, offline = false) => {
      writeSnapshot(null);
      await setActiveLocalDb(LOCAL_DB_NAME); // no connection to the previous identity's data remains
      setLocalAccountHint(await findLocalAccountHint());
      commit({ ...INITIAL, status: "signed-out", endedReason: reason, offline });
    },
    [commit],
  );

  /** Binds the identity to its database and loads its profile. */
  const enter = useCallback(
    async (user: SessionUser, offline: boolean, seq: number) => {
      const identity: CloudIdentity = { userId: user.id, email: user.email, fullName: user.fullName };
      fullNameRef.current = user.fullName;
      const idView: CloudIdentityView = { userId: user.id, email: user.email, emailConfirmed: user.emailConfirmed };
      if (!user.emailConfirmed) {
        await setActiveLocalDb(LOCAL_DB_NAME);
        if (seq === sequence.current) commit({ ...INITIAL, status: "needs-verification", identity: idView, offline });
        return;
      }
      const resolution = await resolveIdentity(identity, openDb);
      if (seq !== sequence.current) return;
      if (resolution.kind === "needs-link") {
        await setActiveLocalDb(LOCAL_DB_NAME);
        commit({ ...INITIAL, status: "needs-link", identity: idView, offline, linkSummary: resolution.summary });
        return;
      }
      await setActiveLocalDb(resolution.dbName);
      const view = await loadIdentityView(await getLocalDb(), resolution.owner);
      if (seq !== sequence.current) return;
      commit({ status: "signed-in", identity: idView, view, owner: resolution.owner, offline, linkSummary: null, endedReason: null });
    },
    [commit],
  );

  const resolve = useCallback(async () => {
    const seq = ++sequence.current;
    const answer = await fetchSessionState();
    if (seq !== sequence.current) return;
    const before = stateRef.current;
    const wasIn = before.status !== "loading" && before.status !== "signed-out";
    if (answer.state === "authenticated") {
      if (wasIn && before.identity && before.identity.userId !== answer.user.id) {
        // Another identity signed in from another tab: close everything of the previous one first.
        await setActiveLocalDb(LOCAL_DB_NAME);
      }
      writeSnapshot(answer.user);
      await enter(answer.user, false, seq);
      return;
    }
    if (answer.state === "anonymous") {
      await signedOut(wasIn || readSnapshot() ? "expired" : null);
      return;
    }
    // Unavailable (offline / Auth server down): a recent verified snapshot keeps the app usable.
    const snapshot = readSnapshot();
    if (snapshot && (!wasIn || before.identity?.userId === snapshot.id)) {
      await enter(snapshot, true, seq);
      return;
    }
    await signedOut(null, true);
  }, [enter, signedOut]);

  useEffect(() => {
    void resolve().catch(() => void signedOut(null));
    const recheck = () => void resolve().catch(() => undefined);
    const timer = window.setInterval(recheck, CHECK_MS);
    const onVisible = () => document.visibilityState === "visible" && recheck();
    const onOnline = () => recheck();
    // A profile or settings change in this or another tab: re-read the profile only.
    const onData = () => {
      const current = stateRef.current;
      if (current.status !== "signed-in" || !current.owner) return;
      void getLocalDb()
        .then((db) => loadIdentityView(db, current.owner!))
        .then((view) => stateRef.current.owner === current.owner && commit({ ...stateRef.current, view }))
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener(DATA_EVENT, onData);
    if (typeof BroadcastChannel !== "undefined") {
      channelRef.current = new BroadcastChannel(AUTH_CHANNEL);
      channelRef.current.onmessage = recheck;
    }
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(DATA_EVENT, onData);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [resolve, signedOut, commit]);

  const broadcast = useCallback(() => channelRef.current?.postMessage("changed"), []);

  const requireIdentity = useCallback((): CloudIdentity => {
    const current = stateRef.current;
    if (!current.identity) throw new CloudAuthError("session-missing");
    return { userId: current.identity.userId, email: current.identity.email, fullName: fullNameRef.current };
  }, []);

  const cloud = useMemo<CloudActions>(
    () => ({
      async signIn(input) {
        unwrap(await actions.cloudSignIn(input));
        await resolve();
        broadcast();
      },
      async signUp(input) {
        const result = unwrap(await actions.cloudSignUp(input));
        if (!result.needsVerification) {
          await resolve();
          broadcast();
        }
        return { needsVerification: result.needsVerification };
      },
      async requestReset(email) {
        unwrap(await actions.cloudRequestReset({ email }));
      },
      async resendVerification(email) {
        unwrap(await actions.cloudResendVerification({ email }));
      },
      async completeReset(input) {
        unwrap(await actions.cloudChangePassword({ newPassword: input.newPassword, confirmation: input.confirmation }));
        await resolve();
        broadcast();
      },
      async signOutEverywhere() {
        await actions.cloudSignOut("global").catch(() => undefined);
        await signedOut(null);
        broadcast();
      },
      async migrateLocalAccount(input) {
        const identity = requireIdentity();
        const db = await openDb(LOCAL_DB_NAME);
        try {
          await linkByMigration(db, identity, input);
        } finally {
          db.close();
        }
        await resolve();
        broadcast();
        notifyDataChanged();
      },
      async linkUnclaimedData() {
        const identity = requireIdentity();
        const db = await openDb(LOCAL_DB_NAME);
        try {
          await linkConfirmed(db, identity);
        } finally {
          db.close();
        }
        await resolve();
        broadcast();
        notifyDataChanged();
      },
      async startSeparate() {
        await chooseSeparate(requireIdentity(), openDb);
        await resolve();
        broadcast();
      },
    }),
    [resolve, broadcast, signedOut, requireIdentity],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: "cloud",
      status: state.status,
      hasAccount: localAccountHint !== null,
      view: state.view,
      state: null,
      identity: state.identity,
      offline: state.offline,
      linkSummary: state.linkSummary,
      localAccountHint,
      cloudProfileSynced,
      endedReason: state.endedReason,
      async signIn() {
        throw new CloudAuthError("invalid-input"); // cloud mode signs in with email: use `cloud.signIn`
      },
      async signUp() {
        throw new CloudAuthError("invalid-input");
      },
      async signOut() {
        // Ends the server session (cookies cleared). The local data of this identity stays on the device.
        await actions.cloudSignOut("local").catch(() => undefined);
        await signedOut(null);
        broadcast();
      },
      async saveProfile(update) {
        const current = stateRef.current;
        if (current.status !== "signed-in" || !current.owner) throw new CloudAuthError("session-missing");
        const view = await updateProfile(await getLocalDb(), current.owner.profileId, update);
        commit({ ...stateRef.current, view });
        notifyDataChanged();
        // Best effort: the cloud copy of the editable personal fields (needs SQL 09; never blocks).
        const synced = await actions
          .cloudUpdateProfile({ fullName: update.fullName, phone: update.phone, country: update.country, region: update.region })
          .then((r) => r.ok)
          .catch(() => false);
        setCloudProfileSynced(synced);
        return view;
      },
      async changePassword(input) {
        unwrap(await actions.cloudChangePassword({ currentPassword: input.current, newPassword: input.next, confirmation: input.confirmation }));
        broadcast();
      },
      cloud,
    }),
    [state, localAccountHint, cloudProfileSynced, cloud, signedOut, broadcast, commit],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
