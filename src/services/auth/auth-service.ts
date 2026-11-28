import type { CurrencyCode } from "@/domain/currency";
import { defaultExchangeSettings } from "@/domain/fx";
import {
  DEFAULT_PROFILE_PREFERENCES,
  normalizeUsername,
  userProfileSchema,
  usernameSchema,
  type ProfileEdit,
  type UserProfile,
} from "@/domain/profile";
import { financialSettingsSchema, type FinancialSettings } from "@/domain/schemas";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { AppError } from "@/lib/errors/app-error";
import { toIsoWithOffset } from "@/lib/formatting/date";
import { uuidv7 } from "@/domain/ids";
import { ENTITY_STORES, type CredentialRecord, type LocalDb, type SessionRecord } from "@/services/storage/local-store";
import { checkPassword, createPasswordVerifier, DUMMY_VERIFIER, randomToken, verifyPassword, type PasswordProblem } from "./password";

/**
 * Local account service (D-AUTH-01…08). Everything happens in this browser's IndexedDB:
 * there is no server, no identity provider and no synchronisation between devices. A login
 * here proves that the person at this browser knows the password set on this device — it
 * does not encrypt the financial data (OD-3, not implemented).
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const SESSION_POLICY = {
  /** "Recordar sesión": 30 days, then the password is asked again. */
  rememberTtlMs: 30 * DAY,
  /** Otherwise: ends with the browser tab session, after 30 minutes idle or after 12 hours. */
  tabTtlMs: 12 * 60 * MINUTE,
  tabIdleMs: 30 * MINUTE,
} as const;

export const LOGIN_BACKOFF = {
  /** Failed attempts allowed before waiting. */
  freeAttempts: 5,
  baseMs: 30_000,
  maxMs: 15 * MINUTE,
} as const;

export interface ProfileView {
  profile: UserProfile;
  /** From FinancialSettings — the single source of these values (D-AUTH-03). */
  preferredCurrency: CurrencyCode;
  timezone: string;
  numberFormat: string;
}

export interface AuthState {
  view: ProfileView;
  session: SessionRecord;
}

type Now = () => Date;
const iso = (d: Date) => toIsoWithOffset(d);

function passwordError(problem: PasswordProblem): AppError {
  return new AppError("WEAK_PASSWORD", `Password rejected: ${problem}`, { details: [problem] });
}

export async function hasAccount(db: LocalDb): Promise<boolean> {
  return (await db.count("profiles")) > 0;
}

async function readSettings(db: LocalDb): Promise<FinancialSettings> {
  return (await db.get("settings", "financial"))?.settings ?? DEFAULT_FINANCIAL_SETTINGS;
}

export async function loadProfileView(db: LocalDb): Promise<ProfileView | null> {
  const [profile] = await db.getAll("profiles");
  if (!profile) return null;
  const settings = await readSettings(db);
  return { profile, preferredCurrency: settings.baseCurrency, timezone: settings.timezone, numberFormat: settings.numberFormat };
}

function newSession(userId: string, remember: boolean, now: Date): SessionRecord {
  const ttl = remember ? SESSION_POLICY.rememberTtlMs : SESSION_POLICY.tabTtlMs;
  return { id: randomToken(), userId, createdAt: iso(now), lastSeenAt: iso(now), expiresAt: iso(new Date(now.getTime() + ttl)), remember };
}

/** Settings with a new primary currency (and the secondary one enabled), validated. */
function settingsWith(settings: FinancialSettings, changes: { preferredCurrency?: CurrencyCode; secondaryCurrency?: CurrencyCode | null; timezone?: string; numberFormat?: string }): FinancialSettings {
  const next: FinancialSettings = {
    ...settings,
    ...(changes.preferredCurrency ? { baseCurrency: changes.preferredCurrency } : {}),
    ...(changes.timezone ? { timezone: changes.timezone } : {}),
    ...(changes.numberFormat ? { numberFormat: changes.numberFormat } : {}),
  };
  if (changes.secondaryCurrency) {
    const exchange = next.exchange ?? defaultExchangeSettings(next.baseCurrency);
    if (!exchange.enabledCurrencies.includes(changes.secondaryCurrency)) {
      next.exchange = { ...exchange, enabledCurrencies: [...exchange.enabledCurrencies, changes.secondaryCurrency] };
    }
  }
  const parsed = financialSettingsSchema.safeParse(next);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid regional settings", { details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  return parsed.data;
}

