import type { z } from "zod";
import { assertSchemaCompatible } from "@/lib/validation/compatibility";
import {
  accountsFileSchema,
  billsFileSchema,
  budgetsFileSchema,
  cardsFileSchema,
  categoriesFileSchema,
  metaSchema,
  recurrencesFileSchema,
  transactionsFileSchema,
  type Account,
  type Bill,
  type Budget,
  type Card,
  type Category,
  type Meta,
  type Recurrence,
  type Transaction,
} from "@/lib/validation/schemas";

/**
 * The official data set: the content of data/ in the private repository, as validated.
 * Official data is never mixed with local, unexported changes (those live in the
 * IndexedDB outbox — see services/storage/local-store.ts).
 */
export interface OfficialDataSet {
  meta: Meta;
  accounts: Account[];
  categories: Category[];
  cards: Card[];
  bills: Bill[];
  recurrences: Recurrence[];
  /** Keyed by file path, e.g. "budgets/2026.json". */
  budgets: Record<string, Budget[]>;
  /** Keyed by file path, e.g. "transactions/2026/2026-11.json". */
  transactions: Record<string, Transaction[]>;
}

/** Map of data file path (relative to data/) to parsed JSON content. */
export type DataFileMap = Record<string, unknown>;

export type ValidationLayer = "structure" | "references" | "uniqueness" | "invariants";
export interface ValidationIssue {
  layer: ValidationLayer;
  file: string;
  recordId?: string;
  /** Never contains amounts or descriptions — only ids, fields and rules. */
  message: string;
}

const SINGLE_FILES = {
  "accounts.json": accountsFileSchema,
  "categories.json": categoriesFileSchema,
  "cards.json": cardsFileSchema,
  "bills.json": billsFileSchema,
  "recurrences.json": recurrencesFileSchema,
} as const;

const BUDGET_FILE = /^budgets\/(\d{4})\.json$/;
const TRANSACTION_FILE = /^transactions\/(\d{4})\/(\d{4}-\d{2})\.json$/;

function zodIssues(file: string, error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    layer: "structure",
    file,
    message: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  }));
}

function versionIssue(file: string, schemaVersion: string): ValidationIssue | null {
  try {
    assertSchemaCompatible(schemaVersion);
    return null;
  } catch (e) {
    return { layer: "structure", file, message: e instanceof Error ? e.message : "Incompatible schemaVersion" };
  }
}

/** Layer 1: structure and version compatibility of every file. */
export function parseDataFiles(files: DataFileMap): { dataSet: OfficialDataSet | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const partial: Partial<OfficialDataSet> = { budgets: {}, transactions: {} };

  for (const [path, content] of Object.entries(files)) {
    if (path === "meta.json") {
      const r = metaSchema.safeParse(content);
      if (!r.success) issues.push(...zodIssues(path, r.error));
      else {
        const v = versionIssue(path, r.data.schemaVersion);
        if (v) issues.push(v);
        partial.meta = r.data;
      }
      continue;
    }
    if (path in SINGLE_FILES) {
      const key = path.slice(0, -".json".length);
      const r = SINGLE_FILES[path as keyof typeof SINGLE_FILES].safeParse(content);
      if (!r.success) issues.push(...zodIssues(path, r.error));
      else {
        const v = versionIssue(path, r.data.schemaVersion);
        if (v) issues.push(v);
        (partial as Record<string, unknown>)[key] = r.data.records;
      }
      continue;
    }
    const budget = BUDGET_FILE.exec(path);
    if (budget) {
      const r = budgetsFileSchema.safeParse(content);
      if (!r.success) issues.push(...zodIssues(path, r.error));
      else {
        const v = versionIssue(path, r.data.schemaVersion);
        if (v) issues.push(v);
        if (r.data.period !== budget[1]) issues.push({ layer: "structure", file: path, message: `period ${r.data.period} does not match the file name` });
        partial.budgets![path] = r.data.records;
      }
      continue;
    }
    const tx = TRANSACTION_FILE.exec(path);
    if (tx) {
      const r = transactionsFileSchema.safeParse(content);
      if (!r.success) issues.push(...zodIssues(path, r.error));
      else {
        const v = versionIssue(path, r.data.schemaVersion);
        if (v) issues.push(v);
        if (r.data.period !== tx[2] || !tx[2]!.startsWith(tx[1]!)) {
          issues.push({ layer: "structure", file: path, message: `period ${r.data.period} does not match the file path` });
        }
        partial.transactions![path] = r.data.records;
      }
      continue;
    }
    issues.push({ layer: "structure", file: path, message: "Unexpected file in data/" });
  }

  for (const required of ["meta.json", ...Object.keys(SINGLE_FILES)]) {
    if (!(required in files)) issues.push({ layer: "structure", file: required, message: "Required file is missing" });
  }

  if (issues.length > 0 || !partial.meta) return { dataSet: null, issues };
  return { dataSet: partial as OfficialDataSet, issues };
}

