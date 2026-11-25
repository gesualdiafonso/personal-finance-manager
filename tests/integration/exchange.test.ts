import { asLocalDate } from "@/lib/formatting/date";
import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  applyImport,
  buildBackup,
  checkChangeset,
  exportChangeset,
  exportData,
  previewImport,
  REPLACE_CONFIRMATION,
  restoreBackup,
  rollbackLastImport,
  unmarkChangeset,
  verifyExchangeFile,
} from "@/services/exchange/exchange";
import { createRepositories } from "@/services/repositories/repositories";
import { checkLocalIntegrity, countPendingOperations, getLocalStoreStatus, importPublication, openLocalStore } from "@/services/storage/local-store";
import { loadSampleFiles, sampleId as ID, samplePublication } from "../helpers/sample-data";

const now = () => new Date("2026-11-24T12:00:00Z");
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

async function setup() {
  const db = await openLocalStore();
  const { dataSet, files } = await samplePublication(2);
  await importPublication(db, dataSet, files);
  return { db, repos: createRepositories({ db, now }) };
}

const newExpense = (description = "EJEMPLO-FICTICIO Nuevo gasto") => ({
  type: "expense" as const,
  description,
  amount: 99900,
  currency: "ARS" as const,
  categoryId: ID(3),
  accountId: ID(1),
  destinationAccountId: null,
  cardId: null,
  date: asLocalDate("2026-11-24"),
  status: "completed" as const,
  notes: null,
  billId: null,
  recurrenceId: null,
});

describe("export", () => {
  it("exports everything with a verifiable SHA-256 and counts", async () => {
    const { db } = await setup();
    const file = await exportData(db, { now });
    expect(file).toMatchObject({ format: "pfm.export", scope: "full", schemaVersion: "2.4.0", basedOnRevision: 2 });
    expect(file.integrity.counts).toMatchObject({ accounts: 3, transactions: 7, outbox: 0 });
    await expect(verifyExchangeFile(json(file))).resolves.toMatchObject({ kind: "export" });
    db.close();
  });

  it("exports selected entities only", async () => {
    const { db } = await setup();
    const file = await exportData(db, { entities: ["accounts", "categories"], now });
    expect(file.scope).toBe("selected");
    expect(Object.keys(file.records)).toEqual(["accounts", "categories"]);
    expect(file.settings).toBeNull();
    db.close();
  });

  it("detects an altered or truncated file", async () => {
    const { db } = await setup();
    const file = json(await exportData(db, { now }));
    const altered = json(file);
    (altered.records.accounts![0] as { initialBalance: number }).initialBalance = 1;
    await expect(verifyExchangeFile(altered)).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });
    const truncated = json(file);
    truncated.records.transactions!.pop();
    await expect(verifyExchangeFile(truncated)).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });
    await expect(verifyExchangeFile({ format: "otro" })).rejects.toMatchObject({ code: "IMPORT_REJECTED" });
    db.close();
  });
});

describe("changesets (D2-07, D2-08)", () => {
  it("exports pending operations once and marks them", async () => {
    const { db, repos } = await setup();
    expect(await exportChangeset(db, { now })).toBeNull();
    await repos.transactions.create(newExpense());
    const cs = (await exportChangeset(db, { now }))!;
    expect(cs.operations).toHaveLength(1);
    expect(await countPendingOperations(db)).toBe(0);
    expect(await exportChangeset(db, { now })).toBeNull();
    expect(await unmarkChangeset(db, cs.changesetId)).toBe(1);
    expect(await countPendingOperations(db)).toBe(1);
    db.close();
  });

  it("checks a changeset against data/ in memory without writing", async () => {
    const { db, repos } = await setup();
    await repos.transactions.create(newExpense());
    const account = (await repos.accounts.getById(ID(2)))!;
    await repos.accounts.update(account.id, { name: "EJEMPLO-FICTICIO Ahorro" }, account.rev);
    const cs = json((await exportChangeset(db, { now }))!);
    const files = loadSampleFiles();
    const before = JSON.stringify(files);
    const result = await checkChangeset(files, cs);
    expect(result).toMatchObject({ ok: true, operations: 2, mismatches: [] });
    expect(result.byEntity).toEqual({ transactions: { create: 1 }, accounts: { update: 1 } });
    expect(JSON.stringify(files)).toBe(before);
    db.close();
  });

  it("reports operations whose base revision no longer matches", async () => {
    const { db, repos } = await setup();
    const account = (await repos.accounts.getById(ID(2)))!;
    await repos.accounts.update(account.id, { name: "EJEMPLO-FICTICIO Ahorro" }, account.rev);
    const cs = json((await exportChangeset(db, { now }))!);
    const files = loadSampleFiles();
    (files["accounts.json"] as { records: { id: string; rev: number }[] }).records.find((a) => a.id === ID(2))!.rev = 7;
    const result = await checkChangeset(files, cs);
    expect(result.ok).toBe(false);
    expect(result.mismatches[0]).toMatchObject({ entity: "accounts", id: ID(2) });
    db.close();
  });
});

