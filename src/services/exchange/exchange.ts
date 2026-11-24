import { z } from "zod";
import { uuidv7 } from "@/domain/ids";
import { ENTITY_NAMES, ENTITY_SCHEMAS, financialSettingsSchema, metaSchema, isoDateTime, SCHEMA_VERSION, semver, uuid, type EntityName, type FinancialSettings } from "@/domain/schemas";
import { AppError } from "@/lib/errors/app-error";
import { toIsoWithOffset } from "@/lib/formatting/date";
import { classifySchemaVersion } from "@/lib/validation/compatibility";
import { canonicalJson, sha256Hex } from "@/services/crypto/bundle";
import { hasErrors, parseDataFiles, validateIntegrity, type DataFileMap, type OfficialDataSet, type ValidationIssue } from "@/services/data/dataset";
import {
  ENTITY_STORES,
  ensureDeviceId,
  getFinancialSettings,
  getLatestRevision,
  localOperationSchema,
  readWorkingDataSet,
  type LocalDb,
  type LocalOperation,
} from "@/services/storage/local-store";

/**
 * Import / export (docs/architecture/data-import-export.md).
 *
 * SECURITY (D2-07): every format here is PLAINTEXT JSON. It exists so the owner can review
 * and integrate changes; Step 02 offers no download button. Encrypted exports belong to the
 * Phase 07 design (data-security.md) and need explicit approval before implementation.
 *
 * Integrity: each payload carries the SHA-256 of its canonical JSON (without the integrity
 * block) and record counts. This detects accidental corruption and truncation — it is NOT
 * authentication: anyone who edits the file can recompute the hash.
 */
export const EXPORT_FORMAT = "pfm.export";
export const CHANGESET_FORMAT = "pfm.changeset";
export const EXCHANGE_FORMAT_VERSION = 1;

const integritySchema = z.strictObject({
  algorithm: z.literal("SHA-256"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  counts: z.record(z.string(), z.number().int().min(0)),
});

const recordsSchema = z.partialRecord(z.enum(ENTITY_NAMES as [EntityName, ...EntityName[]]), z.array(z.unknown()));

export const exportFileSchema = z.strictObject({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(EXCHANGE_FORMAT_VERSION),
  schemaVersion: semver,
  /** "full": every entity and the settings (a backup); "selected": the entities listed. */
  scope: z.enum(["full", "selected"]),
  exportedAt: isoDateTime,
  deviceId: z.string().min(1).max(64),
  basedOnRevision: z.number().int().min(0).nullable(),
  settings: financialSettingsSchema.nullable(),
  records: recordsSchema,
  /** Full exports carry the pending outbox so a restore keeps unexported changes. */
  outbox: z.array(localOperationSchema).optional(),
  /** Full exports carry the meta of the last imported publication (revision tracking). */
  publication: metaSchema.nullable().optional(),
  integrity: integritySchema,
});
export type ExportFile = z.infer<typeof exportFileSchema>;

export const changesetFileSchema = z.strictObject({
  format: z.literal(CHANGESET_FORMAT),
  formatVersion: z.literal(EXCHANGE_FORMAT_VERSION),
  changesetId: uuid,
  schemaVersion: semver,
  basedOnRevision: z.number().int().min(0).nullable(),
  deviceId: z.string().min(1).max(64),
  createdAt: isoDateTime,
  operations: z.array(localOperationSchema).min(1),
  integrity: integritySchema,
});
export type ChangesetFile = z.infer<typeof changesetFileSchema>;

/* ------------------------------------------------------------------------------ */
/* Integrity                                                                       */
/* ------------------------------------------------------------------------------ */

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const rest = { ...payload };
  delete rest.integrity;
  return sha256Hex(new TextEncoder().encode(canonicalJson(rest)));
}

function countsOf(records: Partial<Record<EntityName, unknown[]>>, extra: Record<string, number> = {}): Record<string, number> {
  return { ...Object.fromEntries(Object.entries(records).map(([k, v]) => [k, v?.length ?? 0])), ...extra };
}