/** Number of records and sum of amountMinor per file (invariant I-10). */
export function computeChecksums(dataSet: OfficialDataSet): Record<string, { count: number; sumMinor: number }> {
  const sum = (records: readonly object[]) =>
    records.reduce((acc, r) => acc + ("amountMinor" in r && typeof r.amountMinor === "number" ? r.amountMinor : 0), 0);
  const out: Record<string, { count: number; sumMinor: number }> = {};
  const single: [string, readonly object[]][] = [
    ["accounts.json", dataSet.accounts],
    ["categories.json", dataSet.categories],
    ["cards.json", dataSet.cards],
    ["bills.json", dataSet.bills],
    ["recurrences.json", dataSet.recurrences],
  ];
  for (const [file, records] of single) out[file] = { count: records.length, sumMinor: sum(records) };
  for (const [file, records] of Object.entries(dataSet.budgets)) out[file] = { count: records.length, sumMinor: sum(records) };
  for (const [file, records] of Object.entries(dataSet.transactions)) out[file] = { count: records.length, sumMinor: sum(records) };
  return out;
}

/** Layers 2–4: references, uniqueness and partition, financial invariants. */
export function validateIntegrity(dataSet: OfficialDataSet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allTransactions = Object.entries(dataSet.transactions).flatMap(([file, rs]) => rs.map((r) => ({ file, r })));
  const allBudgets = Object.entries(dataSet.budgets).flatMap(([file, rs]) => rs.map((r) => ({ file, r })));

  // Layer 3a — unique ids across the whole repository.
  const seen = new Map<string, string>();
  const register = (file: string, id: string) => {
    const previous = seen.get(id);
    if (previous) issues.push({ layer: "uniqueness", file, recordId: id, message: `Duplicate id (also in ${previous})` });
    else seen.set(id, file);
  };
  for (const r of dataSet.accounts) register("accounts.json", r.id);
  for (const r of dataSet.categories) register("categories.json", r.id);
  for (const r of dataSet.cards) register("cards.json", r.id);
  for (const r of dataSet.bills) register("bills.json", r.id);
  for (const r of dataSet.recurrences) register("recurrences.json", r.id);
  for (const { file, r } of allBudgets) register(file, r.id);
  for (const { file, r } of allTransactions) register(file, r.id);

  // Layer 2 — references point to existing, non-deleted records (I-05).
  const active = <T extends { id: string; deletedAt: string | null }>(rs: T[]) => new Set(rs.filter((r) => r.deletedAt === null).map((r) => r.id));
  const accounts = active(dataSet.accounts);
  const categories = active(dataSet.categories);
  const cards = active(dataSet.cards);
  const bills = active(dataSet.bills);
  const recurrences = active(dataSet.recurrences);
  const ref = (file: string, id: string, field: string, target: string | null, set: Set<string>, deleted: boolean) => {
    if (deleted || target === null) return;
    if (!set.has(target)) issues.push({ layer: "references", file, recordId: id, message: `${field} points to a missing or deleted record` });
  };
  for (const r of dataSet.bills) ref("bills.json", r.id, "accountId", r.accountId, accounts, r.deletedAt !== null);
  for (const r of dataSet.recurrences) {
    ref("recurrences.json", r.id, "accountId", r.accountId, accounts, r.deletedAt !== null);
    ref("recurrences.json", r.id, "categoryId", r.categoryId, categories, r.deletedAt !== null);
  }
  for (const { file, r } of allBudgets) ref(file, r.id, "categoryId", r.categoryId, categories, r.deletedAt !== null);
  for (const { file, r } of allTransactions) {
    const deleted = r.deletedAt !== null;
    ref(file, r.id, "accountId", r.accountId, accounts, deleted);
    ref(file, r.id, "categoryId", r.categoryId, categories, deleted);
    ref(file, r.id, "cardId", r.cardId, cards, deleted);
    ref(file, r.id, "billId", r.billId, bills, deleted);
    ref(file, r.id, "recurrenceId", r.recurrenceId, recurrences, deleted);
  }

  // Layer 3b — partition: each record lives in the file of its period (I-06).
  for (const { file, r } of allTransactions) {
    const period = TRANSACTION_FILE.exec(file)?.[2];
    if (period && !r.date.startsWith(period)) issues.push({ layer: "uniqueness", file, recordId: r.id, message: "date is outside the file period" });
  }
  for (const { file, r } of allBudgets) {
    const y = BUDGET_FILE.exec(file)?.[1];
    if (y && !r.period.startsWith(y)) issues.push({ layer: "uniqueness", file, recordId: r.id, message: "period is outside the file year" });
  }

  // Layer 4 — invariants.
  // I-03: a transfer is exactly two active records with the same transferId, date and amount, different accounts.
  const transfers = new Map<string, { file: string; r: (typeof allTransactions)[number]["r"] }[]>();
  for (const item of allTransactions) {
    if (item.r.deletedAt !== null) continue;
    if (item.r.kind === "transfer") {
      if (!item.r.transferId) {
        issues.push({ layer: "invariants", file: item.file, recordId: item.r.id, message: "I-03: transfer without transferId" });
        continue;
      }
      transfers.set(item.r.transferId, [...(transfers.get(item.r.transferId) ?? []), item]);
    } else if (item.r.transferId) {
      issues.push({ layer: "invariants", file: item.file, recordId: item.r.id, message: "I-03: transferId on a non-transfer record" });
    }
  }
  for (const [transferId, legs] of transfers) {
    const [a, b] = legs;
    const valid = legs.length === 2 && a && b && a.r.date === b.r.date && a.r.amountMinor === b.r.amountMinor && a.r.accountId !== b.r.accountId;
    if (!valid) issues.push({ layer: "invariants", file: legs[0]?.file ?? "transactions", message: `I-03: transfer ${transferId} must be two legs with the same date and amount on different accounts` });
  }

  // I-02: single currency is enforced by metaSchema (literal ARS, 2 decimals).
  // I-10: checksums written in meta.json match the data.
  const computed = computeChecksums(dataSet);
  const declared = dataSet.meta.checksums;
  for (const [file, c] of Object.entries(computed)) {
    const d = declared[file];
    if (!d) issues.push({ layer: "invariants", file: "meta.json", message: `I-10: no checksum for ${file}` });
    else if (d.count !== c.count || d.sumMinor !== c.sumMinor) issues.push({ layer: "invariants", file, message: "I-10: count or sum does not match meta.json" });
  }
  for (const file of Object.keys(declared)) {
    if (!(file in computed)) issues.push({ layer: "invariants", file: "meta.json", message: `I-10: checksum for a file that does not exist (${file})` });
  }

  return issues;
}

/** Full validation: layers 1–4. */
export function validateDataFiles(files: DataFileMap): { dataSet: OfficialDataSet | null; issues: ValidationIssue[] } {
  const parsed = parseDataFiles(files);
  if (!parsed.dataSet) return parsed;
  const issues = validateIntegrity(parsed.dataSet);
  return { dataSet: issues.length === 0 ? parsed.dataSet : null, issues };
}