describe("import", () => {
  it("previews without writing, then merges new records", async () => {
    const { db, repos } = await setup();
    await repos.transactions.create(newExpense());
    const file = json(await exportData(db, { entities: ["transactions"], now }));

    globalThis.indexedDB = new IDBFactory();
    const other = await setup();
    const preview = await previewImport(other.db, file);
    expect(preview.counts.transactions).toMatchObject({ new: 1, identical: 7, conflict: 0 });
    expect(preview.canApply).toBe(true);
    expect(await other.db.count("transactions")).toBe(7);
    await applyImport(other.db, file, { now });
    expect(await other.db.count("transactions")).toBe(8);
    expect(await countPendingOperations(other.db)).toBe(1); // will travel in the next changeset
    expect(await checkLocalIntegrity(other.db)).toEqual({ ok: true, problems: [] });
    other.db.close();
    db.close();
  });

  it("rejects the whole merge on a conflict and changes nothing", async () => {
    const { db, repos } = await setup();
    const a = (await repos.accounts.getById(ID(2)))!;
    await repos.accounts.update(a.id, { name: "EJEMPLO-FICTICIO A" }, a.rev);
    const file = json(await exportData(db, { entities: ["accounts"], now }));

    globalThis.indexedDB = new IDBFactory();
    const other = await setup();
    const b = (await other.repos.accounts.getById(ID(2)))!;
    await other.repos.accounts.update(b.id, { name: "EJEMPLO-FICTICIO B" }, b.rev);
    const preview = await previewImport(other.db, file);
    expect(preview.conflicts).toEqual([{ entity: "accounts", id: ID(2), reason: "changed locally and not exported yet" }]);
    await expect(applyImport(other.db, file, { now })).rejects.toMatchObject({ code: "IMPORT_REJECTED" });
    expect((await other.repos.accounts.getById(ID(2)))?.name).toBe("EJEMPLO-FICTICIO B");
    other.db.close();
    db.close();
  });

  it("rejects records that break references, and older schema versions", async () => {
    const { db } = await setup();
    const file = json(await exportData(db, { entities: ["transactions"], now }));
    globalThis.indexedDB = new IDBFactory();
    const empty = await openLocalStore();
    const preview = await previewImport(empty, file);
    expect(preview.canApply).toBe(false);
    expect(preview.issues.some((i) => i.layer === "references")).toBe(true);
    // Changing the version without re-hashing is caught by the integrity check first.
    await expect(applyImport(empty, { ...file, schemaVersion: "1.0.0" })).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });
    empty.close();
    db.close();
  });

  it("replace needs confirmation; rollback restores the previous state", async () => {
    const { db, repos } = await setup();
    const backup = json(await buildBackup(db, now));
    await repos.transactions.create(newExpense());
    await expect(applyImport(db, backup, { mode: "replace" })).rejects.toMatchObject({ code: "PROTECTED_OPERATION" });
    await applyImport(db, backup, { mode: "replace", confirmation: REPLACE_CONFIRMATION, now });
    expect(await db.count("transactions")).toBe(7);
    expect(await countPendingOperations(db)).toBe(0); // the backup had none
    await rollbackLastImport(db);
    expect(await db.count("transactions")).toBe(8);
    expect(await countPendingOperations(db)).toBe(1);
    await expect(rollbackLastImport(db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    db.close();
  });

  it("round-trips a full backup including pending changes to a new device", async () => {
    const { db, repos } = await setup();
    await repos.transactions.create(newExpense());
    const backup = json(await buildBackup(db, now));
    expect(backup.outbox).toHaveLength(1);
    db.close();

    globalThis.indexedDB = new IDBFactory();
    const fresh = await openLocalStore();
    await restoreBackup(fresh, backup, now);
    const status = await getLocalStoreStatus(fresh);
    expect(status.latestPublication?.dataRevision).toBe(2);
    expect(status.pendingOperations).toBe(1);
    expect(status.recordCounts.transactions).toBe(8);
    expect(await checkLocalIntegrity(fresh)).toEqual({ ok: true, problems: [] });
    fresh.close();
  });
});

describe("changeset fixture used by CI", () => {
  it("still applies cleanly to data/", async () => {
    const { readFileSync } = await import("node:fs");
    const fixture = JSON.parse(readFileSync("tests/fixtures/changesets/sample.changeset.json", "utf8")) as unknown;
    expect(await checkChangeset(loadSampleFiles(), fixture)).toMatchObject({ ok: true, operations: 2 });
  });
});