/** Checks format, hash and counts. Throws IMPORT_REJECTED (never returns partial data). */
export async function verifyExchangeFile(input: unknown): Promise<{ kind: "export"; file: ExportFile } | { kind: "changeset"; file: ChangesetFile }> {
  const format = (input as { format?: unknown } | null)?.format;
  const schema = format === EXPORT_FORMAT ? exportFileSchema : format === CHANGESET_FORMAT ? changesetFileSchema : null;
  if (!schema) throw new AppError("IMPORT_REJECTED", "Unknown file format");
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("IMPORT_REJECTED", "File does not match its format", { details: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`) });
  }
  const file = parsed.data as ExportFile | ChangesetFile;
  if ((await hashPayload(input as Record<string, unknown>)) !== file.integrity.sha256) {
    throw new AppError("INTEGRITY_FAILED", "File content does not match its SHA-256: it was altered or truncated");
  }
  const counts = "records" in file ? countsOf(file.records, file.outbox ? { outbox: file.outbox.length } : {}) : { operations: file.operations.length };
  for (const [k, n] of Object.entries(counts)) {
    if (file.integrity.counts[k] !== n) throw new AppError("INTEGRITY_FAILED", `Record count for ${k} does not match the file's integrity block`);
  }
  const kind = classifySchemaVersion(file.schemaVersion);
  if (kind !== "current") {
    throw new AppError("INCOMPATIBLE_SCHEMA_VERSION", kind === "needs-migration" ? `File is schema ${file.schemaVersion}: migrate it first` : `File is schema ${file.schemaVersion}, newer than this application: update the application`);
  }
  return "records" in file ? { kind: "export", file } : { kind: "changeset", file: file as ChangesetFile };
}

/* ------------------------------------------------------------------------------ */
/* Export                                                                          */
/* ------------------------------------------------------------------------------ */

export interface ExportOptions {
  /** Omit for a full export (backup). */
  entities?: EntityName[];
  /** Include tombstones (default true, so deletions travel too). */
  includeDeleted?: boolean;
  now?: () => Date;
}

export async function exportData(db: LocalDb, options: ExportOptions = {}): Promise<ExportFile> {
  const now = options.now ?? (() => new Date());
  const full = !options.entities;
  const entities = options.entities ?? ENTITY_STORES;
  const records: Partial<Record<EntityName, unknown[]>> = {};
  for (const n of entities) {
    const all = (await db.getAll(n)) as { deletedAt: string | null }[];
    records[n] = options.includeDeleted === false ? all.filter((r) => r.deletedAt === null) : all;
  }
  const outbox = full ? (await db.getAll("outbox")).filter((o) => o.exportedIn === null) : undefined;
  const payload: Omit<ExportFile, "integrity"> = {
    format: EXPORT_FORMAT,
    formatVersion: EXCHANGE_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    scope: full ? "full" : "selected",
    exportedAt: toIsoWithOffset(now()),
    deviceId: await ensureDeviceId(db, now),
    basedOnRevision: await getLatestRevision(db),
    settings: full ? await getFinancialSettings(db) : null,
    records,
    ...(outbox ? { outbox, publication: (await db.transaction("publications").store.openCursor(null, "prev"))?.value.meta ?? null } : {}),
  };
  const integrity = { algorithm: "SHA-256" as const, sha256: await hashPayload(payload), counts: countsOf(records, outbox ? { outbox: outbox.length } : {}) };
  return { ...payload, integrity };
}

/** Step 01 name for a full export (backup including pending changes). */
export const buildBackup = (db: LocalDb, now?: () => Date) => exportData(db, { now });

/**
 * Exports pending local changes as a changeset for the owner to review and integrate into
 * data/ by hand (D2-08). The operations are marked with the changesetId in one transaction;
 * conflicted operations are left out. Returns null when there is nothing to export.
 */
export async function exportChangeset(db: LocalDb, options: { now?: () => Date } = {}): Promise<ChangesetFile | null> {
  const now = options.now ?? (() => new Date());
  const pending = (await db.getAll("outbox")).filter((o) => o.exportedIn === null && !o.conflict);
  if (pending.length === 0) return null;
  const changesetId = uuidv7(now().getTime());
  const payload: Omit<ChangesetFile, "integrity"> = {
    format: CHANGESET_FORMAT,
    formatVersion: EXCHANGE_FORMAT_VERSION,
    changesetId,
    schemaVersion: SCHEMA_VERSION,
    basedOnRevision: await getLatestRevision(db),
    deviceId: await ensureDeviceId(db, now),
    createdAt: toIsoWithOffset(now()),
    operations: pending.map((o) => ({ ...o, exportedIn: null })),
  };
  const changeset: ChangesetFile = { ...payload, integrity: { algorithm: "SHA-256", sha256: await hashPayload(payload), counts: { operations: pending.length } } };
  const tx = db.transaction("outbox", "readwrite");
  for (const op of pending) {
    const current = await tx.store.get(op.seq!);
    if (!current || current.exportedIn !== null) {
      tx.abort();
      throw new AppError("CONFLICT", "The outbox changed while exporting; try again");
    }
    await tx.store.put({ ...current, exportedIn: changesetId });
  }
  await tx.done;
  return changeset;
}

/** Undo marking: use when an exported changeset was discarded and never integrated. */
export async function unmarkChangeset(db: LocalDb, changesetId: string): Promise<number> {
  const tx = db.transaction("outbox", "readwrite");
  let n = 0;
  for (const op of await tx.store.index("exportedIn").getAll(changesetId)) {
    await tx.store.put({ ...op, exportedIn: null });
    n++;
  }
  await tx.done;
  return n;
}

/* ------------------------------------------------------------------------------ */
/* Import: preview, apply (merge | replace), rollback                               */
/* ------------------------------------------------------------------------------ */

export type ImportMode = "merge" | "replace";
type RecordState = "new" | "identical" | "update" | "older" | "conflict";

export interface ImportPreview {
  mode: ImportMode;
  scope: ExportFile["scope"];
  schemaVersion: string;
  counts: Record<EntityName, Record<RecordState, number>>;
  /** Ids only, never content. */
  conflicts: { entity: EntityName; id: string; reason: string }[];
  issues: ValidationIssue[];
  settingsChange: boolean;
  pendingLocalChanges: number;
  canApply: boolean;
}

type Rec = Record<string, unknown> & { id: string; rev: number; deletedAt: string | null };

function emptyCounts(): Record<EntityName, Record<RecordState, number>> {
  return Object.fromEntries(ENTITY_STORES.map((n) => [n, { new: 0, identical: 0, update: 0, older: 0, conflict: 0 }])) as Record<EntityName, Record<RecordState, number>>;
}

async function plan(db: LocalDb, file: ExportFile, mode: ImportMode) {
  if (mode === "replace" && file.scope !== "full") throw new AppError("IMPORT_REJECTED", "Replace needs a full export");
  const issues: ValidationIssue[] = [];
  const incoming: Partial<Record<EntityName, Rec[]>> = {};
  for (const [entity, rows] of Object.entries(file.records) as [EntityName, unknown[]][]) {
    incoming[entity] = [];
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const r = ENTITY_SCHEMAS[entity].safeParse(row);
      if (!r.success) {
        issues.push({ layer: "structure", severity: "error", file: entity, message: `record #${index + 1}: ${r.error.issues[0]?.path.join(".")}: ${r.error.issues[0]?.message}` });
        return;
      }
      const rec = r.data as unknown as Rec;
      if (seen.has(rec.id)) issues.push({ layer: "uniqueness", severity: "error", file: entity, recordId: rec.id, message: "Duplicate id in the file" });
      seen.add(rec.id);
      incoming[entity]!.push(rec);
    });
  }
  const outbox = await db.getAll("outbox");
  const pendingIds = new Set(outbox.filter((o) => o.exportedIn === null).map((o) => o.recordId));
  const counts = emptyCounts();
  const conflicts: ImportPreview["conflicts"] = [];
  const writes: { entity: EntityName; record: Rec; base: Rec | null }[] = [];
  for (const entity of ENTITY_STORES) {
    for (const rec of incoming[entity] ?? []) {
      const local = (await db.get(entity, rec.id)) as Rec | undefined;
      let state: RecordState;
      if (!local) state = "new";
      else if (canonicalJson(local) === canonicalJson(rec)) state = "identical";
      else if (mode === "replace") state = "update";
      else if (rec.rev > local.rev && !pendingIds.has(rec.id)) state = "update";
      else if (rec.rev < local.rev) state = "older";
      else state = "conflict";
      counts[entity][state]++;
      if (state === "conflict") conflicts.push({ entity, id: rec.id, reason: pendingIds.has(rec.id) ? "changed locally and not exported yet" : "same or newer revision with different content" });
      if (state === "new" || state === "update") writes.push({ entity, record: rec, base: local ?? null });
    }
  }
  // Whole-set validation of the result: references, currencies, category tree, duplicates.
  const working = await readWorkingDataSet(db);
  const result = mode === "replace" ? emptyWorking(working) : working;
  const byId = new Map<string, Rec>();
  for (const entity of ENTITY_STORES) for (const r of collect(result, entity)) byId.set(`${entity}:${r.id}`, r);
  for (const w of writes) byId.set(`${w.entity}:${w.record.id}`, w.record);
  if (mode === "replace") for (const entity of ENTITY_STORES) for (const r of incoming[entity] ?? []) byId.set(`${entity}:${r.id}`, r);
  const merged = rebuild(result, byId, mode === "replace" && file.settings ? file.settings : result.settings);
  issues.push(...validateIntegrity(merged).filter((i) => !i.message.startsWith("I-10")));
  const pendingLocalChanges = outbox.filter((o) => o.exportedIn === null).length;
  const settingsChange = mode === "replace" && file.settings !== null && canonicalJson(file.settings) !== canonicalJson(working.settings);
  const preview: ImportPreview = {
    mode,
    scope: file.scope,
    schemaVersion: file.schemaVersion,
    counts,
    conflicts,
    issues,
    settingsChange,
    pendingLocalChanges,
    canApply: !hasErrors(issues) && (mode === "replace" || conflicts.length === 0),
  };
  return { preview, writes, incoming };
}

