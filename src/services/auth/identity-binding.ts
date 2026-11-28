import { DEFAULT_PROFILE_PREFERENCES, USERNAME_PATTERN, userProfileSchema, type UserProfile } from "@/domain/profile";
import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { AppError } from "@/lib/errors/app-error";
import { toIsoWithOffset } from "@/lib/formatting/date";
import {
  ENTITY_STORES,
  LOCAL_DB_NAME,
  localDbNameFor,
  type CloudMigrationRecord,
  type LocalDb,
  type OwnerRecord,
} from "@/services/storage/local-store";
import { verifyLocalOwnership, type ProfileView } from "./auth-service";

/**
 * Step 14 — which local database belongs to which Supabase identity (D-SB-04).
 *
 * Rules (docs/architecture/supabase-auth.md §Separación):
 * 1. `pfm-local` owned by the identity → that database.
 * 2. `pfm-local` owned by ANOTHER identity → `pfm-local~<userId>` (created empty if needed).
 * 3. `pfm-local` without owner and empty → linked directly to the identity.
 * 4. `pfm-local` without owner but with data or a local account → nothing is linked until the
 *    user decides: migrate (prove ownership with the local password, or confirm data that has
 *    no account) or start apart in `pfm-local~<userId>`. A previous "start apart" decision is
 *    remembered by the owner record of `pfm-local~<userId>`.
 *
 * The link is ONE IndexedDB transaction: owner record + migrated credential disabled + its local
 * sessions ended. Nothing financial is read, moved, rewritten or deleted; the PBKDF2 verifier
 * stays in place (unused) — it is never sent or reused as a password.
 */

export type OpenDb = (name: string) => Promise<LocalDb>;

export interface CloudIdentity {
  userId: string;
  email: string;
  fullName: string;
}

export interface LinkSummary {
  /** Username of the local account that can be migrated; null when the data has no account. */
  localUsername: string | null;
  /** Working records, pending changes and kept legacy records in the unlinked database. */
  recordCount: number;
  /** A migration was started (ownership verified) and not committed — shown as "interrupted". */
  interrupted: boolean;
}

export type Resolution = { kind: "bound"; dbName: string; owner: OwnerRecord } | { kind: "needs-link"; summary: LinkSummary };

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkIdentity(identity: CloudIdentity): void {
  if (!USER_ID.test(identity.userId)) throw new AppError("VALIDATION_FAILED", "Invalid user id");
}

export async function readOwner(db: LocalDb): Promise<OwnerRecord | null> {
  const record = await db.get("device", "owner");
  return record && record.key === "owner" ? record : null;
}

async function readPendingMigration(db: LocalDb): Promise<CloudMigrationRecord | null> {
  const record = await db.get("device", "cloud-migration");
  return record && record.key === "cloud-migration" ? record : null;
}

/** Records that would be linked: working stores, pending changes, publications and kept v1 records. */
export async function countLocalRecords(db: LocalDb): Promise<number> {
  const counts = await Promise.all([...ENTITY_STORES.map((s) => db.count(s)), db.count("outbox"), db.count("publications"), db.count("legacy_v1")]);
  return counts.reduce((a, b) => a + b, 0);
}

/** The local account that can still be migrated (not already migrated). */
async function migratableAccount(db: LocalDb): Promise<UserProfile | null> {
  for (const profile of await db.getAll("profiles")) {
    const credential = await db.get("credentials", profile.id);
    if (credential && !credential.disabledAt) return profile;
  }
  return null;
}

async function withDb<T>(open: OpenDb, name: string, fn: (db: LocalDb) => Promise<T>): Promise<T> {
  const db = await open(name);
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export async function resolveIdentity(identity: CloudIdentity, open: OpenDb): Promise<Resolution> {
  checkIdentity(identity);
  const main = await withDb(open, LOCAL_DB_NAME, async (db) => ({
    owner: await readOwner(db),
    account: await migratableAccount(db),
    records: await countLocalRecords(db),
    pending: await readPendingMigration(db),
    profiles: await db.count("profiles"),
  }));
  if (main.owner?.userId === identity.userId) return { kind: "bound", dbName: LOCAL_DB_NAME, owner: main.owner };

  const ownName = localDbNameFor(identity.userId);
  if (main.owner) {
    // Rule 2: someone else owns pfm-local. This identity has its own database.
    const owner = await withDb(open, ownName, (db) => ensureOwnedEmpty(db, identity));
    return { kind: "bound", dbName: ownName, owner };
  }
  if (main.records === 0 && main.profiles === 0) {
    // Rule 3: nothing to protect — link pfm-local directly.
    const owner = await withDb(open, LOCAL_DB_NAME, (db) => bindEmpty(db, identity));
    return { kind: "bound", dbName: LOCAL_DB_NAME, owner };
  }
  // Rule 4: data without owner. Did this identity already choose to start apart?
  const separate = await withDb(open, ownName, readOwner);
  if (separate?.userId === identity.userId) return { kind: "bound", dbName: ownName, owner: separate };
  return {
    kind: "needs-link",
    summary: { localUsername: main.account?.username ?? null, recordCount: main.records, interrupted: main.pending?.userId === identity.userId },
  };
}

function deriveUsername(email: string): string {
  const base = email
    .split("@")[0]!
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 32)
    .replace(/[._-]+$/g, "");
  return USERNAME_PATTERN.test(base) ? base : "usuario";
}

