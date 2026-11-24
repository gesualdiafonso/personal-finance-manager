import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from "idb";
import { z } from "zod";
import { uuidv7 } from "@/domain/ids";
import {
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  isoDateTime,
  uuid,
  type Account,
  type Bill,
  type Budget,
  type Card,
  type Category,
  type EntityName,
  type FinancialSettings,
  type Meta,
  type Recurrence,
  type Transaction,
} from "@/domain/schemas";
import { AppError } from "@/lib/errors/app-error";
import { toIsoWithOffset } from "@/lib/formatting/date";
import { assertRevisionNotOlder } from "@/lib/validation/compatibility";
import { validateIntegrity, type DataFileMap, type OfficialDataSet } from "@/services/data/dataset";

/**
 * Local persistence in the browser's IndexedDB (D1, D2-05). IndexedDB is a storage API of
 * the browser on this device — not a database service, server or ORM, and NOT encrypted
 * (at-rest encryption is open decision OD-3; see docs/architecture/data-security.md).
 *
 * Version 2 layout (docs/architecture/local-persistence.md):
 * - Working stores (accounts … transactions): the last publication WITH local changes
 *   applied. Repositories read and write here.
 * - `snapshot`: the last publication exactly as imported (its data files), so the working
 *   stores can always be rebuilt as snapshot + outbox.
 * - `outbox`: every local change, in order, until it is exported (and later published).
 * - `settings`: Financial Settings (not UI preferences, which stay in LocalStorage).
 * - `legacy_v1`: version 1 records moved aside on upgrade — never deleted.
 * - `rollback`: the state right before the last applied import (one level of undo).
 */
export const LOCAL_DB_NAME = "pfm-local";
export const LOCAL_DB_VERSION = 2;

export const ENTITY_STORES = ENTITY_NAMES;
/** @deprecated Step 01 name; the entity stores are now working stores. */
export const OFFICIAL_STORES = ENTITY_STORES;

export const localOperationSchema = z.object({
  seq: z.number().int().min(1).optional(),
  operationId: uuid,
  op: z.enum(["create", "update", "delete"]),
  entity: z.enum(ENTITY_NAMES as [EntityName, ...EntityName[]]),
  recordId: uuid,
  /** rev of the record before the change; null for create. */
  baseRev: z.number().int().min(1).nullable(),
  /** Full state of the record after the change (for delete: the tombstone). */
  record: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoDateTime,
  /** changesetId of the export that contained it, or null while pending. */
  exportedIn: uuid.nullable(),
  /** Set when replaying it over a newer publication found a conflict (never auto-resolved). */
  conflict: z.boolean().optional(),
});
export type LocalOperation = z.infer<typeof localOperationSchema>;

export interface PublicationRecord {
  dataRevision: number;
  schemaVersion: string;
  importedAt: string;
  meta: Meta;
}
interface SnapshotRecord {
  key: "current";
  dataRevision: number;
  schemaVersion: string;
  files: DataFileMap;
}
interface DeviceRecord {
  key: "device";
  deviceId: string;
  createdAt: string;
}
interface SettingsRecord {
  key: "financial";
  settings: FinancialSettings;
}
interface LegacyRecord {
  id?: number;
  fromVersion: number;
  store: string;
  record: unknown;
  movedAt: string;
}
interface MigrationLogRecord {
  id?: number;
  from: number;
  to: number;
  at: string;
  moved: Record<string, number>;
}

/** State saved right before an import is applied, so the import can be undone (one level). */
export interface RollbackRecord {
  key: "last";
  createdAt: string;
  reason: string;
  stores: Record<string, unknown[]>;
  outbox: LocalOperation[];
  settings: FinancialSettings | null;
}

export interface PfmLocalSchema extends DBSchema {
  accounts: { key: string; value: Account; indexes: { status: string } };
  cards: { key: string; value: Card; indexes: { accountId: string } };
  categories: { key: string; value: Category; indexes: { parentId: string; type: string } };
  bills: { key: string; value: Bill; indexes: { dueDate: string; accountId: string } };
  recurrences: { key: string; value: Recurrence; indexes: { accountId: string } };
  budgets: { key: string; value: Budget; indexes: { startDate: string; categoryId: string } };
  transactions: {
    key: string;
    value: Transaction;
    indexes: { date: string; accountId: string; destinationAccountId: string; categoryId: string; cardId: string; status: string; type: string };
  };
  outbox: { key: number; value: LocalOperation; indexes: { recordId: string; exportedIn: string; entity: string } };
  publications: { key: number; value: PublicationRecord };
  snapshot: { key: string; value: SnapshotRecord };
  settings: { key: string; value: SettingsRecord };
  device: { key: string; value: DeviceRecord };
  legacy_v1: { key: number; value: LegacyRecord };
  migration_log: { key: number; value: MigrationLogRecord };
  rollback: { key: string; value: RollbackRecord };
}