export interface RegistrationInput {
  username: string;
  password: string;
  confirmation: string;
  fullName?: string;
  email?: string;
  preferredCurrency?: CurrencyCode;
  remember?: boolean;
}

export interface RegistrationResult extends AuthState {
  /** Financial records already on this device, now owned by the new account (none changed). */
  preservedRecords: number;
}

/**
 * Creates THE local account of this device and signs it in. Refused when an account already
 * exists (USERNAME_TAKEN for the same username, ACCOUNT_EXISTS otherwise). Existing financial
 * records are neither read for change nor rewritten: they simply belong to this account.
 */
export async function register(db: LocalDb, input: RegistrationInput, now: Now = () => new Date()): Promise<RegistrationResult> {
  const username = normalizeUsername(input.username);
  if (!usernameSchema.safeParse(username).success) throw new AppError("VALIDATION_FAILED", "Invalid username", { details: ["username"] });
  const problem = checkPassword(input.password, { username, confirmation: input.confirmation });
  if (problem) throw passwordError(problem);
  const at = now();
  const draft: UserProfile = {
    id: uuidv7(),
    username,
    fullName: (input.fullName ?? "").trim(),
    email: (input.email ?? "").trim(),
    phone: "",
    country: "",
    region: "",
    ...DEFAULT_PROFILE_PREFERENCES,
    createdAt: iso(at),
    updatedAt: iso(at),
  };
  const parsed = userProfileSchema.safeParse(draft);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid profile", { details: parsed.error.issues.map((i) => i.path.join(".")) });
  const profile = parsed.data;

  // Derive BEFORE opening the transaction: IndexedDB commits a transaction left idle on an await.
  const verifier = await createPasswordVerifier(input.password);
  const session = newSession(profile.id, input.remember ?? false, at);

  const tx = db.transaction(["profiles", "credentials", "sessions", "settings", "migration_log", ...ENTITY_STORES], "readwrite");
  const existing = await tx.objectStore("profiles").getAll();
  if (existing.length > 0) {
    tx.abort();
    await tx.done.catch(() => undefined);
    if (existing.some((p) => p.username === username)) throw new AppError("USERNAME_TAKEN", "Username already registered on this device");
    throw new AppError("ACCOUNT_EXISTS", "This device already has a local account");
  }
  let preservedRecords = 0;
  for (const name of ENTITY_STORES) preservedRecords += await tx.objectStore(name).count();
  const currentSettings = (await tx.objectStore("settings").get("financial"))?.settings ?? DEFAULT_FINANCIAL_SETTINGS;
  const settings = input.preferredCurrency ? settingsWith(currentSettings, { preferredCurrency: input.preferredCurrency }) : currentSettings;
  await Promise.all([
    tx.objectStore("profiles").add(profile),
    tx.objectStore("credentials").add({ userId: profile.id, verifier, updatedAt: iso(at), failedAttempts: 0, lockedUntil: null } satisfies CredentialRecord),
    tx.objectStore("sessions").add(session),
    tx.objectStore("settings").put({ key: "financial", settings }),
    tx.objectStore("migration_log").add({ from: 4, to: 4, at: iso(at), moved: { "account-registered": 1, "records-preserved": preservedRecords } }),
  ]);
  await tx.done;
  return { view: { profile, preferredCurrency: settings.baseCurrency, timezone: settings.timezone, numberFormat: settings.numberFormat }, session, preservedRecords };
}

/**
 * Signs in. Unknown user and wrong password fail the same way and take the same time
 * (AUTH_FAILED). After LOGIN_BACKOFF.freeAttempts failures, logins wait with exponential
 * back-off (AUTH_LOCKED, detail = seconds to wait).
 */
async function recordFailedAttempt(db: LocalDb, credential: CredentialRecord, at: Date): Promise<void> {
  const failedAttempts = credential.failedAttempts + 1;
  const over = failedAttempts - LOGIN_BACKOFF.freeAttempts;
  const lockedUntil = over >= 0 ? iso(new Date(at.getTime() + Math.min(LOGIN_BACKOFF.maxMs, LOGIN_BACKOFF.baseMs * 2 ** over))) : null;
  await db.put("credentials", { ...credential, failedAttempts, lockedUntil });
}