function collect(ds: OfficialDataSet, entity: EntityName): Rec[] {
  const v = ds[entity] as unknown;
  return (Array.isArray(v) ? v : Object.values(v as Record<string, unknown[]>).flat()) as Rec[];
}
function emptyWorking(ds: OfficialDataSet): OfficialDataSet {
  return { ...ds, accounts: [], cards: [], categories: [], bills: [], recurrences: [], budgets: {}, transactions: {}, goals: [], goalContributions: [] };
}
function rebuild(base: OfficialDataSet, byId: Map<string, Rec>, settings: FinancialSettings): OfficialDataSet {
  const of = (e: EntityName) => [...byId.entries()].filter(([k]) => k.startsWith(`${e}:`)).map(([, r]) => r);
  const budgets: Record<string, unknown[]> = {};
  for (const b of of("budgets")) (budgets[`budgets/${String(b.startDate).slice(0, 4)}.json`] ??= []).push(b);
  const transactions: Record<string, unknown[]> = {};
  for (const t of of("transactions")) (transactions[`transactions/${String(t.date).slice(0, 4)}/${String(t.date).slice(0, 7)}.json`] ??= []).push(t);
  return {
    ...base,
    settings,
    accounts: of("accounts"),
    cards: of("cards"),
    categories: of("categories"),
    bills: of("bills"),
    recurrences: of("recurrences"),
    budgets,
    transactions,
    goals: of("goals"),
    goalContributions: of("goalContributions"),
  } as unknown as OfficialDataSet;
}

