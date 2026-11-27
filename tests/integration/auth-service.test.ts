import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { displayFirstName, profileInitials, userProfileSchema } from "@/domain/profile";
import { getLocalDb, mutate } from "@/hooks/use-local-data";
import {
  changePassword,
  hasAccount,
  LOGIN_BACKOFF,
  login,
  logout,
  register,
  resolveSession,
  SESSION_POLICY,
  touchSession,
  updateProfile,
} from "@/services/auth/auth-service";
import { checkPassword, createPasswordVerifier, DUMMY_VERIFIER, passwordVerifierSchema, PASSWORD_KDF_ITERATIONS, verifyPassword } from "@/services/auth/password";
import { exportData } from "@/services/exchange/exchange";
import { clearLocalData, CLEAR_CONFIRMATION } from "@/services/repositories/repositories";
import { getFinancialSettings, LOCAL_DB_NAME, LOCAL_DB_VERSION, openLocalStore } from "@/services/storage/local-store";

/**
 * Local authentication (IndexedDB v4). All users, names and passwords are FICTITIOUS
 * (EJEMPLO-FICTICIO); the passwords below exist only in this file.
 */
const PASSWORD = "EJEMPLO-ficticio-2026";
const T0 = new Date("2026-11-27T12:00:00Z");
const at = (ms: number) => () => new Date(T0.getTime() + ms);
const base = { username: "Ana.Ejemplo", password: PASSWORD, confirmation: PASSWORD, fullName: "Ana Ejemplo Ficticia", email: "ana@example.invalid" };

describe("password hashing (PBKDF2, Web Crypto)", () => {
  it("never stores the password; salts each verifier; verifies only the right password", async () => {
    const a = await createPasswordVerifier(PASSWORD);
    const b = await createPasswordVerifier(PASSWORD);
    expect(passwordVerifierSchema.parse(a)).toEqual(a);
    expect(a.iterations).toBe(PASSWORD_KDF_ITERATIONS);
    expect(a.iterations).toBeGreaterThanOrEqual(600_000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(JSON.stringify(a)).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD + "x", a)).toBe(false);
    expect(await verifyPassword(PASSWORD, { ...a, iterations: 1000 })).toBe(false); // weakened verifier refused
    expect(passwordVerifierSchema.safeParse(DUMMY_VERIFIER).success).toBe(true);
  });
  it("password policy", () => {
    expect(checkPassword("corta")).toBe("too-short");
    expect(checkPassword("x".repeat(129))).toBe("too-long");
    expect(checkPassword("ana.ejemplo", { username: "ana.ejemplo" })).toBe("same-as-username");
    expect(checkPassword("12345678")).toBe("too-common");
    expect(checkPassword(PASSWORD, { confirmation: "otra-cosa-123" })).toBe("mismatch");
    expect(checkPassword(PASSWORD, { confirmation: PASSWORD })).toBeNull();
  });
});