function newProfile(identity: CloudIdentity, at: string): UserProfile {
  return userProfileSchema.parse({
    id: identity.userId,
    username: deriveUsername(identity.email),
    fullName: identity.fullName.trim().slice(0, 80),
    // The account email lives in Supabase Auth (D-SB-06): not duplicated in the device profile.
    email: "",
    phone: "",
    country: "",
    region: "",
    ...DEFAULT_PROFILE_PREFERENCES,
    createdAt: at,
    updatedAt: at,
  });
}

/**
 * Writes the owner record (and the migrated credential / profile changes) in one transaction.
 * Refuses if another identity got there first (two tabs, two people).
 */
async function commitLink(db: LocalDb, identity: CloudIdentity, via: OwnerRecord["via"], localProfileId: string | null, now: Date): Promise<OwnerRecord> {
  const at = toIsoWithOffset(now);
  const tx = db.transaction(["device", "credentials", "sessions", "profiles"], "readwrite");
  const device = tx.objectStore("device");
  const existing = await device.get("owner");
  if (existing && existing.key === "owner") {
    await tx.done;
    if (existing.userId !== identity.userId) throw new AppError("IDENTITY_MISMATCH", "This database belongs to another identity");
    return existing;
  }
  let profileId = localProfileId;
  if (localProfileId) {
    const credentials = tx.objectStore("credentials");
    const credential = await credentials.get(localProfileId);
    if (!credential || credential.disabledAt) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new AppError("ACCOUNT_MIGRATED", "The local account is no longer migratable");
    }
    // Disabled, not deleted: the verifier stays (unused) so nothing is lost if anything goes wrong.
    await credentials.put({ ...credential, migratedTo: identity.userId, disabledAt: at, failedAttempts: 0, lockedUntil: null });
    const sessions = tx.objectStore("sessions");
    for (const key of await sessions.index("userId").getAllKeys(localProfileId)) await sessions.delete(key);
  } else {
    profileId = identity.userId;
    if (!(await tx.objectStore("profiles").get(identity.userId))) await tx.objectStore("profiles").add(newProfile(identity, at));
  }
  const owner: OwnerRecord = { key: "owner", userId: identity.userId, profileId: profileId!, linkedAt: at, via };
  await device.put(owner);
  await device.delete("cloud-migration");
  await tx.done;
  return owner;
}

async function ensureOwnedEmpty(db: LocalDb, identity: CloudIdentity, now = new Date()): Promise<OwnerRecord> {
  const owner = await readOwner(db);
  if (owner) {
    if (owner.userId !== identity.userId) throw new AppError("IDENTITY_MISMATCH", "This database belongs to another identity");
    return owner;
  }
  return commitLink(db, identity, "empty", null, now);
}

export async function bindEmpty(db: LocalDb, identity: CloudIdentity, now = new Date()): Promise<OwnerRecord> {
  checkIdentity(identity);
  if ((await countLocalRecords(db)) > 0 || (await db.count("profiles")) > 0) throw new AppError("PROTECTED_OPERATION", "The database is not empty");
  return commitLink(db, identity, "empty", null, now);
}

/**
 * Migration of a local account: (1) the local password proves ownership — no session is opened;
 * (2) a "cloud-migration" record marks the verified start (an interruption leaves it, and nothing
 * else changed); (3) the link is committed in one transaction. Data and verifier stay in place.
 */
export async function linkByMigration(
  db: LocalDb,
  identity: CloudIdentity,
  input: { username: string; password: string },
  hooks: { afterVerified?: () => Promise<void> } = {},
  now: () => Date = () => new Date(),
): Promise<OwnerRecord> {
  checkIdentity(identity);
  const owner = await readOwner(db);
  if (owner && owner.userId !== identity.userId) throw new AppError("IDENTITY_MISMATCH", "This database belongs to another identity");
  if (owner) return owner;
  const localProfileId = await verifyLocalOwnership(db, input, now);
  await db.put("device", { key: "cloud-migration", userId: identity.userId, localProfileId, startedAt: toIsoWithOffset(now()) });
  await hooks.afterVerified?.(); // tests: simulate an interruption here
  return commitLink(db, identity, "migration", localProfileId, now());
}

/** Data with no local account (e.g. imported): linked after the user's explicit confirmation. */
export async function linkConfirmed(db: LocalDb, identity: CloudIdentity, now = new Date()): Promise<OwnerRecord> {
  checkIdentity(identity);
  if (await migratableAccount(db)) throw new AppError("PROTECTED_OPERATION", "A local account exists: its password is required");
  return commitLink(db, identity, "confirmed", null, now);
}

/** "Empezar sin estos datos": the identity gets its own empty database; pfm-local stays untouched. */
export async function chooseSeparate(identity: CloudIdentity, open: OpenDb, now = new Date()): Promise<string> {
  checkIdentity(identity);
  const name = localDbNameFor(identity.userId);
  await withDb(open, name, (db) => ensureOwnedEmpty(db, identity, now));
  return name;
}

/** The profile view of the identity in its bound database (preferences from FinancialSettings). */
export async function loadIdentityView(db: LocalDb, owner: OwnerRecord): Promise<ProfileView> {
  const profile = await db.get("profiles", owner.profileId);
  if (!profile) throw new AppError("NOT_FOUND", "Profile of the bound identity not found");
  const settings = (await db.get("settings", "financial"))?.settings ?? DEFAULT_FINANCIAL_SETTINGS;
  return { profile, preferredCurrency: settings.baseCurrency, timezone: settings.timezone, numberFormat: settings.numberFormat };
}
