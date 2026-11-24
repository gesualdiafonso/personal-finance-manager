import { describe, expect, it } from "vitest";
import { validateDataFiles } from "@/services/data/dataset";
import {
  appendLocalOperation,
  buildBackup,
  checkLocalIntegrity,
  countPendingOperations,
  ensureDeviceId,
  getLocalStoreStatus,
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  OFFICIAL_STORES,
  openLocalStore,
  replaceOfficialData,
  restoreBackup,
} from "@/services/storage/local-store";
import { loadSampleFiles } from "../helpers/sample-data";

function sampleDataSet(revision = 1) {
  const files = loadSampleFiles();
  (files["meta.json"] as { dataRevision: number }).dataRevision = revision;
  const { dataSet } = validateDataFiles(files);
  if (!dataSet) throw new Error("sample data invalid");
  return dataSet;
}

const operation = {
  operationId: "0193f7d0-5e12-7b44-8c01-3a9f2e6b7d10",
  op: "create" as const,
  entity: "transactions" as const,
  recordId: "0193f6c2-7a41-7c3e-9b10-5d2e8f4a1c07",
  baseRev: null,
  record: { id: "0193f6c2-7a41-7c3e-9b10-5d2e8f4a1c07" },
  createdAt: "2026-11-24T08:55:00-03:00",
  exportedIn: null,
};

describe("IndexedDB initialization", () => {
  it("creates every store at version 1", async () => {
    const db = await openLocalStore();
    expect(db.name).toBe(LOCAL_DB_NAME);
    expect(db.version).toBe(LOCAL_DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual([...OFFICIAL_STORES, "device", "outbox", "publications"].sort());
    expect([...db.transaction("transactions").store.indexNames].sort()).toEqual(["accountId", "cardId", "categoryId", "date", "status"]);
    db.close();
  });

  it("reports an empty, healthy store", async () => {
    const db = await openLocalStore();
    const status = await getLocalStoreStatus(db);
    expect(status.version).toBe(1);
    expect(status.latestPublication).toBeNull();
    expect(status.pendingOperations).toBe(0);
    expect(await checkLocalIntegrity(db)).toEqual({ ok: true, problems: [] });
    db.close();
  });

  it("keeps a stable device id", async () => {
    const db = await openLocalStore();
    const a = await ensureDeviceId(db);
    const b = await ensureDeviceId(db);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    db.close();
  });

  it("re-opens existing data without upgrading", async () => {
    const db = await openLocalStore();
    await replaceOfficialData(db, sampleDataSet());
    db.close();
    const again = await openLocalStore();
    expect(await again.count("transactions")).toBe(4);
    again.close();
  });
});

describe("official data vs local operations", () => {
  it("stores a publication as a whole and records its revision", async () => {
    const db = await openLocalStore();
    await replaceOfficialData(db, sampleDataSet(1));
    const status = await getLocalStoreStatus(db);
    expect(status.latestPublication?.dataRevision).toBe(1);
    expect(status.officialCounts).toMatchObject({ accounts: 2, transactions: 4, budgets: 1 });
    db.close();
  });

  it("rejects an older publication unless restoring", async () => {
    const db = await openLocalStore();
    await replaceOfficialData(db, sampleDataSet(5));
    await expect(replaceOfficialData(db, sampleDataSet(4))).rejects.toMatchObject({ code: "DATA_REVISION_REGRESSION" });
    await replaceOfficialData(db, sampleDataSet(4), { allowRestore: true });
    db.close();
  });

  it("keeps local operations in the outbox and never in official stores", async () => {
    const db = await openLocalStore();
    await replaceOfficialData(db, sampleDataSet());
    await appendLocalOperation(db, operation);
    expect(await countPendingOperations(db)).toBe(1);
    expect(await db.count("transactions")).toBe(4);
    // A new publication replaces official data but leaves unexported changes alone.
    await replaceOfficialData(db, sampleDataSet(2));
    expect(await countPendingOperations(db)).toBe(1);
    db.close();
  });

  it("refuses an invalid local operation", async () => {
    const db = await openLocalStore();
    await expect(appendLocalOperation(db, { ...operation, recordId: "not-a-uuid" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    db.close();
  });
});

describe("export / import foundation", () => {
  it("round-trips a backup including the outbox", async () => {
    const db = await openLocalStore();
    await replaceOfficialData(db, sampleDataSet(3));
    await appendLocalOperation(db, operation);
    const backup = await buildBackup(db);
    expect(backup.publication?.dataRevision).toBe(3);
    expect(backup.outbox).toHaveLength(1);
    db.close();

    globalThis.indexedDB = new (await import("fake-indexeddb")).IDBFactory();
    const fresh = await openLocalStore();
    await restoreBackup(fresh, JSON.parse(JSON.stringify(backup)));
    const status = await getLocalStoreStatus(fresh);
    expect(status.latestPublication?.dataRevision).toBe(3);
    expect(status.pendingOperations).toBe(1);
    expect(status.officialCounts.transactions).toBe(4);
    fresh.close();
  });

  it("rejects an invalid backup and changes nothing", async () => {
    const db = await openLocalStore();
    await replaceOfficialData(db, sampleDataSet());
    await expect(restoreBackup(db, { schema: "pfm.backup" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await db.count("transactions")).toBe(4);
    db.close();
  });
});

describe("local integrity checks", () => {
  it("detects a corrupted record without exposing values", async () => {
    const db = await openLocalStore();
    await replaceOfficialData(db, sampleDataSet());
    const tx = (await db.getAll("transactions"))[0]!;
    await db.put("transactions", { ...tx, amountMinor: 1.5 });
    const report = await checkLocalIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.problems).toEqual([`transactions: record ${tx.id} does not match the schema`]);
    db.close();
  });
});
