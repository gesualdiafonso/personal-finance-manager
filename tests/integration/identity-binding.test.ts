import { describe, expect, it } from "vitest";
import { getActiveLocalDbName, getLocalDb, mutate, setActiveLocalDb } from "@/hooks/use-local-data";
import { login, logout, register, resolveSession, updateProfile } from "@/services/auth/auth-service";
import {
  chooseSeparate,
  linkByMigration,
  linkConfirmed,
  loadIdentityView,
  readOwner,
  resolveIdentity,
  type CloudIdentity,
} from "@/services/auth/identity-binding";
import { exportData } from "@/services/exchange/exchange";
import { LOCAL_DB_NAME, localDbNameFor, openLocalStore } from "@/services/storage/local-store";

/**
 * Step 14 — binding local data to Supabase identities (D-SB-04/05). FICTITIOUS users and data
 * (EJEMPLO-FICTICIO). Covers: users with existing local data, migration of the local account,
 * interrupted migration, data without an account, separation between two identities, logout
 * keeping data, and the migrated local credential.
 */
const LOCAL_PASSWORD = "EJEMPLO-ficticio-local-2026";
const ANA: CloudIdentity = { userId: "0193b000-0000-4000-8000-00000000000a", email: "ana@ejemplo-ficticio.test", fullName: "Ana Ejemplo" };
const BRUNO: CloudIdentity = { userId: "0193b000-0000-4000-8000-00000000000b", email: "bruno.p@ejemplo-ficticio.test", fullName: "" };
const open = (name: string) => openLocalStore(undefined, name);

async function localAccountWithData() {
  const db = await getLocalDb();
  const reg = await register(db, { username: "ana.local", password: LOCAL_PASSWORD, confirmation: LOCAL_PASSWORD, fullName: "Ana Local", email: "", preferredCurrency: "USD", remember: true });
  const account = await mutate((r) =>
    r.accounts.create({ name: "EJEMPLO-FICTICIO Caja", institution: null, accountType: "cash", currency: "USD", initialBalance: 1234_56, openingDate: null, status: "active" }),
  );
  return { reg, account };
}

async function snapshot(name: string) {
  const db = await open(name);
  try {
    return { accounts: await db.getAll("accounts"), outbox: await db.getAll("outbox"), settings: await db.get("settings", "financial"), profiles: await db.getAll("profiles"), credentials: await db.getAll("credentials") };
  } finally {
    db.close();
  }
}