export type LocalDb = IDBPDatabase<PfmLocalSchema>;
export type LocalStoreName = StoreNames<PfmLocalSchema>;
export type ReadWriteTx = IDBPTransaction<PfmLocalSchema, LocalStoreName[], "readwrite">;

function createV2Stores(db: IDBPDatabase<PfmLocalSchema>): void {
  db.createObjectStore("accounts", { keyPath: "id" }).createIndex("status", "status");
  db.createObjectStore("cards", { keyPath: "id" }).createIndex("accountId", "accountId");
  const categories = db.createObjectStore("categories", { keyPath: "id" });
  categories.createIndex("parentId", "parentId");
  categories.createIndex("type", "type");
  const bills = db.createObjectStore("bills", { keyPath: "id" });
  bills.createIndex("dueDate", "dueDate");
  bills.createIndex("accountId", "accountId");
  db.createObjectStore("recurrences", { keyPath: "id" }).createIndex("accountId", "accountId");
  const budgets = db.createObjectStore("budgets", { keyPath: "id" });
  budgets.createIndex("startDate", "startDate");
  budgets.createIndex("categoryId", "categoryId");
  const tx = db.createObjectStore("transactions", { keyPath: "id" });
  for (const i of ["date", "accountId", "destinationAccountId", "categoryId", "cardId", "status", "type"] as const) tx.createIndex(i, i);
  const outbox = db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
  outbox.createIndex("recordId", "recordId");
  outbox.createIndex("exportedIn", "exportedIn");
  outbox.createIndex("entity", "entity");
  db.createObjectStore("publications", { keyPath: "dataRevision" });
  db.createObjectStore("snapshot", { keyPath: "key" });
  db.createObjectStore("settings", { keyPath: "key" });
  db.createObjectStore("legacy_v1", { keyPath: "id", autoIncrement: true });
  db.createObjectStore("migration_log", { keyPath: "id", autoIncrement: true });
  db.createObjectStore("rollback", { keyPath: "key" });
}

const V1_STORES = ["accounts", "categories", "cards", "bills", "recurrences", "budgets", "transactions", "outbox", "publications"] as const;

/** Opens the local store, creating it or upgrading it (v1 → v2 never discards a record). */
export async function openLocalStore(now: () => Date = () => new Date()): Promise<LocalDb> {
  if (typeof indexedDB === "undefined") throw new AppError("STORAGE_UNAVAILABLE", "IndexedDB is not available in this environment");
  try {
    return await openDB<PfmLocalSchema>(LOCAL_DB_NAME, LOCAL_DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          createV2Stores(db);
          db.createObjectStore("device", { keyPath: "key" });
          return;
        }
        if (oldVersion < 2) {
          // v1 records use the 1.x formats: move every one of them, untouched, to legacy_v1.
          // They are kept (never deleted) and can be exported; the working stores start empty
          // until the next 2.x publication or import.
          const movedAt = toIsoWithOffset(now());
          const raw = transaction as unknown as { objectStore(name: string): { getAll(): Promise<unknown[]> } };
          const legacy: { fromVersion: number; store: string; record: unknown; movedAt: string }[] = [];
          const moved: Record<string, number> = {};
          for (const name of V1_STORES) {
            const records = await raw.objectStore(name).getAll();
            moved[name] = records.length;
            for (const record of records) legacy.push({ fromVersion: 1, store: name, record, movedAt });
          }
          for (const name of V1_STORES) db.deleteObjectStore(name as never);
          createV2Stores(db);
          for (const item of legacy) await transaction.objectStore("legacy_v1").add(item);
          await transaction.objectStore("migration_log").add({ from: 1, to: 2, at: movedAt, moved });
        }
      },
      blocking() {
        // Another tab needs a newer version: let it upgrade.
      },
    });
  } catch (cause) {
    throw new AppError("STORAGE_UNAVAILABLE", "Could not open the local store", { cause });
  }
}

export async function ensureDeviceId(db: LocalDb, now: () => Date = () => new Date()): Promise<string> {
  const existing = await db.get("device", "device");
  if (existing) return existing.deviceId;
  const record: DeviceRecord = { key: "device", deviceId: uuidv7(), createdAt: toIsoWithOffset(now()) };
  try {
    await db.put("device", record);
  } catch (cause) {
    throw new AppError("STORAGE_FAILURE", "Could not save the device id", { cause });
  }
  return record.deviceId;
}

