import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { isCurrencyCode, type CurrencyCode } from "@/domain/currency";
import { PROFILE_COUNTRIES } from "@/domain/profile";
import { checkPassword, CLOUD_PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/services/auth/password";
import type { Database } from "./types";

/**
 * Supabase Auth operations (Step 14, D-SB-02). Framework-agnostic: every function receives a
 * Supabase client created on the SERVER with HttpOnly cookies (src/lib/supabase/server.ts), so
 * tokens never reach browser code. Server Actions and route handlers are thin wrappers.
 *
 * Results carry SAFE codes only: no token, no raw provider message. Sign-up and password
 * recovery never reveal whether an email is registered (no account enumeration).
 */
type Client = SupabaseClient<Database>;

export type AuthErrorCode =
  | "invalid-input"
  | "invalid-credentials"
  | "email-not-confirmed"
  | "weak-password"
  | "same-password"
  | "rate-limited"
  | "link-invalid"
  | "session-missing"
  | "network"
  | "profile-unavailable"
  | "unknown";

export type AuthResult<T = object> = ({ ok: true } & T) | { ok: false; code: AuthErrorCode };

export interface AuthUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
  /** Display name saved at sign-up (user metadata); the profile table is the editable copy. */
  fullName: string;
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Maps a Supabase auth error to a safe code (never forwards the provider's message). */
export function authErrorCode(error: unknown): AuthErrorCode {
  const e = error as { code?: string; status?: number; name?: string; message?: string } | null;
  if (!e) return "unknown";
  if (e.name === "AuthRetryableFetchError" || e.status === 0) return "network";
  switch (e.code) {
    case "invalid_credentials":
    case "invalid_grant":
      return "invalid-credentials";
    case "email_not_confirmed":
      return "email-not-confirmed";
    case "weak_password":
      return "weak-password";
    case "same_password":
      return "same-password";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rate-limited";
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return "link-invalid";
    case "session_not_found":
    case "reauthentication_needed":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return "session-missing";
  }
  if (e.name === "AuthSessionMissingError") return "session-missing";
  if (e.status === 429) return "rate-limited";
  if (e.status === 400 && /invalid login credentials/i.test(e.message ?? "")) return "invalid-credentials";
  return "unknown";
}

function toAuthUser(user: User): AuthUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? "",
    emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    fullName: typeof meta.full_name === "string" ? meta.full_name.slice(0, 80) : "",
  };
}

function passwordProblem(password: string, confirmation?: string): AuthErrorCode | null {
  const problem = checkPassword(password, { confirmation, minLength: CLOUD_PASSWORD_MIN_LENGTH });
  if (!problem) return null;
  return problem === "mismatch" ? "invalid-input" : "weak-password";
}

/** Registers with email + password. Email verification is required (Supabase "Confirm email"). */
export async function signUpWithEmail(
  client: Client,
  input: { email: string; password: string; confirmation: string; fullName?: string; preferredCurrency?: string; redirectTo: string },
): Promise<AuthResult<{ needsVerification: boolean }>> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return { ok: false, code: "invalid-input" };
  const problem = passwordProblem(input.password, input.confirmation);
  if (problem) return { ok: false, code: problem };
  const fullName = (input.fullName ?? "").trim().slice(0, 80);
  const currency: CurrencyCode = isCurrencyCode(input.preferredCurrency) ? input.preferredCurrency : "ARS";
  const { data, error } = await client.auth.signUp({
    email: email.data,
    password: input.password,
    // Read by public.initialize_user() (database/sql/06) to create the profile and preferences.
    options: { emailRedirectTo: input.redirectTo, data: { full_name: fullName, preferred_currency: currency } },
  });
  if (error) {
    const code = authErrorCode(error);
    // An existing email is answered like a new one: "check your inbox" (no enumeration).
    if (error.code === "user_already_exists" || error.code === "email_exists") return { ok: true, needsVerification: true };
    return { ok: false, code };
  }
  return { ok: true, needsVerification: !data.session };
}