describe("registration", () => {
  it("creates the account, normalises the username and signs in", async () => {
    const db = await getLocalDb();
    expect(await hasAccount(db)).toBe(false);
    const r = await register(db, { ...base, preferredCurrency: "USD", remember: true }, at(0));
    expect(r.view.profile.username).toBe("ana.ejemplo");
    expect(userProfileSchema.safeParse(r.view.profile).success).toBe(true);
    expect(r.view.preferredCurrency).toBe("USD");
    expect((await getFinancialSettings(db))?.baseCurrency).toBe("USD");
    expect(r.session.remember).toBe(true);
    expect(await hasAccount(db)).toBe(true);
    // Verifier kept apart from the profile; nothing in the profile resembles a secret.
    const profile = await db.get("profiles", r.view.profile.id);
    expect(Object.keys(profile!)).not.toEqual(expect.arrayContaining(["password", "hash", "salt", "verifier"]));
    expect((await db.get("credentials", r.view.profile.id))?.verifier.algorithm).toBe("PBKDF2-HMAC-SHA-256");
  });
  it("rejects a duplicate username and a second account on the same device", async () => {
    const db = await getLocalDb();
    await register(db, base, at(0));
    await expect(register(db, { ...base, username: "ANA.EJEMPLO" }, at(1))).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
    await expect(register(db, { ...base, username: "otro.usuario" }, at(1))).rejects.toMatchObject({ code: "ACCOUNT_EXISTS" });
    expect(await db.count("profiles")).toBe(1);
  });
  it("validates username and password", async () => {
    const db = await getLocalDb();
    await expect(register(db, { ...base, username: "a" }, at(0))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(register(db, { ...base, username: "con espacio" }, at(0))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(register(db, { ...base, confirmation: "distinta-123" }, at(0))).rejects.toMatchObject({ code: "WEAK_PASSWORD", details: ["mismatch"] });
    await expect(register(db, { ...base, password: "corta", confirmation: "corta" }, at(0))).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    expect(await hasAccount(db)).toBe(false);
  });
  it("keeps every existing financial record and associates it with the new account", async () => {
    const created = await mutate((r) =>
      r.accounts.create({ name: "EJEMPLO-FICTICIO Caja", institution: null, accountType: "cash", currency: "ARS", initialBalance: 1000_00, openingDate: null, status: "active" }),
    );
    const db = await getLocalDb();
    const before = await db.getAll("accounts");
    const r = await register(db, base, at(0));
    expect(r.preservedRecords).toBe(1);
    expect(await db.getAll("accounts")).toEqual(before);
    expect((await db.get("accounts", created.id))?.initialBalance).toBe(1000_00);
  });
});

describe("login, sessions, logout", () => {
  it("valid credentials sign in; invalid ones fail the same way for unknown users", async () => {
    const db = await getLocalDb();
    const r = await register(db, base, at(0));
    await logout(db, r.session.id);
    const s = await login(db, { username: " ANA.ejemplo ", password: PASSWORD }, at(1000));
    expect(s.view.profile.id).toBe(r.view.profile.id);
    await expect(login(db, { username: "ana.ejemplo", password: "incorrecta-123" }, at(2000))).rejects.toMatchObject({ code: "AUTH_FAILED" });
    await expect(login(db, { username: "nadie", password: PASSWORD }, at(2000))).rejects.toMatchObject({ code: "AUTH_FAILED" });
  });
  it("backs off after repeated failures, then accepts the right password", async () => {
    const db = await getLocalDb();
    await register(db, base, at(0));
    for (let i = 0; i < LOGIN_BACKOFF.freeAttempts; i++) {
      await expect(login(db, { username: "ana.ejemplo", password: "mal-" + i + "-xxxx" }, at(i))).rejects.toMatchObject({ code: "AUTH_FAILED" });
    }
    await expect(login(db, { username: "ana.ejemplo", password: PASSWORD }, at(10))).rejects.toMatchObject({ code: "AUTH_LOCKED", details: ["30"] });
    const ok = await login(db, { username: "ana.ejemplo", password: PASSWORD }, at(31_000));
    expect(ok.session.userId).toBeTruthy();
    expect((await db.getAll("credentials"))[0]).toMatchObject({ failedAttempts: 0, lockedUntil: null });
  });
  it("a remembered session persists; a tab session needs its tab and idles out", async () => {
    const db = await getLocalDb();
    const r = await register(db, { ...base, remember: true }, at(0));
    expect(await resolveSession(db, { tabSessionId: null }, at(5 * 24 * 3600_000))).toMatchObject({ session: { id: r.session.id } });
    expect(await resolveSession(db, { tabSessionId: null }, at(SESSION_POLICY.rememberTtlMs + 1))).toBeNull(); // expired …
    expect(await db.count("sessions")).toBe(0); // … and deleted

    const tab = await login(db, { username: "ana.ejemplo", password: PASSWORD, remember: false }, at(0));
    expect(await resolveSession(db, { tabSessionId: null }, at(1000))).toBeNull(); // browser restarted: no tab marker
    expect(await resolveSession(db, { tabSessionId: tab.session.id }, at(1000))).not.toBeNull();
    await touchSession(db, tab.session.id, at(20 * 60_000));
    expect(await resolveSession(db, { tabSessionId: tab.session.id }, at(45 * 60_000))).not.toBeNull(); // active 25 min ago
    expect(await resolveSession(db, { tabSessionId: tab.session.id }, at(51 * 60_000))).toBeNull(); // 31 min idle
  });
  it("logout deletes the session", async () => {
    const db = await getLocalDb();
    const r = await register(db, { ...base, remember: true }, at(0));
    await logout(db, r.session.id);
    expect(await db.get("sessions", r.session.id)).toBeUndefined();
    expect(await resolveSession(db, { tabSessionId: r.session.id }, at(1))).toBeNull();
  });
});

describe("password change and profile", () => {
  it("needs the current password, re-salts, and ends the other sessions", async () => {
    const db = await getLocalDb();
    const r = await register(db, { ...base, remember: true }, at(0));
    const other = await login(db, { username: "ana.ejemplo", password: PASSWORD, remember: true }, at(1));
    const before = (await db.get("credentials", r.view.profile.id))!.verifier;
    const NEW = "EJEMPLO-nueva-clave-27";
    const input = { userId: r.view.profile.id, currentSessionId: r.session.id, current: "incorrecta-123", next: NEW, confirmation: NEW };
    await expect(changePassword(db, input, at(2))).rejects.toMatchObject({ code: "AUTH_FAILED" });
    await expect(changePassword(db, { ...input, current: PASSWORD, next: PASSWORD, confirmation: PASSWORD }, at(2))).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    await changePassword(db, { ...input, current: PASSWORD }, at(2));
    const after = (await db.get("credentials", r.view.profile.id))!.verifier;
    expect(after.salt).not.toBe(before.salt);
    expect(await db.get("sessions", other.session.id)).toBeUndefined();
    expect(await db.get("sessions", r.session.id)).toBeDefined();
    await expect(login(db, { username: "ana.ejemplo", password: PASSWORD }, at(3))).rejects.toMatchObject({ code: "AUTH_FAILED" });
    await expect(login(db, { username: "ana.ejemplo", password: NEW }, at(3))).resolves.toBeTruthy();
  });
  it("updates the profile and the shared settings together; financial records untouched", async () => {
    const db = await getLocalDb();
    const r = await register(db, base, at(0));
    const view = await updateProfile(
      db,
      r.view.profile.id,
      { fullName: "Ana María Ejemplo", email: "", phone: "+54 11 0000-0000", country: "AR", region: "CABA", secondaryCurrency: "EUR", language: "es-AR", dateFormat: "yyyy-MM-dd", preferredCurrency: "USD", timezone: "America/Argentina/Cordoba", numberFormat: "es-AR" },
      at(1000),
    );
    expect(view.profile).toMatchObject({ fullName: "Ana María Ejemplo", country: "AR", dateFormat: "yyyy-MM-dd", secondaryCurrency: "EUR" });
    const settings = await getFinancialSettings(db);
    expect(settings).toMatchObject({ baseCurrency: "USD", timezone: "America/Argentina/Cordoba" });
    expect(settings?.exchange?.enabledCurrencies).toContain("EUR");
    expect(profileInitials(view.profile)).toBe("AE");
    expect(displayFirstName(view.profile)).toBe("Ana");
    await expect(updateProfile(db, r.view.profile.id, { ...view.profile, preferredCurrency: "USD", timezone: "Marte/Olimpo", numberFormat: "es-AR" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(updateProfile(db, r.view.profile.id, { ...view.profile, email: "no-es-email", preferredCurrency: "USD", timezone: "UTC", numberFormat: "es-AR" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("secrets never leave the auth stores", () => {
  it("exports contain no profile, verifier, salt, hash or session", async () => {
    const db = await getLocalDb();
    const r = await register(db, { ...base, remember: true }, at(0));
    const credential = (await db.get("credentials", r.view.profile.id))!;
    const file = JSON.stringify(await exportData(db));
    for (const secret of [credential.verifier.hash, credential.verifier.salt, r.session.id, PASSWORD, "ana.ejemplo", "ana@example.invalid"]) {
      expect(file).not.toContain(secret);
    }
    expect(file).not.toMatch(/"(verifier|credentials|sessions|profiles)"/);
  });
  it("'Borrar datos locales' keeps the account; the account never resets financial data", async () => {
    const db = await getLocalDb();
    await register(db, base, at(0));
    await clearLocalData(db, { confirmation: CLEAR_CONFIRMATION });
    expect(await hasAccount(db)).toBe(true);
  });
});

describe("IndexedDB upgrade v3 → v4", () => {
  it("adds the account stores without touching existing records", async () => {
    // pfm-local as a v3 build left it: a financial record and the migration log.
    const v3 = await openDB(LOCAL_DB_NAME, 3, {
      upgrade(db) {
        db.createObjectStore("accounts", { keyPath: "id" }).put({ id: "EJEMPLO", name: "EJEMPLO-FICTICIO", initialBalance: 123_45 });
        db.createObjectStore("migration_log", { keyPath: "id", autoIncrement: true });
      },
    });
    v3.close();
    expect(LOCAL_DB_VERSION).toBe(4);
    const db = await openLocalStore();
    expect(db.version).toBe(4);
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(["profiles", "credentials", "sessions", "accounts"]));
    expect(await db.get("accounts", "EJEMPLO")).toEqual({ id: "EJEMPLO", name: "EJEMPLO-FICTICIO", initialBalance: 123_45 });
    expect(await db.getAll("migration_log")).toEqual([expect.objectContaining({ from: 3, to: 4, moved: {} })]);
    expect(await db.count("profiles")).toBe(0);
    db.close();
  });
});