/** Validates an import and describes what it would do. Never writes. */
export async function previewImport(db: LocalDb, input: unknown, mode: ImportMode = "merge"): Promise<ImportPreview> {
  const verified = await verifyExchangeFile(input);
  if (verified.kind !== "export") throw new AppError("IMPORT_REJECTED", "Changesets are integrated into data/ by the owner, not imported here (D2-08)");
  return (await plan(db, verified.file, mode)).preview;
}

export const REPLACE_CONFIRMATION = "REEMPLAZAR-DATOS-LOCALES";

export interface ApplyImportOptions {
  mode?: ImportMode;
  /** Required for replace: the literal REPLACE_CONFIRMATION. */
  confirmation?: string;
  /** Replace refuses while unexported local changes exist, unless the file is a full backup or this is set. */
  discardPendingChanges?: boolean;
  now?: () => Date;
}

/**
 * Applies a verified export in ONE IndexedDB transaction, after saving a rollback point in
 * the same transaction. Merge rejects the whole file on any conflict or validation error;
 * replace swaps the working stores (and, for a full backup, restores its pending outbox).
 * Every written record also becomes an outbox operation, so it appears in the next changeset.
 */
export async function applyImport(db: LocalDb, input: unknown, options: ApplyImportOptions = {}): Promise<ImportPreview> {
  const mode = options.mode ?? "merge";
  const now = options.now ?? (() => new Date());
  const verified = await verifyExchangeFile(input);
  if (verified.kind !== "export") throw new AppError("IMPORT_REJECTED", "Changesets are integrated into data/ by the owner, not imported here (D2-08)");
  const file = verified.file;
  if (mode === "replace" && options.confirmation !== REPLACE_CONFIRMATION) throw new AppError("PROTECTED_OPERATION", "Replacing local data needs explicit confirmation");
  const { preview, writes, incoming } = await plan(db, file, mode);
  if (!preview.canApply) {
    throw new AppError("IMPORT_REJECTED", `Import rejected: ${preview.conflicts.length} conflict(s), ${preview.issues.filter((i) => i.severity === "error").length} error(s); nothing was changed`, {
      details: [...preview.conflicts.map((c) => `${c.entity} ${c.id}: ${c.reason}`), ...preview.issues.filter((i) => i.severity === "error").map((i) => `[${i.layer}] ${i.file}: ${i.message}`)].slice(0, 30),
    });
  }
  if (mode === "replace" && preview.pendingLocalChanges > 0 && !file.outbox && !options.discardPendingChanges) {
    throw new AppError("PROTECTED_OPERATION", `${preview.pendingLocalChanges} local change(s) have not been exported; export them or confirm discarding them`);
  }
  const deviceId = await ensureDeviceId(db, now);
  const stamp = toIsoWithOffset(now());
  const stores = [...ENTITY_STORES, "outbox", "settings", "rollback", "publications"] as const;
  const tx = db.transaction([...stores], "readwrite");
  try {
    // 1. Rollback point (same transaction: it exists if and only if the import is applied).
    const saved: Record<string, unknown[]> = {};
    for (const n of ENTITY_STORES) saved[n] = await tx.objectStore(n).getAll();
    const savedOutbox = await tx.objectStore("outbox").getAll();
    const savedSettings = (await tx.objectStore("settings").get("financial"))?.settings ?? null;
    await tx.objectStore("rollback").put({ key: "last", createdAt: stamp, reason: `import ${mode} (${file.scope})`, stores: saved, outbox: savedOutbox, settings: savedSettings });

    const op = (entity: EntityName, record: Rec, base: Rec | null): LocalOperation => ({
      operationId: uuidv7(now().getTime()),
      op: base ? (record.deletedAt !== null && base.deletedAt === null ? "delete" : "update") : "create",
      entity,
      recordId: record.id,
      baseRev: base?.rev ?? null,
      record,
      createdAt: stamp,
      exportedIn: null,
    });

    if (mode === "merge") {
      for (const w of writes) {
        const current = (await tx.objectStore(w.entity).get(w.record.id)) as Rec | undefined;
        if ((current?.rev ?? null) !== (w.base?.rev ?? null)) throw new AppError("CONFLICT", "Local data changed during the import; nothing was changed");
        await tx.objectStore(w.entity).put(w.record as never);
        await tx.objectStore("outbox").add(op(w.entity, w.record, w.base));
      }
    } else {
      for (const n of ENTITY_STORES) await tx.objectStore(n).clear();
      for (const n of ENTITY_STORES) for (const r of incoming[n] ?? []) await tx.objectStore(n).put(r as never);
      await tx.objectStore("outbox").clear();
      // Re-numbered by this store's sequence: drop the exporting device's seq.
      if (file.outbox) {
        for (const o of file.outbox) {
          const copy = { ...o };
          delete copy.seq;
          await tx.objectStore("outbox").add(copy);
        }
      }
      else for (const w of writes) await tx.objectStore("outbox").add(op(w.entity, w.record, w.base));
      if (file.settings) await tx.objectStore("settings").put({ key: "financial", settings: file.settings });
      if (file.publication && !(await tx.objectStore("publications").get(file.publication.dataRevision))) {
        await tx.objectStore("publications").put({ dataRevision: file.publication.dataRevision, schemaVersion: file.publication.schemaVersion, importedAt: stamp, meta: file.publication });
      }
    }
    void deviceId;
    await tx.done;
    return preview;
  } catch (cause) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await tx.done.catch(() => undefined);
    if (cause instanceof AppError) throw cause;
    throw new AppError("STORAGE_FAILURE", "Import could not be saved; nothing was changed", { cause });
  }
}