export async function signInWithEmail(client: Client, input: { email: string; password: string }): Promise<AuthResult<{ user: AuthUser }>> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success || input.password.length === 0 || input.password.length > PASSWORD_MAX_LENGTH * 4) return { ok: false, code: "invalid-credentials" };
  const { data, error } = await client.auth.signInWithPassword({ email: email.data, password: input.password });
  if (error || !data.user) return { ok: false, code: authErrorCode(error) };
  return { ok: true, user: toAuthUser(data.user) };
}

/** Ends the session. scope "local": this browser; "global": every device of the user. */
export async function signOutSession(client: Client, scope: "local" | "global" = "local"): Promise<AuthResult> {
  const { error } = await client.auth.signOut({ scope });
  // Even if the server could not be reached, the cookies are cleared by the client library.
  if (error && authErrorCode(error) !== "session-missing" && authErrorCode(error) !== "network") return { ok: false, code: authErrorCode(error) };
  return { ok: true };
}

/** Sends the recovery email. Always answers ok for a well-formed email (no enumeration). */
export async function requestPasswordReset(client: Client, input: { email: string; redirectTo: string }): Promise<AuthResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return { ok: false, code: "invalid-input" };
  const { error } = await client.auth.resetPasswordForEmail(email.data, { redirectTo: input.redirectTo });
  if (error) {
    const code = authErrorCode(error);
    if (code === "rate-limited" || code === "network") return { ok: false, code };
  }
  return { ok: true };
}

export async function resendVerification(client: Client, input: { email: string; redirectTo: string }): Promise<AuthResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return { ok: false, code: "invalid-input" };
  const { error } = await client.auth.resend({ type: "signup", email: email.data, options: { emailRedirectTo: input.redirectTo } });
  if (error) {
    const code = authErrorCode(error);
    if (code === "rate-limited" || code === "network") return { ok: false, code };
  }
  return { ok: true };
}

export const EMAIL_LINK_TYPES = ["signup", "email", "recovery", "invite", "email_change", "magiclink"] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

/** Completes an email link (verification or recovery) and opens the session (cookies). */
export async function completeEmailLink(
  client: Client,
  input: { tokenHash?: string | null; type?: string | null; code?: string | null },
): Promise<AuthResult<{ type: EmailLinkType | "pkce" }>> {
  if (input.code) {
    const { error } = await client.auth.exchangeCodeForSession(input.code);
    return error ? { ok: false, code: authErrorCode(error) === "unknown" ? "link-invalid" : authErrorCode(error) } : { ok: true, type: "pkce" };
  }
  const type = EMAIL_LINK_TYPES.find((t) => t === input.type);
  if (!input.tokenHash || !type || !/^[A-Za-z0-9_-]{8,256}$/.test(input.tokenHash)) return { ok: false, code: "link-invalid" };
  const { error } = await client.auth.verifyOtp({ token_hash: input.tokenHash, type });
  if (error) {
    const code = authErrorCode(error);
    return { ok: false, code: code === "unknown" || code === "invalid-credentials" ? "link-invalid" : code };
  }
  return { ok: true, type };
}

export type SessionCheck = { state: "authenticated"; user: AuthUser } | { state: "anonymous" } | { state: "unavailable" };

function unreachable(error: unknown): boolean {
  const e = error as { name?: string; status?: number } | null;
  return Boolean(e) && (e!.name === "AuthRetryableFetchError" || e!.status === 0 || (typeof e!.status === "number" && e!.status >= 500));
}

/**
 * The session as the Auth server sees it (`getUser()` asks the server: a revoked or deleted
 * account is noticed at once — never trusted from the cookie alone). "unavailable" when the
 * server cannot be reached, so offline is not mistaken for "signed out".
 */
export async function checkSession(client: Client): Promise<SessionCheck> {
  try {
    const { data, error } = await client.auth.getUser();
    if (data?.user && !error) return { state: "authenticated", user: toAuthUser(data.user) };
    return unreachable(error) ? { state: "unavailable" } : { state: "anonymous" };
  } catch (error) {
    return unreachable(error) ? { state: "unavailable" } : { state: "anonymous" };
  }
}

/** The signed-in user, verified by the Auth server; null when there is no valid session. */
export async function getAuthenticatedUser(client: Client): Promise<AuthUser | null> {
  const check = await checkSession(client);
  return check.state === "authenticated" ? check.user : null;
}

