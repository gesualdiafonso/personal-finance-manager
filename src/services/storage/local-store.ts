import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { z } from "zod";
import { DATA_COMPATIBILITY } from "@/lib/config/app";
import { AppError } from "@/lib/errors/app-error";
import { toIsoWithOffset } from "@/lib/formatting/date";
import {
  accountSchema,
  billSchema,
  budgetSchema,
  cardSchema,
  categorySchema,
  isoDateTime,
  metaSchema,
  recurrenceSchema,
  transactionSchema,
  uuid,
  type Account,
  type Bill,
  type Budget,
  type Card,
  type Category,
  type Meta,
  type Recurrence,
  type Transaction,
} from "@/lib/validation/schemas";
import { assertRevisionNotOlder } from "@/lib/validation/compatibility";
import type { OfficialDataSet } from "@/services/data/dataset";

/**
 * Local persistence in the browser's IndexedDB (decision D1). IndexedDB is a storage API of
 * the browser on this device — not a database service, server or ORM.
 *
 * Separation (Step 01, Task 04):
 * - Official stores hold exactly the last validated publication. They are only ever
 *   replaced as a whole, in one transaction.
 * - `outbox` holds local operations not yet exported. Local changes never write into the
 *   official stores; the merged view is built on read (Step 02+).
 *
 * Open decision OD-3 (at-rest encryption) is not implemented: records are stored as plain
 * structured data on the device.
 */
export const LOCAL_DB_NAME = "pfm-local";
export const LOCAL_DB_VERSION = 1;

export const OFFICIAL_STORES = ["accounts", "categories", "cards", "bills", "recurrences", "budgets", "transactions"] as const;
export type OfficialStoreName = (typeof OFFICIAL_STORES)[number];

export const localOperationSchema = z.object({
  seq: z.number().int().min(1).optional(),
  operationId: uuid,
  op: z.enum(["create", "update", "delete"]),
  entity: z.enum(OFFICIAL_STORES),
  recordId: uuid,
  /** rev of the record when the change was made; null for create. */
  baseRev: z.number().int().min(1).nullable(),
  /** Full new state of the record; null for delete. */
  record: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoDateTime,
  /** changesetId of the export that contained it, or null while pending. */
  exportedIn: uuid.nullable(),
});
export type LocalOperation = z.infer<typeof localOperationSchema>;

export interface PublicationRecord {
  dataRevision: number;
  schemaVersion: string;
  importedAt: string;
  meta: Meta;
}

interface DeviceRecord {
  key: "device";
  deviceId: string;
  createdAt: string;
}

interface PfmLocalSchema extends DBSchema {
  accounts: { key: string; value: Account };
  categories: { key: string; value: Category };
  cards: { key: string; value: Card };
  bills: { key: string; value: Bill; indexes: { dueDate: string } };
  recurrences: { key: string; value: Recurrence };
  budgets: { key: string; value: Budget; indexes: { period: string; categoryId: string } };
  transactions: {
    key: string;
    value: Transaction;
    indexes: { date: string; accountId: string; categoryId: string; status: string; cardId: string };
  };
  outbox: { key: number; value: LocalOperation; indexes: { recordId: string; exportedIn: string } };
  publications: { key: number; value: PublicationRecord };
  device: { key: string; value: DeviceRecord };
}

export type LocalDb = IDBPDatabase<PfmLocalSchema>;