/**
 * Step 14 — proof of ownership for the migration to Supabase Auth: checks the local username and
 * password (same back-off as the login) WITHOUT opening a local session. Returns the local
 * profile id. The PBKDF2 verifier is only compared here; it is never sent anywhere or reused.
 */
export async function verifyLocalOwnership(db: LocalDb, input: { username: string; password: string }, now: Now = () => new Date()): Promise<string> {
  const username = normalizeUsername(input.username);
  const profile = await db.getFromIndex("profiles", "username", username);
  const credential = profile ? await db.get("credentials", profile.id) : undefined;
  const at = now();
  if (credential?.lockedUntil && new Date(credential.lockedUntil).getTime() > at.getTime()) {
    const seconds = Math.ceil((new Date(credential.lockedUntil).getTime() - at.getTime()) / 1000);
    throw new AppError("AUTH_LOCKED", "Too many failed attempts", { details: [String(seconds)] });
  }
  const valid = await verifyPassword(input.password, credential?.verifier ?? DUMMY_VERIFIER);
  if (!profile || !credential) throw new AppError("AUTH_FAILED", "Invalid credentials");
  if (!valid) {
    await recordFailedAttempt(db, credential, at);
    throw new AppError("AUTH_FAILED", "Invalid credentials");
  }
  if (credential.disabledAt) throw new AppError("ACCOUNT_MIGRATED", "This local account was migrated");
  await db.put("credentials", { ...credential, failedAttempts: 0, lockedUntil: null });
  return profile.id;
}

export async function login(db: LocalDb, input: { username: string; password: string; remember?: boolean }, now: Now = () => new Date()): Promise<AuthState> {
  const username = normalizeUsername(input.username);
  const profile = await db.getFromIndex("profiles", "username", username);
  const credential = profile ? await db.get("credentials", profile.id) : undefined;
  const at = now();
  if (credential?.lockedUntil && new Date(credential.lockedUntil).getTime() > at.getTime()) {
    const seconds = Math.ceil((new Date(credential.lockedUntil).getTime() - at.getTime()) / 1000);
    throw new AppError("AUTH_LOCKED", "Too many failed attempts", { details: [String(seconds)] });
  }
  const valid = await verifyPassword(input.password, credential?.verifier ?? DUMMY_VERIFIER);
  if (!profile || !credential) throw new AppError("AUTH_FAILED", "Invalid credentials");
  if (!valid) {
    await recordFailedAttempt(db, credential, at);
    throw new AppError("AUTH_FAILED", "Invalid credentials");
  }
  // Step 14: an account migrated to Supabase Auth no longer opens local sessions (D-SB-05).
  if (credential.disabledAt) throw new AppError("ACCOUNT_MIGRATED", "This local account was migrated");
  const session = newSession(profile.id, input.remember ?? false, at);
  const tx = db.transaction(["credentials", "sessions"], "readwrite");
  await Promise.all([tx.objectStore("credentials").put({ ...credential, failedAttempts: 0, lockedUntil: null }), tx.objectStore("sessions").add(session)]);
  await tx.done;
  const view = await loadProfileView(db);
  return { view: view!, session };
}

function isExpired(session: SessionRecord, at: Date): boolean {
  const t = at.getTime();
  if (new Date(session.expiresAt).getTime() <= t) return true;
  return !session.remember && t - new Date(session.lastSeenAt).getTime() > SESSION_POLICY.tabIdleMs;
}

/**
 * The signed-in state of this browser, or null. A session that does not remember ("Recordar
 * sesión" off) is only valid in the browser tab session that created it (`tabSessionId`, kept
 * in sessionStorage — an opaque id, never a credential). Expired sessions are deleted.
 */