export interface LocalStoreStatus {
  version: number;
  deviceId: string;
  latestPublication: Pick<PublicationRecord, "dataRevision" | "schemaVersion" | "importedAt"> | null;
  pendingOperations: number;
  conflictedOperations: number;
  recordCounts: Record<EntityName, number>;
  legacyRecords: number;
}

export async function getLatestRevision(db: LocalDb): Promise<number | null> {
  const cursor = await db.transaction("publications").store.openCursor(null, "prev");
  return cursor?.value.dataRevision ?? null;
}

export async function getLocalStoreStatus(db: LocalDb): Promise<LocalStoreStatus> {
  const deviceId = await ensureDeviceId(db);
  const cursor = await db.transaction("publications").store.openCursor(null, "prev");
  const latest = cursor?.value ?? null;
  const ops = await db.getAll("outbox");
  const recordCounts = Object.fromEntries(await Promise.all(ENTITY_STORES.map(async (n) => [n, await db.count(n)] as const))) as Record<EntityName, number>;
  return {
    version: db.version,
    deviceId,
    latestPublication: latest ? { dataRevision: latest.dataRevision, schemaVersion: latest.schemaVersion, importedAt: latest.importedAt } : null,
    pendingOperations: ops.filter((o) => o.exportedIn === null).length,
    conflictedOperations: ops.filter((o) => o.conflict).length,
    recordCounts,
    legacyRecords: await db.count("legacy_v1"),
  };
}

export async function countPendingOperations(db: LocalDb): Promise<number> {
  return (await db.getAll("outbox")).filter((o) => o.exportedIn === null).length;
}

export async function getFinancialSettings(db: LocalDb): Promise<FinancialSettings | null> {
  return (await db.get("settings", "financial"))?.settings ?? null;
}

/* ------------------------------------------------------------------------------ */
/* Publication import: snapshot + rebuild working stores + replay outbox, atomic    */
/* ------------------------------------------------------------------------------ */

export interface ImportPublicationResult {
  replayed: number;
  conflicts: number;
  droppedAsPublished: number;
}

function recordsOf(dataSet: OfficialDataSet): Record<EntityName, { id: string }[]> {
  return {
    accounts: dataSet.accounts,
    cards: dataSet.cards,
    categories: dataSet.categories,
    bills: dataSet.bills,
    recurrences: dataSet.recurrences,
    budgets: Object.values(dataSet.budgets).flat(),
    transactions: Object.values(dataSet.transactions).flat(),
  };
}

/**
 * Stores a validated publication in ONE transaction: snapshot, working stores rebuilt from
 * it, settings, publication record; then pending local operations are replayed on top.
 * Operations already included in the publication (their changeset is in
 * meta.appliedChangesets) leave the outbox. A replay whose baseRev no longer matches is
 * marked `conflict` and NOT applied — conflicts are never resolved silently.
 */