/** Step 01 name: restores a full backup (replace + its outbox). */
export const restoreBackup = (db: LocalDb, input: unknown, now?: () => Date) =>
  applyImport(db, input, { mode: "replace", confirmation: REPLACE_CONFIRMATION, now });

/** Restores the state saved right before the last applied import, in one transaction. */
export async function rollbackLastImport(db: LocalDb): Promise<{ createdAt: string; reason: string }> {
  const tx = db.transaction([...ENTITY_STORES, "outbox", "settings", "rollback"], "readwrite");
  const point = await tx.objectStore("rollback").get("last");
  if (!point) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new AppError("NOT_FOUND", "There is no import to undo");
  }
  for (const n of ENTITY_STORES) {
    await tx.objectStore(n).clear();
    for (const r of point.stores[n] ?? []) await tx.objectStore(n).put(r as never);
  }
  await tx.objectStore("outbox").clear();
  for (const o of point.outbox) await tx.objectStore("outbox").put(o);
  if (point.settings) await tx.objectStore("settings").put({ key: "financial", settings: point.settings });
  else await tx.objectStore("settings").delete("financial");
  await tx.objectStore("rollback").delete("last");
  await tx.done;
  return { createdAt: point.createdAt, reason: point.reason };
}

/* ------------------------------------------------------------------------------ */
/* Changeset check against data/ (used by CI and by the owner before integrating)   */
/* ------------------------------------------------------------------------------ */

