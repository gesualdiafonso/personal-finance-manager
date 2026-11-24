import { uuidv7 } from "@/domain/ids";
import { overlappingBudget } from "@/domain/rules/budgets";
import { validateCategoryTree } from "@/domain/rules/categories";
import { goalProgress } from "@/domain/rules/goals";
import {
  CATEGORY_MAX_DEPTH,
  CONTROL_FIELDS,
  ENTITY_SCHEMAS,
  type Budget,
  type Category,
  type ControlFields,
  type EntityName,
  type EntityOf,
  type Goal,
  type GoalContribution,
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
      const category = await requireRef(tx, "categories", r.categoryId as string | null, "categoryId");
      if (category && category.type !== "expense") throw new AppError("VALIDATION_FAILED", "A bill uses an expense category (D5-15)");
      await requireRef(tx, "recurrences", (r.recurrenceId ?? null) as string | null, "recurrenceId");
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
      // categoryId null = general budget (2.3.0).
      const category = await requireRef(tx, "categories", r.categoryId as string | null, "categoryId");
      if (category && category.type !== "expense") throw new AppError("VALIDATION_FAILED", "Budgets apply to expense categories");
      const twin = overlappingBudget(r as unknown as Budget, (await tx.objectStore("budgets").getAll()) as Budget[]);
      if (twin) throw new AppError("POSSIBLE_DUPLICATE", "An active budget for the same category, currency and period type overlaps these dates", { details: [twin.id] });
      break;
    }
    case "goals":
      break;
    case "goalContributions": {
      const goal = await requireRef(tx, "goals", r.goalId as string, "goalId");
      sameCurrency("the goal", r.currency, goal!.currency);
      const account = await requireRef(tx, "accounts", r.accountId as string | null, "accountId");
      if (account) sameCurrency("the account", r.currency, account.currency);
      const t = await requireRef(tx, "transactions", r.transactionId as string | null, "transactionId");
      if (t) {
        sameCurrency("the transaction", r.currency, t.currency);
        // The same money cannot be a contribution and a new income (no double counting).
        if (t.type === "income") throw new AppError("VALIDATION_FAILED", "A contribution can only point at a transfer or an expense, never an income");
        if (t.status === "cancelled") throw new AppError("VALIDATION_FAILED", "A contribution cannot point at a cancelled transaction");
        if (r.cancelledAt === null) {
          const others = (await tx.objectStore("goalContributions").index("transactionId").getAll(t.id as string)) as AnyRecord[];
          const other = others.find((c) => c.id !== r.id && c.deletedAt === null && c.cancelledAt === null);
          if (other) throw new AppError("PROTECTED_OPERATION", "This transaction already backs another contribution", { details: [other.id] });
        }
      }
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

/**
 * D4-07: new movements cannot use an archived account or an inactive card. Existing movements
 * that already use them stay valid: on update only a CHANGED reference is checked.
 */
async function assertActiveReferences(tx: ReadWriteTx, record: AnyRecord, previous: AnyRecord | null): Promise<void> {
  if (record.deletedAt !== null) return;
  const changed = (field: string) => record[field] !== null && record[field] !== undefined && (previous === null || previous[field] !== record[field]);
  for (const field of ["accountId", "destinationAccountId"]) {
    if (!changed(field)) continue;
    const account = await live(tx, "accounts", record[field] as string);
    if (account && account.status !== "active") throw new AppError("REFERENCE_CONSTRAINT", `${field} points to an archived account`, { details: [`${field}=${String(record[field])}`] });
  }
  if (changed("cardId")) {
    const card = await live(tx, "cards", record.cardId as string);
    if (card && card.status !== "active") throw new AppError("REFERENCE_CONSTRAINT", "cardId points to an inactive card", { details: [`cardId=${String(record.cardId)}`] });
  }
}

/**
 * Transaction edit policy, enforced here so no screen can bypass it (Step 04 §11):
 * the type never changes (D4-01); a cancelled movement is final — only its notes change (D4-03).
 */
function assertTransactionEditAllowed(current: AnyRecord, next: AnyRecord): void {
  if (next.type !== current.type) throw new AppError("PROTECTED_OPERATION", "The type of a transaction cannot change; cancel it and create a new one");
  if (current.status === "cancelled") {
    const changed = Object.keys(next).filter((k) => !["notes", "rev", "updatedAt", "deviceId"].includes(k) && JSON.stringify(next[k]) !== JSON.stringify(current[k]));
    if (changed.length > 0) throw new AppError("PROTECTED_OPERATION", "A cancelled transaction is final: only its notes can change", { details: changed });
  }
}

/**
 * Bill policy (Step 05, D5-03/D5-04/D5-07), enforced here so no screen can bypass it:
 * - a new bill is always pending;
 * - "paid" is never set by hand: it follows the payments;
 * - a cancelled bill is final, and a paid one is closed: only their notes change.
 */
const BILL_FREE_FIELDS = ["notes", "rev", "updatedAt", "deviceId"];
function assertBillCreateAllowed(record: AnyRecord): void {
  if (record.status !== "pending") throw new AppError("PROTECTED_OPERATION", "A new bill is always pending; payments mark it as paid");
}
function assertBillEditAllowed(current: AnyRecord, next: AnyRecord): void {
  if (next.status === "paid" && current.status !== "paid") throw new AppError("PROTECTED_OPERATION", "A bill is marked as paid by its payments, not by hand");
  if (current.status !== "pending") {
    const changed = Object.keys(next).filter((k) => !BILL_FREE_FIELDS.includes(k) && JSON.stringify(next[k]) !== JSON.stringify(current[k]));
    if (changed.length > 0) throw new AppError("PROTECTED_OPERATION", `A ${String(current.status)} bill is closed: only its notes can change`, { details: changed });
  }
}

/**
 * Budget policy (Step 06): a new budget is active and has a positive limit.
 */
function assertBudgetCreateAllowed(record: AnyRecord): void {
  if ((record.amount as number) <= 0) throw new AppError("VALIDATION_FAILED", "A budget limit must be greater than zero");
  if ((record.status ?? "active") !== "active") throw new AppError("PROTECTED_OPERATION", "A new budget is always active");
}

/**
 * Goal policy (Step 06):
 * - a new goal is active, neither completed nor archived;
 * - completed only from active, by the user, once the target is reached (never automatic);
 * - cancelled only from active; completed and cancelled goals are final — only their
 *   description and archive flag change;
 * - the currency cannot change once there are contributions.
 */
const GOAL_FREE_FIELDS = ["description", "archivedAt", "rev", "updatedAt", "deviceId"];
function assertGoalCreateAllowed(record: AnyRecord): void {
  if (record.status !== "active" || record.archivedAt !== null) throw new AppError("PROTECTED_OPERATION", "A new goal is always active");
}
async function assertGoalEditAllowed(tx: ReadWriteTx, current: AnyRecord, next: AnyRecord): Promise<void> {
  const contributions = (await tx.objectStore("goalContributions").index("goalId").getAll(current.id)) as GoalContribution[];
  if (current.status !== "active") {
    const changed = Object.keys(next).filter((k) => !GOAL_FREE_FIELDS.includes(k) && JSON.stringify(next[k]) !== JSON.stringify(current[k]));
    if (changed.length > 0) throw new AppError("PROTECTED_OPERATION", `A ${String(current.status)} goal is closed: only its description and archive flag change`, { details: changed });
    return;
  }
  if (next.currency !== current.currency && contributions.some((c) => c.deletedAt === null)) {
    throw new AppError("REFERENCE_CONSTRAINT", "The currency of a goal with contributions cannot change");
  }
  if (next.status === "completed") {
    const progress = goalProgress(next as unknown as Goal, contributions, "0000-01-01");
    if (!progress.reached) throw new AppError("PROTECTED_OPERATION", "A goal is completed only once its target is reached");
  }
}

/**
 * Contribution policy (Step 06): new ones go to an active, non-archived goal and are not
 * cancelled; afterwards only the description changes or the contribution is cancelled (kept
 * in the history) — always while the goal is active. Amount, currency, date, goal and links
 * never change: cancel and register it again. Contributions are never deleted.
 */
async function assertContributionCreateAllowed(tx: ReadWriteTx, record: AnyRecord): Promise<void> {
  if (record.cancelledAt !== null) throw new AppError("PROTECTED_OPERATION", "A new contribution cannot be cancelled");
  const goal = await live(tx, "goals", record.goalId as string);
  if (goal && (goal.status !== "active" || goal.archivedAt !== null)) throw new AppError("PROTECTED_OPERATION", "Contributions go to an active goal");
}
async function assertContributionEditAllowed(tx: ReadWriteTx, current: AnyRecord, next: AnyRecord): Promise<void> {
  const changed = Object.keys(next).filter((k) => !["description", "cancelledAt", "rev", "updatedAt", "deviceId"].includes(k) && JSON.stringify(next[k]) !== JSON.stringify(current[k]));
  if (changed.length > 0) throw new AppError("PROTECTED_OPERATION", "A contribution only changes its description or is cancelled", { details: changed });
  if (current.cancelledAt !== null && next.cancelledAt !== current.cancelledAt) throw new AppError("PROTECTED_OPERATION", "A cancelled contribution is final");
  const goal = await live(tx, "goals", current.goalId as string);
  if (!goal || goal.status !== "active") throw new AppError("PROTECTED_OPERATION", "Contributions of a closed goal cannot change");
}

/** A transaction that backs a live contribution cannot be cancelled: cancel the contribution first. */
async function assertNotBackingContribution(tx: ReadWriteTx, current: AnyRecord, next: AnyRecord): Promise<void> {
  if (next.status !== "cancelled" || current.status === "cancelled") return;
  const backing = ((await tx.objectStore("goalContributions").index("transactionId").getAll(current.id)) as AnyRecord[]).find((c) => c.deletedAt === null && c.cancelledAt === null);
  if (backing) throw new AppError("PROTECTED_OPERATION", "This transaction backs a goal contribution: cancel the contribution first", { details: [backing.id] });
}

/** Live records that still point at `id` (D2-06): their presence blocks deletion. */
export const REFERRERS: Partial<Record<EntityName, { entity: EntityName; fields: string[] }[]>> = {
  accounts: [
    { entity: "transactions", fields: ["accountId", "destinationAccountId"] },
    { entity: "cards", fields: ["accountId"] },
    { entity: "bills", fields: ["accountId"] },
    { entity: "recurrences", fields: ["accountId"] },
    { entity: "goalContributions", fields: ["accountId"] },
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
  recurrences: [
    { entity: "transactions", fields: ["recurrenceId"] },
    { entity: "bills", fields: ["recurrenceId"] },
  ],
  transactions: [{ entity: "goalContributions", fields: ["transactionId"] }],
  goals: [{ entity: "goalContributions", fields: ["goalId"] }],
};

/** Pure count of live records referencing `id`, given the referrer stores' records (single rule, D2-06). */
export function countReferencesIn(records: Partial<Record<EntityName, readonly unknown[]>>, entity: EntityName, id: string): number {
  let n = 0;
  for (const { entity: other, fields } of REFERRERS[entity] ?? []) {
    for (const r of (records[other] ?? []) as AnyRecord[]) {
      if (r.deletedAt === null && fields.some((f) => r[f] === id)) n++;
    }
  }
  return n;
}

async function countReferrers(tx: ReadWriteTx, entity: EntityName, id: string): Promise<number> {
  const records: Partial<Record<EntityName, unknown[]>> = {};
  for (const { entity: other } of REFERRERS[entity] ?? []) records[other] = await tx.objectStore(other).getAll();
  return countReferencesIn(records, entity, id);
}

/** Read-only: how many live records reference this one (an account/card/category with references can only be archived). */
export async function countReferences(db: LocalDb, entity: EntityName, id: string): Promise<number> {
  const stores = [...new Set((REFERRERS[entity] ?? []).map((r) => r.entity))];
  if (stores.length === 0) return 0;
  const tx = db.transaction(stores, "readonly");
  const records: Partial<Record<EntityName, unknown[]>> = {};
  for (const s of stores) records[s] = await tx.objectStore(s).getAll();
  await tx.done;
  return countReferencesIn(records, entity, id);
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
        if (entity === "bills") assertBillCreateAllowed(record);
        if (entity === "budgets") assertBudgetCreateAllowed(record);
        if (entity === "goals") assertGoalCreateAllowed(record);
        if (entity === "goalContributions") await assertContributionCreateAllowed(this.tx, record);
        await checkRules(this.tx, entity, record);
        if (entity === "transactions" || entity === "bills" || entity === "goalContributions") await assertActiveReferences(this.tx, record, null);
        if (entity === "goalContributions" && !options.allowPossibleDuplicate && record.transactionId === null) {
          // Double submit or the same contribution typed twice: same goal, day, amount and text.
          const twin = ((await this.tx.objectStore("goalContributions").index("goalId").getAll(record.goalId as string)) as AnyRecord[]).find(
            (c) => c.deletedAt === null && c.cancelledAt === null && c.date === record.date && c.amount === record.amount && (c.description ?? "") === (record.description ?? ""),
          );
          if (twin) throw new AppError("POSSIBLE_DUPLICATE", "A contribution with the same goal, date, amount and description exists", { details: [twin.id] });
        }
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
        if (entity === "cards" && record.accountId !== current.accountId && current.accountId !== null && (await countReferrers(this.tx, entity, id)) > 0) {
          // Its purchases are tied to the paying account: moving the card would break them (Step 03 §11).
          throw new AppError("REFERENCE_CONSTRAINT", "The paying account of a card with movements cannot change");
        }
        if (entity === "transactions") assertTransactionEditAllowed(current, record);
        if (entity === "bills") assertBillEditAllowed(current, record);
        if (entity === "transactions") await assertNotBackingContribution(this.tx, current, record);
        if (entity === "goals") await assertGoalEditAllowed(this.tx, current, record);
        if (entity === "goalContributions") await assertContributionEditAllowed(this.tx, current, record);
        await checkRules(this.tx, entity, record);
        if (entity === "transactions" || entity === "bills") await assertActiveReferences(this.tx, record, current);
        await this.write(entity, "update", record, current.rev);
        return record as EntityOf<N>;
      },
      delete: async (id, expectedRev) => {
        const current = await load(id);
        checkRev(current, expectedRev);
        if (entity === "transactions" && current.status === "completed") {
          // D4-04: a completed movement is cancelled (kept, audited), never deleted directly.
          throw new AppError("PROTECTED_OPERATION", "A completed transaction must be cancelled before it can be deleted");
        }
        if (entity === "goalContributions") {
          // History of a goal (Step 06): a contribution is cancelled, never deleted.
          throw new AppError("PROTECTED_OPERATION", "A contribution is cancelled, never deleted");
        }
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

/* ------------------------------------------------------------------------------ */
/* Initial categories (D4-09)                                                      */
/* ------------------------------------------------------------------------------ */

/**
 * Creates DEFAULT_CATEGORIES in one unit of work if — and only if — this device has no
 * category at all (live or deleted). Idempotent; returns how many were created.
 */
export async function ensureDefaultCategories(ctx: RepositoryContext): Promise<number> {
  const { DEFAULT_CATEGORIES } = await import("@/domain/default-categories");
  if ((await ctx.db.count("categories")) > 0) return 0;
  return unitOfWork(ctx, async (repos) => {
    if ((await repos.categories.getAll({ includeDeleted: true })).length > 0) return 0;
    for (const c of DEFAULT_CATEGORIES) {
      await repos.categories.create({ id: c.id, name: c.name, type: c.type, parentId: null, icon: null, color: null, isDefault: true, isActive: true });
    }
    return DEFAULT_CATEGORIES.length;
  });
}
