"use client";

import { createContext, useContext } from "react";
import type { AuthErrorCode } from "@/lib/supabase/auth-service";
import type { AuthState, ProfileUpdate, ProfileView, RegistrationInput, RegistrationResult } from "@/services/auth/auth-service";
import type { LinkSummary } from "@/services/auth/identity-binding";

/**
 * The application's single view of "who is signed in" (D-AUTH-04, Step 14 D-SB-01).
 *
 * Two modes, chosen at build time by the public Supabase configuration:
 * - "local": Supabase not configured → the Step 10 local account, unchanged.
 * - "cloud": Supabase configured → Supabase Auth through Server Actions (HttpOnly cookies);
 *   the local login only survives inside the migration, as proof of ownership.
 *
 * Components read this context through `useAuth()` / `useProfile()` and never call Supabase.
 */
export type AuthMode = "local" | "cloud";

export type AuthStatus =
  | "loading"
  | "signed-out"
  | "signed-in"
  /** cloud: signed in, but this browser's existing data is not linked to the identity yet. */
  | "needs-link"
  /** cloud: signed in with an email that is not verified yet. */
  | "needs-verification";

export interface CloudIdentityView {
  userId: string;
  email: string;
  emailConfirmed: boolean;
}

/** A Supabase Auth failure, with a safe code (no provider message). */
export class CloudAuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = "CloudAuthError";
  }
}

export interface CloudActions {
  signIn(input: { email: string; password: string }): Promise<void>;
  signUp(input: { email: string; password: string; confirmation: string; fullName: string; preferredCurrency: string }): Promise<{ needsVerification: boolean }>;
  requestReset(email: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
  /** After a recovery link: sets the new password (the recovery session is the proof). */
  completeReset(input: { newPassword: string; confirmation: string }): Promise<void>;
  /** Ends the session on every device ("global" sign-out). */
  signOutEverywhere(): Promise<void>;
  /** Migration of the local account: its local password proves ownership of the data. */
  migrateLocalAccount(input: { username: string; password: string }): Promise<void>;
  /** Data without a local account: linked after explicit confirmation. */
  linkUnclaimedData(): Promise<void>;
  /** Start with an empty database for this identity; the existing data stays untouched. */
  startSeparate(): Promise<void>;
}

export interface AuthContextValue {
  mode: AuthMode;
  status: AuthStatus;
  /** local: an account exists on this device. cloud: a migratable local account exists. */
  hasAccount: boolean;
  /** Profile and display preferences of the signed-in user (both modes). */
  view: ProfileView | null;
  /** local only: the local session record. */
  state: AuthState | null;
  /** cloud only. */
  identity: CloudIdentityView | null;
  /** cloud: the Auth server could not be reached; a recent verified snapshot is in use. */
  offline: boolean;
  /** cloud, status "needs-link": what can be linked. */
  linkSummary: LinkSummary | null;
  /** cloud: username of an unmigrated local account on this browser (shown on login/register). */
  localAccountHint: string | null;
  /** cloud: the last profile save also reached public.profiles (false when SQL 09 is missing or offline). */
  cloudProfileSynced: boolean | null;
  /** Set when a session ended on its own (expiry, logout elsewhere): shown on the login page. */
  endedReason: "expired" | null;
  signIn: (input: { username: string; password: string; remember: boolean }) => Promise<void>;
  signUp: (input: RegistrationInput) => Promise<RegistrationResult>;
  signOut: () => Promise<void>;
  saveProfile: (update: ProfileUpdate) => Promise<ProfileView>;
  changePassword: (input: { current: string; next: string; confirmation: string }) => Promise<void>;
  /** cloud only (null in local mode). */
  cloud: CloudActions | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth needs <AuthProvider>");
  return ctx;
}

/** The signed-in user's global profile (inside protected routes it is always present). */
export function useProfile(): ProfileView | null {
  return useContext(AuthContext)?.view ?? null;
}