export async function importPublication(
  db: LocalDb,
  dataSet: OfficialDataSet,
  files: DataFileMap,
  options: { allowRestore?: boolean; now?: () => Date } = {},
): Promise<ImportPublicationResult> {
  assertRevisionNotOlder(dataSet.meta.dataRevision, await getLatestRevision(db), { allowRestore: options.allowRestore });
  const tx = db.transaction([...ENTITY_STORES, "snapshot", "settings", "publications", "outbox"], "readwrite");
  try {
    await Promise.all(ENTITY_STORES.map((n) => tx.objectStore(n).clear()));
    const records = recordsOf(dataSet);
    const writes: Promise<unknown>[] = [];
    for (const name of ENTITY_STORES) for (const r of records[name]) writes.push(tx.objectStore(name).put(r as never));
    writes.push(tx.objectStore("snapshot").put({ key: "current", dataRevision: dataSet.meta.dataRevision, schemaVersion: dataSet.meta.schemaVersion, files }));
    writes.push(tx.objectStore("settings").put({ key: "financial", settings: dataSet.settings }));
    writes.push(
      tx.objectStore("publications").put({
        dataRevision: dataSet.meta.dataRevision,
        schemaVersion: dataSet.meta.schemaVersion,
        importedAt: toIsoWithOffset((options.now ?? (() => new Date()))()),
        meta: dataSet.meta,
      }),
    );
    await Promise.all(writes);

    const applied = new Set(dataSet.meta.appliedChangesets);
    const result: ImportPublicationResult = { replayed: 0, conflicts: 0, droppedAsPublished: 0 };
    let cursor = await tx.objectStore("outbox").openCursor();
    while (cursor) {
      const op = cursor.value;
      if (op.exportedIn !== null && applied.has(op.exportedIn)) {
        await cursor.delete();
        result.droppedAsPublished++;
      } else if (op.record) {
        const store = tx.objectStore(op.entity);
        const current = (await store.get(op.recordId)) as { rev: number } | undefined;
        const fits = op.op === "create" ? current === undefined : current !== undefined && current.rev === op.baseRev;
        if (fits) {
          await store.put(op.record as never);
          result.replayed++;
          if (op.conflict) await cursor.update({ ...op, conflict: false });
        } else {
          result.conflicts++;
          await cursor.update({ ...op, conflict: true });
        }
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    return result;
  } catch (cause) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    if (cause instanceof AppError) throw cause;
    throw new AppError("STORAGE_FAILURE", "Could not store the publication; nothing was changed", { cause });
  }
}

/** @deprecated Step 01 API, kept for callers: imports a publication without its files. */
export async function replaceOfficialData(db: LocalDb, dataSet: OfficialDataSet, options: { allowRestore?: boolean; now?: () => Date } = {}): Promise<void> {
  await importPublication(db, dataSet, {}, options);
}

/* ------------------------------------------------------------------------------ */
/* Local integrity checks                                                           */
/* ------------------------------------------------------------------------------ */

export interface LocalIntegrityReport {
  ok: boolean;
  problems: string[];
}

/** Rebuilds an OfficialDataSet view of the working stores (for whole-set validation). */
export async function readWorkingDataSet(db: LocalDb): Promise<OfficialDataSet> {
  const tx = db.transaction([...ENTITY_STORES, "settings", "publications"], "readonly");
  const all = Object.fromEntries(await Promise.all(ENTITY_STORES.map(async (n) => [n, await tx.objectStore(n).getAll()] as const))) as Record<EntityName, unknown[]>;
  const { accounts, cards, categories, bills, recurrences, budgets, transactions } = all;
  const settings = (await tx.objectStore("settings").get("financial"))?.settings;
  const latest = (await tx.objectStore("publications").openCursor(null, "prev"))?.value;
  await tx.done;
  const byYear: Record<string, Budget[]> = {};
  for (const b of budgets as Budget[]) (byYear[`budgets/${b.startDate.slice(0, 4)}.json`] ??= []).push(b);
  const byMonth: Record<string, Transaction[]> = {};
  for (const t of transactions as Transaction[]) (byMonth[`transactions/${t.date.slice(0, 4)}/${t.date.slice(0, 7)}.json`] ??= []).push(t);
  return {
    meta: latest?.meta ?? { schema: "pfm.meta", schemaVersion: "2.0.0", dataRevision: 0, updatedAt: toIsoWithOffset(new Date()), appliedChangesets: [], checksums: {} },
    settings: settings ?? (await import("@/domain/settings")).DEFAULT_FINANCIAL_SETTINGS,
    accounts: accounts as Account[],
    cards: cards as Card[],
    categories: categories as Category[],
    bills: bills as Bill[],
    recurrences: recurrences as Recurrence[],
    budgets: byYear,
    transactions: byMonth,
  };
}

/**
 * Checks what is on this device: every working record matches its schema; references,
 * currencies, category tree and ids are consistent (same rules as data/ validation, minus
 * the publication checksums); the outbox is valid and its sequence only goes up.
 * Problems name stores, ids and rules only — never amounts or descriptions.
 */
export async function checkLocalIntegrity(db: LocalDb): Promise<LocalIntegrityReport> {
  const problems: string[] = [];
  for (const name of ENTITY_STORES) {
    for (const record of await db.getAll(name)) {
      if (!ENTITY_SCHEMAS[name].safeParse(record).success) problems.push(`${name}: record ${String((record as { id?: unknown }).id)} does not match the schema`);
    }
  }
  if (problems.length === 0) {
    for (const i of validateIntegrity(await readWorkingDataSet(db))) {
      if (i.severity === "error" && !i.message.startsWith("I-10")) problems.push(`${i.file}: ${i.recordId ?? ""} ${i.message}`.replace(/\s+/g, " "));
    }
  }
  let previous = 0;
  for (const op of await db.getAll("outbox")) {
    if (!localOperationSchema.safeParse(op).success) problems.push(`outbox: entry ${String(op.seq)} is invalid`);
    if ((op.seq ?? 0) <= previous) problems.push(`outbox: sequence is not increasing at ${String(op.seq)}`);
    previous = op.seq ?? previous;
  }
  return { ok: problems.length === 0, problems };
}