/** How long after opening a recovery link the password may be set without the current one. */
export const RECOVERY_WINDOW_SECONDS = 15 * 60;

/**
 * True when the current session was opened by a password-recovery link in the last 15 minutes
 * (JWT `amr` method "recovery", verified by getClaims()). Only then may a password be set
 * without re-entering the current one — a stolen ordinary session cannot change it.
 */
export async function isRecentRecoverySession(client: Client, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  try {
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims) return false;
    const amr = (data.claims as { amr?: unknown }).amr;
    if (!Array.isArray(amr)) return false;
    return amr.some((entry: unknown) => {
      const e = entry as { method?: unknown; timestamp?: unknown };
      return e.method === "recovery" && typeof e.timestamp === "number" && nowSeconds - e.timestamp <= RECOVERY_WINDOW_SECONDS;
    });
  } catch {
    return false;
  }
}

/**
 * Changes the password of the signed-in user. With `currentPassword` (a normal change) the
 * current password is re-verified first; without it, only a recent recovery session (amr
 * "recovery", ≤ 15 min) is accepted as proof. Other sessions are ended afterwards.
 */
export async function changePassword(
  client: Client,
  input: { currentPassword?: string; newPassword: string; confirmation: string },
): Promise<AuthResult> {
  const user = await getAuthenticatedUser(client);
  if (!user) return { ok: false, code: "session-missing" };
  const problem = passwordProblem(input.newPassword, input.confirmation);
  if (problem) return { ok: false, code: problem };
  if (input.currentPassword === undefined) {
    if (!(await isRecentRecoverySession(client))) return { ok: false, code: "session-missing" };
  } else {
    if (input.currentPassword === input.newPassword) return { ok: false, code: "same-password" };
    const { error } = await client.auth.signInWithPassword({ email: user.email, password: input.currentPassword });
    if (error) return { ok: false, code: authErrorCode(error) === "invalid-credentials" ? "invalid-credentials" : authErrorCode(error) };
  }
  const { error } = await client.auth.updateUser({ password: input.newPassword });
  if (error) return { ok: false, code: authErrorCode(error) };
  await client.auth.signOut({ scope: "others" }).catch(() => undefined);
  return { ok: true };
}

/* ------------------------------------------------------------------------------------------ */
/* Cloud profile (public.profiles). Needs database/sql/09_profile_access.sql (own-row policies). */
/* ------------------------------------------------------------------------------------------ */

export interface CloudProfile {
  fullName: string;
  phone: string;
  country: string;
  region: string;
  updatedAt: string;
}

/**
 * Editable cloud profile fields. The account email is NOT here: it belongs to Supabase Auth
 * (auth.users.email) and is never copied (D-SB-06). No password, hash or token either.
 */
export const cloudProfileEditSchema = z.strictObject({
  fullName: z.string().trim().max(80),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ()-]{6,24}$/)]),
  country: z.union([z.literal(""), z.enum(PROFILE_COUNTRIES)]),
  region: z.string().trim().max(60),
});
export type CloudProfileEdit = z.infer<typeof cloudProfileEditSchema>;

const PROFILE_COLUMNS = "full_name, phone, country, region, updated_at";

function rowToProfile(row: { full_name: string; phone: string; country: string; region: string; updated_at: string }): CloudProfile {
  return { fullName: row.full_name, phone: row.phone, country: row.country, region: row.region, updatedAt: row.updated_at };
}

export async function getCloudProfile(client: Client, userId: string): Promise<AuthResult<{ profile: CloudProfile }>> {
  const { data, error } = await client.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error || !data) return { ok: false, code: "profile-unavailable" };
  return { ok: true, profile: rowToProfile(data as never) };
}

export async function updateCloudProfile(client: Client, userId: string, edit: unknown): Promise<AuthResult<{ profile: CloudProfile }>> {
  const parsed = cloudProfileEditSchema.safeParse(edit);
  if (!parsed.success) return { ok: false, code: "invalid-input" };
  const p = parsed.data;
  const { data, error } = await client
    .from("profiles")
    .update({ full_name: p.fullName, phone: p.phone, country: p.country, region: p.region } as never)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (error || !data) return { ok: false, code: "profile-unavailable" };
  return { ok: true, profile: rowToProfile(data as never) };
}