export interface ChangesetCheck {
  changesetId: string;
  basedOnRevision: number | null;
  dataRevision: number;
  operations: number;
  byEntity: Record<string, Record<string, number>>;
  /** Operations whose baseRev does not match data/ (already integrated, or a conflict). */
  mismatches: { entity: string; id: string; reason: string }[];
  issues: ValidationIssue[];
  ok: boolean;
}

/**
 * Applies a changeset to an in-memory copy of data/ and validates the result. Never writes:
 * the owner integrates by hand (D2-08). Already-applied changesets are reported, not reapplied.
 */
export async function checkChangeset(files: DataFileMap, input: unknown): Promise<ChangesetCheck> {
  const verified = await verifyExchangeFile(input);
  if (verified.kind !== "changeset") throw new AppError("IMPORT_REJECTED", "Not a changeset");
  const cs = verified.file;
  const { dataSet, issues } = parseDataFiles(files);
  if (!dataSet) throw new AppError("VALIDATION_FAILED", "data/ does not pass structural validation", { details: issues.map((i) => `${i.file}: ${i.message}`).slice(0, 20) });
  const result: ChangesetCheck = { changesetId: cs.changesetId, basedOnRevision: cs.basedOnRevision, dataRevision: dataSet.meta.dataRevision, operations: cs.operations.length, byEntity: {}, mismatches: [], issues: [], ok: false };
  if (dataSet.meta.appliedChangesets.includes(cs.changesetId)) {
    result.mismatches.push({ entity: "*", id: cs.changesetId, reason: "changeset already integrated (meta.appliedChangesets)" });
    return result;
  }
  const byId = new Map<string, Rec>();
  for (const entity of ENTITY_STORES) for (const r of collect(dataSet, entity)) byId.set(`${entity}:${r.id}`, r);
  for (const op of cs.operations) {
    const parsed = ENTITY_SCHEMAS[op.entity].safeParse(op.record);
    (result.byEntity[op.entity] ??= {})[op.op] = (result.byEntity[op.entity]?.[op.op] ?? 0) + 1;
    if (!parsed.success) {
      result.issues.push({ layer: "structure", severity: "error", file: op.entity, recordId: op.recordId, message: "Operation record does not match the schema" });
      continue;
    }
    const key = `${op.entity}:${op.recordId}`;
    const current = byId.get(key);
    const fits = op.op === "create" ? !current : current?.rev === op.baseRev;
    if (!fits) result.mismatches.push({ entity: op.entity, id: op.recordId, reason: op.op === "create" ? "id already exists in data/" : `baseRev ${op.baseRev} ≠ data/ rev ${current?.rev ?? "missing"}` });
    else byId.set(key, parsed.data as unknown as Rec);
  }
  result.issues.push(...validateIntegrity(rebuild(dataSet, byId, dataSet.settings)).filter((i) => !i.message.startsWith("I-10")));
  result.ok = result.mismatches.length === 0 && !hasErrors(result.issues);
  return result;
}