export async function resolveSession(db: LocalDb, options: { tabSessionId: string | null; preferredId?: string | null }, now: Now = () => new Date()): Promise<AuthState | null> {
  const at = now();
  const sessions = await db.getAll("sessions");
  const expired = sessions.filter((s) => isExpired(s, at));
  if (expired.length > 0) {
    const tx = db.transaction("sessions", "readwrite");
    await Promise.all(expired.map((s) => tx.store.delete(s.id)));
    await tx.done;
  }
  const usable = sessions
    .filter((s) => !isExpired(s, at))
    .filter((s) => s.remember || s.id === options.tabSessionId)
    .sort((a, b) => (a.id === options.preferredId ? -1 : b.id === options.preferredId ? 1 : b.lastSeenAt.localeCompare(a.lastSeenAt)));
  const session = usable[0];
  if (!session) return null;
  if ((await db.get("credentials", session.userId))?.disabledAt) return null; // migrated (Step 14)
  const view = await loadProfileView(db);
  if (!view || view.profile.id !== session.userId) return null;
  return { view, session };
}

/** Records activity (keeps a tab session from idling out). */
export async function touchSession(db: LocalDb, sessionId: string, now: Now = () => new Date()): Promise<void> {
  const session = await db.get("sessions", sessionId);
  if (!session || isExpired(session, now())) return;
  await db.put("sessions", { ...session, lastSeenAt: iso(now()) });
}

/** Ends the session on this device (its record is deleted, not just flagged). */
export async function logout(db: LocalDb, sessionId: string): Promise<void> {
  await db.delete("sessions", sessionId);
}

/**
 * Changes the password: the current one is required, a new salt is drawn, and every other
 * session of the account is ended (the one in use stays).
 */
export async function changePassword(
  db: LocalDb,
  input: { userId: string; currentSessionId: string; current: string; next: string; confirmation: string },
  now: Now = () => new Date(),
): Promise<void> {
  const profile = await db.get("profiles", input.userId);
  const credential = await db.get("credentials", input.userId);
  if (!profile || !credential) throw new AppError("UNAUTHENTICATED", "No account");
  if (!(await verifyPassword(input.current, credential.verifier))) throw new AppError("AUTH_FAILED", "Current password is wrong");
  const problem = checkPassword(input.next, { username: profile.username, confirmation: input.confirmation });
  if (problem) throw passwordError(problem);
  if (input.next === input.current) throw passwordError("same-as-current");
  const verifier = await createPasswordVerifier(input.next);
  const tx = db.transaction(["credentials", "sessions"], "readwrite");
  await tx.objectStore("credentials").put({ ...credential, verifier, updatedAt: iso(now()), failedAttempts: 0, lockedUntil: null });
  const sessions = await tx.objectStore("sessions").index("userId").getAll(input.userId);
  await Promise.all(sessions.filter((s) => s.id !== input.currentSessionId).map((s) => tx.objectStore("sessions").delete(s.id)));
  await tx.done;
}

export interface ProfileUpdate extends ProfileEdit {
  preferredCurrency: CurrencyCode;
  timezone: string;
  numberFormat: string;
}

/**
 * Saves the global profile. Personal fields go to the profile record; currency, time zone and
 * number format go to FinancialSettings — in ONE transaction, so both change or neither does.
 * Financial records are not touched (stored conversions keep their own currency and rate).
 */
export async function updateProfile(db: LocalDb, userId: string, update: ProfileUpdate, now: Now = () => new Date()): Promise<ProfileView> {
  const current = await db.get("profiles", userId);
  if (!current) throw new AppError("UNAUTHENTICATED", "No account");
  const parsed = userProfileSchema.safeParse({
    ...current,
    fullName: update.fullName,
    email: update.email.trim(),
    phone: update.phone.trim(),
    country: update.country,
    region: update.region,
    secondaryCurrency: update.secondaryCurrency,
    language: update.language,
    dateFormat: update.dateFormat,
    updatedAt: iso(now()),
  });
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid profile", { details: parsed.error.issues.map((i) => i.path.join(".")) });
  const settings = settingsWith(await readSettings(db), {
    preferredCurrency: update.preferredCurrency,
    secondaryCurrency: update.secondaryCurrency,
    timezone: update.timezone,
    numberFormat: update.numberFormat,
  });
  const tx = db.transaction(["profiles", "settings"], "readwrite");
  await Promise.all([tx.objectStore("profiles").put(parsed.data), tx.objectStore("settings").put({ key: "financial", settings })]);
  await tx.done;
  return { profile: parsed.data, preferredCurrency: settings.baseCurrency, timezone: settings.timezone, numberFormat: settings.numberFormat };
}