describe("users with existing local data", () => {
  it("nothing is linked automatically: the identity must decide (needs-link with a summary)", async () => {
    await localAccountWithData();
    const resolution = await resolveIdentity(ANA, open);
    expect(resolution).toEqual({ kind: "needs-link", summary: { localUsername: "ana.local", recordCount: expect.any(Number), interrupted: false } });
    expect(resolution.kind === "needs-link" && resolution.summary.recordCount).toBeGreaterThanOrEqual(2); // account + its outbox entry
    const db = await open(LOCAL_DB_NAME);
    expect(await readOwner(db)).toBeNull();
    db.close();
  });

  it("migration: the local password proves ownership; data is untouched; the local credential is disabled, not deleted", async () => {
    const { reg, account } = await localAccountWithData();
    const before = await snapshot(LOCAL_DB_NAME);
    const db = await open(LOCAL_DB_NAME);
    await expect(linkByMigration(db, ANA, { username: "ana.local", password: "incorrecta-ficticia" })).rejects.toMatchObject({ code: "AUTH_FAILED" });
    expect(await readOwner(db)).toBeNull();
    const owner = await linkByMigration(db, ANA, { username: " ANA.local ", password: LOCAL_PASSWORD });
    expect(owner).toMatchObject({ key: "owner", userId: ANA.userId, profileId: reg.view.profile.id, via: "migration" });
    db.close();

    const after = await snapshot(LOCAL_DB_NAME);
    expect(after.accounts).toEqual(before.accounts);
    expect(after.outbox).toEqual(before.outbox);
    expect(after.settings).toEqual(before.settings);
    expect(after.profiles).toEqual(before.profiles);
    expect(after.credentials).toHaveLength(1);
    expect(after.credentials[0]).toMatchObject({ userId: reg.view.profile.id, migratedTo: ANA.userId, disabledAt: expect.any(String), verifier: before.credentials[0]!.verifier });
    expect((await snapshot(LOCAL_DB_NAME)).accounts.find((a) => a.id === account.id)?.initialBalance).toBe(1234_56);

    const resolution = await resolveIdentity(ANA, open);
    expect(resolution).toMatchObject({ kind: "bound", dbName: LOCAL_DB_NAME });
    if (resolution.kind !== "bound") throw new Error("expected bound");
    const view = await loadIdentityView(await open(LOCAL_DB_NAME), resolution.owner);
    expect(view).toMatchObject({ preferredCurrency: "USD", profile: { username: "ana.local", fullName: "Ana Local" } });
  });

  it("after migration the old mechanism is off: local login and remembered local sessions no longer open the app", async () => {
    const { reg } = await localAccountWithData();
    const db = await getLocalDb();
    expect(await db.count("sessions")).toBe(1);
    const linkDb = await open(LOCAL_DB_NAME);
    await linkByMigration(linkDb, ANA, { username: "ana.local", password: LOCAL_PASSWORD });
    linkDb.close();
    expect(await db.count("sessions")).toBe(0);
    await expect(login(db, { username: "ana.local", password: LOCAL_PASSWORD })).rejects.toMatchObject({ code: "ACCOUNT_MIGRATED" });
    await expect(login(db, { username: "ana.local", password: "incorrecta-ficticia" })).rejects.toMatchObject({ code: "AUTH_FAILED" }); // no oracle
    expect(await resolveSession(db, { tabSessionId: reg.session.id })).toBeNull();
    // A second migration attempt (e.g. another identity) is refused.
    const again = await open(LOCAL_DB_NAME);
    await expect(linkByMigration(again, BRUNO, { username: "ana.local", password: LOCAL_PASSWORD })).rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
    again.close();
  });

  it("interrupted migration: verified but not committed → nothing changed, the user can resume", async () => {
    await localAccountWithData();
    const before = await snapshot(LOCAL_DB_NAME);
    const db = await open(LOCAL_DB_NAME);
    await expect(
      linkByMigration(db, ANA, { username: "ana.local", password: LOCAL_PASSWORD }, { afterVerified: () => Promise.reject(new Error("pestaña cerrada (simulado)")) }),
    ).rejects.toThrow("pestaña cerrada");
    db.close();

    const after = await snapshot(LOCAL_DB_NAME);
    expect(after.accounts).toEqual(before.accounts);
    expect(after.credentials[0]!.disabledAt).toBeUndefined(); // the local account still works
    expect(await resolveIdentity(ANA, open)).toMatchObject({ kind: "needs-link", summary: { interrupted: true } });
    const local = await getLocalDb();
    await expect(login(local, { username: "ana.local", password: LOCAL_PASSWORD })).resolves.toBeTruthy();

    const resume = await open(LOCAL_DB_NAME);
    await linkByMigration(resume, ANA, { username: "ana.local", password: LOCAL_PASSWORD });
    expect(await resume.get("device", "cloud-migration")).toBeUndefined();
    resume.close();
    expect(await resolveIdentity(ANA, open)).toMatchObject({ kind: "bound", dbName: LOCAL_DB_NAME });
  });

  it("data without a local account (e.g. imported) is linked only on explicit confirmation", async () => {
    await mutate((r) => r.accounts.create({ name: "EJEMPLO-FICTICIO Banco", institution: null, accountType: "checking", currency: "ARS", initialBalance: 0, openingDate: null, status: "active" }));
    expect(await resolveIdentity(ANA, open)).toMatchObject({ kind: "needs-link", summary: { localUsername: null } });
    const db = await open(LOCAL_DB_NAME);
    const owner = await linkConfirmed(db, ANA);
    expect(owner).toMatchObject({ via: "confirmed", profileId: ANA.userId });
    expect(await db.get("profiles", ANA.userId)).toMatchObject({ username: "ana", fullName: "Ana Ejemplo", email: "" }); // email stays in Supabase Auth
    db.close();
  });

  it("a local account cannot be bypassed with 'confirm': its password is required", async () => {
    await localAccountWithData();
    const db = await open(LOCAL_DB_NAME);
    await expect(linkConfirmed(db, ANA)).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    expect(await readOwner(db)).toBeNull();
    db.close();
  });

  it("'start without these data': an empty database of its own; the existing data stay unlinked and intact", async () => {
    await localAccountWithData();
    const before = await snapshot(LOCAL_DB_NAME);
    const name = await chooseSeparate(ANA, open);
    expect(name).toBe(localDbNameFor(ANA.userId));
    expect(await resolveIdentity(ANA, open)).toMatchObject({ kind: "bound", dbName: name }); // remembered
    expect(await snapshot(LOCAL_DB_NAME)).toEqual(before);
    expect((await snapshot(name)).accounts).toEqual([]);
  });
});

