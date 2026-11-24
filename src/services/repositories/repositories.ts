import { uuidv7 } from "@/domain/ids";
import { validateCategoryTree } from "@/domain/rules/categories";
import {
  CATEGORY_MAX_DEPTH,
  CONTROL_FIELDS,
  ENTITY_SCHEMAS,
  type Category,
  type ControlFields,
  type EntityName,
  type EntityOf,
} from "@/domain/schemas";
import { AppError } from "@/lib/errors/app-error";
import { toIsoWithOffset } from "@/lib/formatting/date";
import { transactionDuplicateKey } from "@/services/data/dataset";
import { ENTITY_STORES, ensureDeviceId, type LocalDb, type LocalOperation, type ReadWriteTx } from "@/services/storage/local-store";

/**
 * Typed repositories over the IndexedDB working stores (docs/architecture/data-repositories.md).
 *
 * Every write:
 * 1. builds the FULL record (control fields are set here, never by the caller),
 * 2. validates it against its Zod schema (layer 1),
 * 3. checks references, currencies and business rules against the stores (layers 2–4),
 * 4. writes the record AND its outbox operation in the SAME IndexedDB transaction.
 * If any step fails, nothing is written. Deletes are tombstones (deletedAt), never removals.
 *
 * Inside a unit of work, await only repository calls: awaiting anything else (fetch, timers)
 * lets IndexedDB auto-commit the transaction (it then fails with STORAGE_FAILURE, never half-written).
 */
export interface RepositoryContext {
  db: LocalDb;
  now?: () => Date;
}

export type Input<N extends EntityName> = Omit<EntityOf<N>, ControlKey> & { id?: string };
type ControlKey = keyof ControlFields;
export type Patch<N extends EntityName> = Partial<Omit<EntityOf<N>, ControlKey>>;

export interface ListOptions {
  includeDeleted?: boolean;
}
export interface CreateOptions {
  /** Transactions only: accept a record that looks like an existing one (same date, type, amount, currency, account, description). */
  allowPossibleDuplicate?: boolean;
}

export interface Repository<N extends EntityName> {
  readonly entity: N;
  getAll(options?: ListOptions): Promise<EntityOf<N>[]>;
  getById(id: string, options?: ListOptions): Promise<EntityOf<N> | null>;
  create(input: Input<N>, options?: CreateOptions): Promise<EntityOf<N>>;
  /** expectedRev: optimistic concurrency — fails with CONFLICT if the record changed meanwhile. */
  update(id: string, patch: Patch<N>, expectedRev: number): Promise<EntityOf<N>>;
  /** Tombstone. Accounts, cards and categories still referenced cannot be deleted (D2-06): archive them. */
  delete(id: string, expectedRev: number): Promise<EntityOf<N>>;
}

type AnyRecord = Record<string, unknown> & ControlFields;

/* ------------------------------------------------------------------------------ */
/* Business rules checked against the stores                                         */
/* ------------------------------------------------------------------------------ */

async function live(tx: ReadWriteTx, entity: EntityName, id: string | null | undefined): Promise<AnyRecord | null> {
  if (!id) return null;
  const r = (await tx.objectStore(entity).get(id)) as AnyRecord | undefined;
  return r && r.deletedAt === null ? r : null;
}

async function requireRef(tx: ReadWriteTx, entity: EntityName, id: string | null | undefined, field: string): Promise<AnyRecord | null> {
  if (id === null || id === undefined) return null;
  const r = await live(tx, entity, id);
  if (!r) throw new AppError("REFERENCE_CONSTRAINT", `${field} points to a ${entity} record that does not exist or was deleted`, { details: [`${field}=${id}`] });
  return r;
}

function sameCurrency(field: string, a: unknown, b: unknown): void {
  if (a !== b) throw new AppError("CURRENCY_MISMATCH", `Currency differs from ${field} (D2-02: no cross-currency records)`);
}

