import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { createRepositories } from "@/services/repositories/repositories";
import {
  checkLocalIntegrity,
  countPendingOperations,
  ensureDeviceId,
  ENTITY_STORES,
  getFinancialSettings,
  getLocalStoreStatus,
  importPublication,
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  openLocalStore,
} from "@/services/storage/local-store";
import { sampleId as ID, samplePublication } from "../helpers/sample-data";


async function withPublication(revision = 2) {
  const db = await openLocalStore();
  const { dataSet, files } = await samplePublication(revision);
  await importPublication(db, dataSet, files);
  return db;
}

describe("IndexedDB v2 initialization", () => {
  it("creates every store and index", async () => {
    const db = await openLocalStore();
    expect(db.name).toBe(LOCAL_DB_NAME);
    expect(db.version).toBe(LOCAL_DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(
      [...ENTITY_STORES, "device", "outbox", "publications", "snapshot", "settings", "legacy_v1", "migration_log", "rollback"].sort(),
    );
    expect([...db.transaction("transactions").store.indexNames].sort()).toEqual(["accountId", "cardId", "categoryId", "date", "destinationAccountId", "status", "type"]);
    db.close();
  });

  it("reports an empty, healthy store", async () => {
    const db = await openLocalStore();
    const status = await getLocalStoreStatus(db);
    expect(status.version).toBe(3);
    expect(status.latestPublication).toBeNull();
    expect(status.pendingOperations).toBe(0);
    expect(await checkLocalIntegrity(db)).toEqual({ ok: true, problems: [] });
    db.close();
  });

  it("keeps a stable device id", async () => {
    const db = await openLocalStore();
    expect(await ensureDeviceId(db)).toBe(await ensureDeviceId(db));
    db.close();
  });
});

describe("upgrade from the Step 01 (v1) database", () => {
  it("moves every v1 record to legacy_v1, never discarding one", async () => {
    const v1 = await openDB(LOCAL_DB_NAME, 1, {
      upgrade(db) {
        for (const s of ["accounts", "categories", "cards", "bills", "recurrences", "budgets", "transactions"]) db.createObjectStore(s, { keyPath: "id" });
        db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
        db.createObjectStore("publications", { keyPath: "dataRevision" });
        db.createObjectStore("device", { keyPath: "key" });
      },
    });
    await v1.put("accounts", { id: "a", amountMinor: 1 });
    await v1.put("transactions", { id: "t1", amountMinor: 2 });
    await v1.put("transactions", { id: "t2", amountMinor: 3 });
    await v1.add("outbox", { operationId: "o" });
    await v1.put("device", { key: "device", deviceId: "dev-1", createdAt: "2026-11-01T00:00:00-03:00" });
    v1.close();

    const db = await openLocalStore();
    expect(db.version).toBe(3);
    const legacy = await db.getAll("legacy_v1");
    expect(legacy).toHaveLength(4); // device stays in its own store
    expect(legacy.filter((l) => l.store === "transactions").map((l) => (l.record as { id: string }).id).sort()).toEqual(["t1", "t2"]);
    expect(await ensureDeviceId(db)).toBe("dev-1"); // the device id survives
    expect((await db.getAll("migration_log"))[0]).toMatchObject({ from: 1, to: 2, moved: { accounts: 1, transactions: 2, outbox: 1 } });
    expect(await db.count("transactions")).toBe(0);
    expect((await getLocalStoreStatus(db)).legacyRecords).toBe(4);
    expect((await db.getAll("migration_log"))[1]).toMatchObject({ from: 2, to: 3, moved: {} });
    db.close();
  });
});

describe("upgrade from the Step 02–05 (v2) database (Step 06)", () => {
  it("adds the goal stores and keeps every existing record", async () => {
    const v2 = await openDB(LOCAL_DB_NAME, 2, {
      upgrade(db) {
        for (const s of ["accounts", "categories", "cards", "bills", "recurrences", "budgets", "transactions"]) db.createObjectStore(s, { keyPath: "id" });
        db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
        db.createObjectStore("migration_log", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("device", { keyPath: "key" });
      },
    });
    await v2.put("budgets", { id: "b1", name: "EJEMPLO-FICTICIO" });
    await v2.add("outbox", { operationId: "o" });
    v2.close();

    const db = await openLocalStore();
    expect(db.version).toBe(3);
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(["goals", "goalContributions"]));
    expect([...db.transaction("goalContributions").store.indexNames].sort()).toEqual(["goalId", "transactionId"]);
    expect(await db.get("budgets", "b1")).toEqual({ id: "b1", name: "EJEMPLO-FICTICIO" });
    expect(await db.count("outbox")).toBe(1);
    expect(await db.getAll("migration_log")).toMatchObject([{ from: 2, to: 3, moved: {} }]);
    db.close();
  });
});

describe("publications", () => {
  it("stores snapshot, working stores and settings in one go", async () => {
    const db = await withPublication(2);
    const status = await getLocalStoreStatus(db);
    expect(status.latestPublication?.dataRevision).toBe(2);
    expect(status.recordCounts).toMatchObject({ accounts: 3, transactions: 7, budgets: 1, categories: 4 });
    expect((await db.get("snapshot", "current"))?.files["meta.json"]).toBeDefined();
    expect(await getFinancialSettings(db)).toMatchObject({ baseCurrency: "ARS", timezone: "America/Argentina/Buenos_Aires" });
    expect(await checkLocalIntegrity(db)).toEqual({ ok: true, problems: [] });
    db.close();
  });

  it("re-opens existing data without upgrading", async () => {
    (await withPublication()).close();
    const again = await openLocalStore();
    expect(await again.count("transactions")).toBe(7);
    again.close();
  });

  it("rejects an older publication unless restoring", async () => {
    const db = await withPublication(5);
    const older = await samplePublication(4);
    await expect(importPublication(db, older.dataSet, older.files)).rejects.toMatchObject({ code: "DATA_REVISION_REGRESSION" });
    await importPublication(db, older.dataSet, older.files, { allowRestore: true });
    db.close();
  });

  it("replays pending local changes over a new publication", async () => {
    const db = await withPublication(2);
    const repos = createRepositories({ db });
    const account = (await repos.accounts.getById(ID(2)))!;
    await repos.accounts.update(account.id, { name: "EJEMPLO-FICTICIO Renombrada" }, account.rev);
    expect(await countPendingOperations(db)).toBe(1);
    const next = await samplePublication(3);
    const result = await importPublication(db, next.dataSet, next.files);
    expect(result).toEqual({ replayed: 1, conflicts: 0, droppedAsPublished: 0 });
    expect((await repos.accounts.getById(ID(2)))?.name).toBe("EJEMPLO-FICTICIO Renombrada");
    db.close();
  });

  it("marks a replay as conflict when the publication changed the same record", async () => {
    const db = await withPublication(2);
    const repos = createRepositories({ db });
    const account = (await repos.accounts.getById(ID(2)))!;
    await repos.accounts.update(account.id, { name: "EJEMPLO-FICTICIO Local" }, account.rev);
    const next = await samplePublication(3);
    const published = next.dataSet.accounts.find((a) => a.id === ID(2))!;
    Object.assign(published, { name: "EJEMPLO-FICTICIO Publicada", rev: published.rev + 1 });
    const result = await importPublication(db, next.dataSet, next.files);
    expect(result.conflicts).toBe(1);
    expect((await repos.accounts.getById(ID(2)))?.name).toBe("EJEMPLO-FICTICIO Publicada"); // never overwritten silently
    expect((await getLocalStoreStatus(db)).conflictedOperations).toBe(1);
    db.close();
  });
});

describe("local integrity checks", () => {
  it("detects a corrupted record without exposing values", async () => {
    const db = await withPublication();
    const tx = (await db.getAll("transactions"))[0]!;
    await db.put("transactions", { ...tx, amount: 1.5 });
    const report = await checkLocalIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.problems).toEqual([`transactions: record ${tx.id} does not match the schema`]);
    db.close();
  });

  it("detects a broken reference", async () => {
    const db = await withPublication();
    const tx = (await db.getAll("transactions"))[0]!;
    await db.put("transactions", { ...tx, accountId: ID(999) });
    const report = await checkLocalIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain(tx.id);
    db.close();
  });
});