/** Opens (and creates or upgrades) the local store in this browser's IndexedDB. */
export async function openLocalStore(): Promise<LocalDb> {
  if (typeof indexedDB === "undefined") throw new AppError("STORAGE_UNAVAILABLE", "IndexedDB is not available in this environment");
  try {
    return await openDB<PfmLocalSchema>(LOCAL_DB_NAME, LOCAL_DB_VERSION, {
      upgrade(db, oldVersion) {
        // Version 1: initial layout. Later versions add `if (oldVersion < N)` steps and must
        // never drop the outbox (unexported changes).
        if (oldVersion < 1) {
          db.createObjectStore("accounts", { keyPath: "id" });
          db.createObjectStore("categories", { keyPath: "id" });
          db.createObjectStore("cards", { keyPath: "id" });
          const bills = db.createObjectStore("bills", { keyPath: "id" });
          bills.createIndex("dueDate", "dueDate");
          db.createObjectStore("recurrences", { keyPath: "id" });
          const budgets = db.createObjectStore("budgets", { keyPath: "id" });
          budgets.createIndex("period", "period");
          budgets.createIndex("categoryId", "categoryId");
          const tx = db.createObjectStore("transactions", { keyPath: "id" });
          tx.createIndex("date", "date");
          tx.createIndex("accountId", "accountId");
          tx.createIndex("categoryId", "categoryId");
          tx.createIndex("status", "status");
          tx.createIndex("cardId", "cardId");
          const outbox = db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
          outbox.createIndex("recordId", "recordId");
          outbox.createIndex("exportedIn", "exportedIn");
          db.createObjectStore("publications", { keyPath: "dataRevision" });
          db.createObjectStore("device", { keyPath: "key" });
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

/** Stable per-device id, created on first use (used as deviceId in records and exports). */
export async function ensureDeviceId(db: LocalDb, now: () => Date = () => new Date()): Promise<string> {
  const existing = await db.get("device", "device");
  if (existing) return existing.deviceId;
  const record: DeviceRecord = { key: "device", deviceId: globalThis.crypto.randomUUID(), createdAt: toIsoWithOffset(now()) };
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
  officialCounts: Record<OfficialStoreName, number>;
}

export async function getLocalStoreStatus(db: LocalDb): Promise<LocalStoreStatus> {
  const deviceId = await ensureDeviceId(db);
  const cursor = await db.transaction("publications").store.openCursor(null, "prev");
  const latest = cursor?.value ?? null;
  const pending = await countPendingOperations(db);
  const officialCounts = Object.fromEntries(
    await Promise.all(OFFICIAL_STORES.map(async (name) => [name, await db.count(name)] as const)),
  ) as Record<OfficialStoreName, number>;
  return {
    version: db.version,
    deviceId,
    latestPublication: latest ? { dataRevision: latest.dataRevision, schemaVersion: latest.schemaVersion, importedAt: latest.importedAt } : null,
    pendingOperations: pending,
    officialCounts,
  };
}

export async function getLatestRevision(db: LocalDb): Promise<number | null> {
  const cursor = await db.transaction("publications").store.openCursor(null, "prev");
  return cursor?.value.dataRevision ?? null;
}

/**
 * Replaces all official stores with a validated data set, in ONE transaction: either the
 * whole publication is stored, or nothing changes. The outbox is never touched.
 */
export async function replaceOfficialData(
  db: LocalDb,
  dataSet: OfficialDataSet,
  options: { allowRestore?: boolean; now?: () => Date } = {},
): Promise<void> {
  assertRevisionNotOlder(dataSet.meta.dataRevision, await getLatestRevision(db), { allowRestore: options.allowRestore });
  const tx = db.transaction([...OFFICIAL_STORES, "publications"], "readwrite");
  try {
    await Promise.all(OFFICIAL_STORES.map((name) => tx.objectStore(name).clear()));
    const writes: Promise<unknown>[] = [];
    for (const r of dataSet.accounts) writes.push(tx.objectStore("accounts").put(r));
    for (const r of dataSet.categories) writes.push(tx.objectStore("categories").put(r));
    for (const r of dataSet.cards) writes.push(tx.objectStore("cards").put(r));
    for (const r of dataSet.bills) writes.push(tx.objectStore("bills").put(r));
    for (const r of dataSet.recurrences) writes.push(tx.objectStore("recurrences").put(r));
    for (const r of Object.values(dataSet.budgets).flat()) writes.push(tx.objectStore("budgets").put(r));
    for (const r of Object.values(dataSet.transactions).flat()) writes.push(tx.objectStore("transactions").put(r));
    writes.push(
      tx.objectStore("publications").put({
        dataRevision: dataSet.meta.dataRevision,
        schemaVersion: dataSet.meta.schemaVersion,
        importedAt: toIsoWithOffset((options.now ?? (() => new Date()))()),
        meta: dataSet.meta,
      }),
    );
    await Promise.all(writes);
    await tx.done;
  } catch (cause) {
    tx.abort();
    throw new AppError("STORAGE_FAILURE", "Could not store the publication; nothing was changed", { cause });
  }
}

/** Appends a local change to the outbox. Validated before writing. Returns its seq. */
export async function appendLocalOperation(db: LocalDb, operation: Omit<LocalOperation, "seq">): Promise<number> {
  const parsed = localOperationSchema.omit({ seq: true }).safeParse(operation);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid local operation");
  try {
    return await db.add("outbox", parsed.data as LocalOperation);
  } catch (cause) {
    throw new AppError("STORAGE_FAILURE", "Could not save the local change", { cause });
  }
}

export async function countPendingOperations(db: LocalDb): Promise<number> {
  let n = 0;
  let cursor = await db.transaction("outbox").store.openCursor();
  while (cursor) {
    if (cursor.value.exportedIn === null) n++;
    cursor = await cursor.continue();
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Backup export / import foundation                                    */
/* ------------------------------------------------------------------ */

export const BACKUP_SCHEMA = "pfm.backup";

const backupSchema = z.object({
  schema: z.literal(BACKUP_SCHEMA),
  schemaVersion: z.string(),
  exportedAt: isoDateTime,
  deviceId: z.string().min(1),
  localStoreVersion: z.number().int().min(1),
  publication: z.object({ dataRevision: z.number().int().min(0), schemaVersion: z.string(), meta: metaSchema }).nullable(),
  official: z.object({
    accounts: z.array(accountSchema),
    categories: z.array(categorySchema),
    cards: z.array(cardSchema),
    bills: z.array(billSchema),
    recurrences: z.array(recurrenceSchema),
    budgets: z.array(budgetSchema),
    transactions: z.array(transactionSchema),
  }),
  outbox: z.array(localOperationSchema),
});
export type LocalBackup = z.infer<typeof backupSchema>;

/**
 * Builds the backup structure (all official stores + outbox). It is an in-memory object:
 * Step 01 adds no download UI. Encrypting exports before they leave the device is open
 * decision OD-5 and must be settled before any export reaches the interface.
 */
export async function buildBackup(db: LocalDb, now: () => Date = () => new Date()): Promise<LocalBackup> {
  const tx = db.transaction([...OFFICIAL_STORES, "outbox", "publications"], "readonly");
  const [accounts, categories, cards, bills, recurrences, budgets, transactions, outbox] = await Promise.all([
    tx.objectStore("accounts").getAll(),
    tx.objectStore("categories").getAll(),
    tx.objectStore("cards").getAll(),
    tx.objectStore("bills").getAll(),
    tx.objectStore("recurrences").getAll(),
    tx.objectStore("budgets").getAll(),
    tx.objectStore("transactions").getAll(),
    tx.objectStore("outbox").getAll(),
  ]);
  const cursor = await tx.objectStore("publications").openCursor(null, "prev");
  const latest = cursor?.value ?? null;
  await tx.done;
  return backupSchema.parse({
    schema: BACKUP_SCHEMA,
    schemaVersion: DATA_COMPATIBILITY.current,
    exportedAt: toIsoWithOffset(now()),
    deviceId: await ensureDeviceId(db, now),
    localStoreVersion: db.version,
    publication: latest ? { dataRevision: latest.dataRevision, schemaVersion: latest.schemaVersion, meta: latest.meta } : null,
    official: { accounts, categories, cards, bills, recurrences, budgets, transactions },
    outbox,
  });
}

/** Validates a backup and restores it, replacing official stores AND the outbox in one transaction. */
export async function restoreBackup(db: LocalDb, input: unknown, now: () => Date = () => new Date()): Promise<void> {
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "The backup file is not valid");
  const backup = parsed.data;
  const tx = db.transaction([...OFFICIAL_STORES, "outbox", "publications"], "readwrite");
  try {
    await Promise.all([...OFFICIAL_STORES, "outbox", "publications"].map((n) => tx.objectStore(n as OfficialStoreName).clear()));
    const writes: Promise<unknown>[] = [];
    for (const name of OFFICIAL_STORES) {
      for (const r of backup.official[name]) writes.push(tx.objectStore(name).put(r as never));
    }
    for (const op of backup.outbox) writes.push(tx.objectStore("outbox").put(op));
    if (backup.publication) {
      writes.push(
        tx.objectStore("publications").put({
          dataRevision: backup.publication.dataRevision,
          schemaVersion: backup.publication.schemaVersion,
          importedAt: toIsoWithOffset(now()),
          meta: backup.publication.meta,
        }),
      );
    }
    await Promise.all(writes);
    await tx.done;
  } catch (cause) {
    tx.abort();
    throw new AppError("STORAGE_FAILURE", "Could not restore the backup; nothing was changed", { cause });
  }
}

/* ------------------------------------------------------------------ */
/* Local integrity checks                                               */
/* ------------------------------------------------------------------ */

export interface LocalIntegrityReport {
  ok: boolean;
  problems: string[];
}

const STORE_SCHEMAS: Record<OfficialStoreName, z.ZodType> = {
  accounts: accountSchema,
  categories: categorySchema,
  cards: cardSchema,
  bills: billSchema,
  recurrences: recurrenceSchema,
  budgets: budgetSchema,
  transactions: transactionSchema,
};

/**
 * Checks what is on this device: every official record still matches its schema, ids are
 * unique across stores, outbox entries are valid and their sequence only goes up.
 * Problems name stores and ids only, never amounts or descriptions.
 */
export async function checkLocalIntegrity(db: LocalDb): Promise<LocalIntegrityReport> {
  const problems: string[] = [];
  const ids = new Map<string, OfficialStoreName>();
  for (const name of OFFICIAL_STORES) {
    for (const record of await db.getAll(name)) {
      const r = STORE_SCHEMAS[name].safeParse(record);
      const id = (record as { id?: unknown }).id;
      if (!r.success) problems.push(`${name}: record ${String(id)} does not match the schema`);
      if (typeof id === "string") {
        const other = ids.get(id);
        if (other) problems.push(`${name}: id ${id} also exists in ${other}`);
        else ids.set(id, name);
      }
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