async function checkRules(tx: ReadWriteTx, entity: EntityName, r: AnyRecord): Promise<void> {
  if (r.deletedAt !== null) return; // a tombstone keeps its old references
  switch (entity) {
    case "cards": {
      const account = await requireRef(tx, "accounts", r.accountId as string | null, "accountId");
      if (account) sameCurrency("the paying account", r.currency, account.currency);
      break;
    }
    case "transactions": {
      const account = await requireRef(tx, "accounts", r.accountId as string, "accountId");
      sameCurrency("the account", r.currency, account!.currency);
      const destination = await requireRef(tx, "accounts", r.destinationAccountId as string | null, "destinationAccountId");
      if (destination) sameCurrency("the destination account", r.currency, destination.currency);
      const category = await requireRef(tx, "categories", r.categoryId as string | null, "categoryId");
      if (category && category.type !== r.type) throw new AppError("VALIDATION_FAILED", `A ${String(r.type)} cannot use a ${String(category.type)} category`);
      const card = await requireRef(tx, "cards", r.cardId as string | null, "cardId");
      if (card) {
        sameCurrency("the card", r.currency, card.currency);
        if (card.accountId !== null && card.accountId !== r.accountId) throw new AppError("VALIDATION_FAILED", "accountId must be the card's paying account");
      }
      await requireRef(tx, "bills", r.billId as string | null, "billId");
      await requireRef(tx, "recurrences", r.recurrenceId as string | null, "recurrenceId");
      break;
    }
    case "bills": {
      const account = await requireRef(tx, "accounts", r.accountId as string | null, "accountId");
      if (account) sameCurrency("the account", r.currency, account.currency);
      await requireRef(tx, "categories", r.categoryId as string | null, "categoryId");
      break;
    }
    case "recurrences": {
      const account = await requireRef(tx, "accounts", r.accountId as string, "accountId");
      sameCurrency("the account", r.currency, account!.currency);
      const category = await requireRef(tx, "categories", r.categoryId as string | null, "categoryId");
      if (category && category.type !== r.type) throw new AppError("VALIDATION_FAILED", `A ${String(r.type)} recurrence cannot use a ${String(category.type)} category`);
      break;
    }
    case "budgets": {
      const category = await requireRef(tx, "categories", r.categoryId as string, "categoryId");
      if (category!.type !== "expense") throw new AppError("VALIDATION_FAILED", "Budgets apply to expense categories");
      break;
    }
    case "categories": {
      await requireRef(tx, "categories", r.parentId as string | null, "parentId");
      // Reject only problems this change introduces (also those it causes in children).
      const stored = (await tx.objectStore("categories").getAll()) as Category[];
      const key = (i: { id: string; message: string }) => `${i.id}|${i.message}`;
      const before = new Set(validateCategoryTree(stored).map(key));
      const issues = validateCategoryTree([...stored.filter((c) => c.id !== r.id), r as unknown as Category]).filter((i) => !before.has(key(i)));
      if (issues.length > 0) throw new AppError("VALIDATION_FAILED", `Category tree rule broken (max depth ${CATEGORY_MAX_DEPTH}, same type as parent, no cycles)`, { details: issues.map((i) => i.message) });
      break;
    }
    case "accounts":
      break;
  }
}

/** Live records that still point at `id` (D2-06): their presence blocks deletion. */
const REFERRERS: Partial<Record<EntityName, { entity: EntityName; fields: string[] }[]>> = {
  accounts: [
    { entity: "transactions", fields: ["accountId", "destinationAccountId"] },
    { entity: "cards", fields: ["accountId"] },
    { entity: "bills", fields: ["accountId"] },
    { entity: "recurrences", fields: ["accountId"] },
  ],
  cards: [{ entity: "transactions", fields: ["cardId"] }],
  categories: [
    { entity: "transactions", fields: ["categoryId"] },
    { entity: "categories", fields: ["parentId"] },
    { entity: "bills", fields: ["categoryId"] },
    { entity: "recurrences", fields: ["categoryId"] },
    { entity: "budgets", fields: ["categoryId"] },
  ],
  bills: [{ entity: "transactions", fields: ["billId"] }],
  recurrences: [{ entity: "transactions", fields: ["recurrenceId"] }],
};

async function countReferrers(tx: ReadWriteTx, entity: EntityName, id: string): Promise<number> {
  let n = 0;
  for (const { entity: other, fields } of REFERRERS[entity] ?? []) {
    for (const r of (await tx.objectStore(other).getAll()) as AnyRecord[]) {
      if (r.deletedAt === null && fields.some((f) => r[f] === id)) n++;
    }
  }
  return n;
}

const ARCHIVE_HINT: Partial<Record<EntityName, string>> = {
  accounts: "archive it (status: archived)",
  cards: "deactivate it (status: inactive)",
  categories: "deactivate it (isActive: false)",
};