describe("separation between two identities on the same browser", () => {
  it("an empty browser is linked directly; a second identity gets its own database; nothing is shared", async () => {
    expect(await resolveIdentity(ANA, open)).toMatchObject({ kind: "bound", dbName: LOCAL_DB_NAME, owner: { via: "empty" } });

    await setActiveLocalDb(LOCAL_DB_NAME);
    await mutate((r) => r.accounts.create({ name: "EJEMPLO-FICTICIO Cuenta de Ana", institution: null, accountType: "cash", currency: "ARS", initialBalance: 500_00, openingDate: null, status: "active" }));

    const bruno = await resolveIdentity(BRUNO, open);
    expect(bruno).toMatchObject({ kind: "bound", dbName: localDbNameFor(BRUNO.userId), owner: { userId: BRUNO.userId, profileId: BRUNO.userId } });
    await setActiveLocalDb(localDbNameFor(BRUNO.userId));
    expect(getActiveLocalDbName()).toBe(localDbNameFor(BRUNO.userId));
    expect(await (await getLocalDb()).getAll("accounts")).toEqual([]); // Ana's data is not visible
    await mutate((r) => r.accounts.create({ name: "EJEMPLO-FICTICIO Cuenta de Bruno", institution: null, accountType: "cash", currency: "ARS", initialBalance: 1, openingDate: null, status: "active" }));

    expect((await snapshot(LOCAL_DB_NAME)).accounts.map((a) => a.name)).toEqual(["EJEMPLO-FICTICIO Cuenta de Ana"]);
    expect((await snapshot(localDbNameFor(BRUNO.userId))).accounts.map((a) => a.name)).toEqual(["EJEMPLO-FICTICIO Cuenta de Bruno"]);
    expect(await resolveIdentity(ANA, open)).toMatchObject({ dbName: LOCAL_DB_NAME });
    expect(await resolveIdentity(BRUNO, open)).toMatchObject({ dbName: localDbNameFor(BRUNO.userId) });
  });

  it("switching identity closes the previous connection (no stale handle reaches the other database)", async () => {
    await setActiveLocalDb(LOCAL_DB_NAME);
    const first = await getLocalDb();
    await setActiveLocalDb(localDbNameFor(BRUNO.userId));
    await expect(first.getAll("accounts")).rejects.toThrow(); // closed
    expect((await getLocalDb()).name).toBe(localDbNameFor(BRUNO.userId));
  });

  it("each identity's export contains only its own data", async () => {
    await resolveIdentity(ANA, open);
    await setActiveLocalDb(LOCAL_DB_NAME);
    await mutate((r) => r.accounts.create({ name: "EJEMPLO-FICTICIO Solo Ana", institution: null, accountType: "cash", currency: "ARS", initialBalance: 1, openingDate: null, status: "active" }));
    await resolveIdentity(BRUNO, open);
    await setActiveLocalDb(localDbNameFor(BRUNO.userId));
    const exported = JSON.stringify(await exportData(await getLocalDb()));
    expect(exported).not.toContain("Solo Ana");
  });

  it("the owner check is atomic: an identity can never take over a database owned by another", async () => {
    await resolveIdentity(ANA, open);
    const db = await open(LOCAL_DB_NAME);
    await expect(linkConfirmed(db, BRUNO)).rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
    expect(await readOwner(db)).toMatchObject({ userId: ANA.userId });
    db.close();
  });

  it("rejects malformed identities", async () => {
    await expect(resolveIdentity({ ...ANA, userId: "../pfm-local" }, open)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(() => localDbNameFor("x")).toThrow();
  });
});

describe("profile and logout in cloud mode", () => {
  it("profile updates of the bound identity use the shared profile/settings service (one source of truth)", async () => {
    const r = await resolveIdentity(ANA, open);
    if (r.kind !== "bound") throw new Error("expected bound");
    await setActiveLocalDb(r.dbName);
    const db = await getLocalDb();
    const view = await loadIdentityView(db, r.owner);
    const saved = await updateProfile(db, r.owner.profileId, {
      fullName: "Ana E.",
      email: view.profile.email,
      phone: "+54 11 5555-0000",
      country: "AR",
      region: "Mendoza",
      secondaryCurrency: "USD",
      language: "es-AR",
      dateFormat: "yyyy-MM-dd",
      preferredCurrency: "EUR",
      timezone: view.timezone,
      numberFormat: view.numberFormat,
    });
    expect(saved).toMatchObject({ preferredCurrency: "EUR", profile: { fullName: "Ana E.", dateFormat: "yyyy-MM-dd", email: "" } });
    expect(await loadIdentityView(db, r.owner)).toEqual(saved);
  });

  it("logging out (back to the default database) deletes nothing", async () => {
    const r = await resolveIdentity(BRUNO, open);
    await setActiveLocalDb((r as { dbName: string }).dbName);
    await mutate((m) => m.accounts.create({ name: "EJEMPLO-FICTICIO Persistente", institution: null, accountType: "cash", currency: "ARS", initialBalance: 1, openingDate: null, status: "active" }));
    await setActiveLocalDb(LOCAL_DB_NAME); // what sign-out does
    expect((await snapshot((r as { dbName: string }).dbName)).accounts.map((a) => a.name)).toContain("EJEMPLO-FICTICIO Persistente");
  });

  it("local mode keeps working exactly as before for a non-migrated account", async () => {
    const db = await getLocalDb();
    const reg = await register(db, { username: "carla.local", password: LOCAL_PASSWORD, confirmation: LOCAL_PASSWORD, fullName: "", email: "", remember: true });
    await logout(db, reg.session.id);
    await expect(login(db, { username: "carla.local", password: LOCAL_PASSWORD })).resolves.toMatchObject({ view: { profile: { username: "carla.local" } } });
  });
});