/* ------------------------------------------------------------------------------ */
/* Unit of work                                                                     */
/* ------------------------------------------------------------------------------ */

export type Repositories = { [N in EntityName]: Repository<N> };

export class UnitOfWork {
  readonly operations: LocalOperation[] = [];
  readonly repositories: Repositories;

  constructor(
    private readonly tx: ReadWriteTx,
    private readonly deviceId: string,
    private readonly now: () => Date,
  ) {
    this.repositories = Object.fromEntries(ENTITY_STORES.map((n) => [n, this.repository(n)])) as Repositories;
  }

  private validate<N extends EntityName>(entity: N, record: unknown): EntityOf<N> {
    const parsed = ENTITY_SCHEMAS[entity].safeParse(record);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", `Invalid ${entity} record`, {
        details: parsed.error.issues.map((i) => `${i.path.join(".") || "(record)"}: ${i.message}`),
      });
    }
    return parsed.data as EntityOf<N>;
  }

  private async write(entity: EntityName, op: LocalOperation["op"], record: AnyRecord, baseRev: number | null): Promise<void> {
    await this.tx.objectStore(entity).put(record as never);
    const operation: LocalOperation = {
      operationId: uuidv7(this.now().getTime()),
      op,
      entity,
      recordId: record.id,
      baseRev,
      record,
      createdAt: toIsoWithOffset(this.now()),
      exportedIn: null,
    };
    await this.tx.objectStore("outbox").add(operation);
    this.operations.push(operation);
  }

  private repository<N extends EntityName>(entity: N): Repository<N> {
    const store = () => this.tx.objectStore(entity);
    const load = async (id: string): Promise<AnyRecord> => {
      const current = (await store().get(id)) as AnyRecord | undefined;
      if (!current || current.deletedAt !== null) throw new AppError("NOT_FOUND", `${entity} record not found`, { details: [id] });
      return current;
    };
    const checkRev = (current: AnyRecord, expectedRev: number) => {
      if (current.rev !== expectedRev) throw new AppError("CONFLICT", `${entity} record changed meanwhile (rev ${current.rev}, expected ${expectedRev})`, { details: [current.id] });
    };
    return {
      entity,
      getAll: async (options = {}) => ((await store().getAll()) as AnyRecord[]).filter((r) => options.includeDeleted || r.deletedAt === null) as EntityOf<N>[],
      getById: async (id, options = {}) => {
        const r = (await store().get(id)) as AnyRecord | undefined;
        return r && (options.includeDeleted || r.deletedAt === null) ? (r as EntityOf<N>) : null;
      },
      create: async (input, options = {}) => {
        const stamp = toIsoWithOffset(this.now());
        const id = input.id ?? uuidv7(this.now().getTime());
        if (await store().get(id)) throw new AppError("DUPLICATE_ID", `${entity} id already exists`, { details: [id] });
        const draft: Record<string, unknown> = { ...input, id, rev: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null, deviceId: this.deviceId };
        const record = this.validate(entity, draft) as unknown as AnyRecord;
        await checkRules(this.tx, entity, record);
        if (entity === "transactions" && !options.allowPossibleDuplicate) {
          const key = transactionDuplicateKey(record as never);
          const twin = ((await store().getAll()) as AnyRecord[]).find((r) => r.deletedAt === null && transactionDuplicateKey(r as never) === key);
          if (twin) throw new AppError("POSSIBLE_DUPLICATE", "A transaction with the same date, type, amount, account and description exists", { details: [twin.id] });
        }
        await this.write(entity, "create", record, null);
        return record as EntityOf<N>;
      },
      update: async (id, patch, expectedRev) => {
        const current = await load(id);
        checkRev(current, expectedRev);
        const touched = Object.keys(patch).filter((k) => (CONTROL_FIELDS as string[]).includes(k));
        if (touched.length > 0) throw new AppError("VALIDATION_FAILED", "Control fields cannot be changed", { details: touched });
        const draft = { ...current, ...patch, rev: current.rev + 1, updatedAt: toIsoWithOffset(this.now()), deviceId: this.deviceId };
        const record = this.validate(entity, draft) as unknown as AnyRecord;
        if (entity === "accounts" || entity === "cards") {
          // Currency is part of every linked record (D2-02): it cannot change while referenced.
          if (record.currency !== current.currency && (await countReferrers(this.tx, entity, id)) > 0) {
            throw new AppError("REFERENCE_CONSTRAINT", `Currency of a referenced ${entity} record cannot change`);
          }
        }
        await checkRules(this.tx, entity, record);
        await this.write(entity, "update", record, current.rev);
        return record as EntityOf<N>;
      },
      delete: async (id, expectedRev) => {
        const current = await load(id);
        checkRev(current, expectedRev);
        const refs = await countReferrers(this.tx, entity, id);
        if (refs > 0) {
          const hint = ARCHIVE_HINT[entity];
          throw new AppError("REFERENCE_CONSTRAINT", `${entity} record is referenced by ${refs} record(s)${hint ? `; ${hint} instead` : ""}`, { details: [id] });
        }
        const stamp = toIsoWithOffset(this.now());
        const record = { ...current, rev: current.rev + 1, updatedAt: stamp, deletedAt: stamp, deviceId: this.deviceId };
        this.validate(entity, record);
        await this.write(entity, "delete", record, current.rev);
        return record as EntityOf<N>;
      },
    };
  }
}

/**
 * Runs `work` in ONE IndexedDB transaction across every working store and the outbox.
 * All of its writes commit together, or none do (the transaction is aborted on any error).
 */
export async function unitOfWork<T>(ctx: RepositoryContext, work: (repos: Repositories, uow: UnitOfWork) => Promise<T>): Promise<T> {
  const now = ctx.now ?? (() => new Date());
  const deviceId = await ensureDeviceId(ctx.db, now);
  const tx = ctx.db.transaction([...ENTITY_STORES, "outbox"], "readwrite");
  const uow = new UnitOfWork(tx, deviceId, now);
  try {
    const result = await work(uow.repositories, uow);
    await tx.done;
    return result;
  } catch (cause) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await tx.done.catch(() => undefined);
    if (cause instanceof AppError) throw cause;
    throw new AppError("STORAGE_FAILURE", "Local change could not be saved; nothing was changed", { cause });
  }
}

/** Repositories where each call is its own unit of work. */
export function createRepositories(ctx: RepositoryContext): Repositories {
  const one = <N extends EntityName>(entity: N): Repository<N> => {
    const run = <T>(f: (r: Repository<N>) => Promise<T>) => unitOfWork(ctx, (repos) => f(repos[entity] as Repository<N>));
    return {
      entity,
      getAll: async (options = {}) => {
        const all = (await ctx.db.getAll(entity)) as AnyRecord[];
        return all.filter((r) => options.includeDeleted || r.deletedAt === null) as EntityOf<N>[];
      },
      getById: async (id, options = {}) => {
        const r = (await ctx.db.get(entity, id)) as AnyRecord | undefined;
        return r && (options.includeDeleted || r.deletedAt === null) ? (r as EntityOf<N>) : null;
      },
      create: (input, options) => run((r) => r.create(input, options)),
      update: (id, patch, rev) => run((r) => r.update(id, patch, rev)),
      delete: (id, rev) => run((r) => r.delete(id, rev)),
    };
  };
  return Object.fromEntries(ENTITY_STORES.map((n) => [n, one(n)])) as Repositories;
}

/* ------------------------------------------------------------------------------ */
/* Protected operations                                                             */
/* ------------------------------------------------------------------------------ */

export const CLEAR_CONFIRMATION = "BORRAR-DATOS-LOCALES";

/**
 * Erases every working store, the snapshot, the publication history and the outbox of this
 * device. Protected: requires the literal confirmation and refuses while there are pending
 * (unexported) changes unless `discardPendingChanges` is also given. `legacy_v1` is kept.
 */
export async function clearLocalData(db: LocalDb, options: { confirmation: string; discardPendingChanges?: boolean }): Promise<void> {
  if (options.confirmation !== CLEAR_CONFIRMATION) throw new AppError("PROTECTED_OPERATION", "Clearing local data needs explicit confirmation");
  const pending = (await db.getAll("outbox")).filter((o) => o.exportedIn === null).length;
  if (pending > 0 && !options.discardPendingChanges) {
    throw new AppError("PROTECTED_OPERATION", `${pending} local change(s) have not been exported; export them or confirm discarding them`);
  }
  const tx = db.transaction([...ENTITY_STORES, "outbox", "snapshot", "publications", "settings"], "readwrite");
  await Promise.all([...ENTITY_STORES, "outbox", "snapshot", "publications", "settings"].map((n) => tx.objectStore(n as never).clear()));
  await tx.done;
}
