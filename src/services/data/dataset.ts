import type { z } from "zod";
import { validateCategoryTree } from "@/domain/rules/categories";
import {
  accountsFileSchema,
  billsFileSchema,
  budgetsFileSchema,
  cardsFileSchema,
  categoriesFileSchema,
  metaSchema,
  recurrencesFileSchema,
  settingsFileSchema,
  transactionsFileSchema,
  type Account,
  type Bill,
  type Budget,
  type Card,
  type Category,
  type FinancialSettings,
  type Meta,
  type Recurrence,
  type Transaction,
} from "@/domain/schemas";
import { assertCurrentSchema } from "@/lib/validation/compatibility";

/**
 * The official data set: the content of data/ (schemaVersion 2.x), validated.
 * docs/architecture/json-data-architecture.md describes the files and the four layers.
 */
export interface OfficialDataSet {
  meta: Meta;
  settings: FinancialSettings;
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
export type IssueSeverity = "error" | "warning";
export interface ValidationIssue {
  layer: ValidationLayer;
  severity: IssueSeverity;
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
type SingleKey = "accounts" | "categories" | "cards" | "bills" | "recurrences";

export const BUDGET_FILE = /^budgets\/(\d{4})\.json$/;
export const TRANSACTION_FILE = /^transactions\/(\d{4})\/(\d{4}-\d{2})\.json$/;

const err = (layer: ValidationLayer, file: string, message: string, recordId?: string): ValidationIssue => ({
  layer,
  severity: "error",
  file,
  message,
  ...(recordId ? { recordId } : {}),
});

function zodIssues(file: string, error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => err("structure", file, `${issue.path.join(".") || "(root)"}: ${issue.message}`));
}

function versionIssue(file: string, schemaVersion: string): ValidationIssue | null {
  try {
    assertCurrentSchema(schemaVersion);
    return null;
  } catch (e) {
    return err("structure", file, e instanceof Error ? e.message : "Incompatible schemaVersion");
  }
}

/** Reads schemaVersion before full parsing, so a 1.x file reports "migrate" and not 40 field errors. */
function earlyVersionIssue(file: string, content: unknown): ValidationIssue | null {
  const v = (content as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof v === "string" ? versionIssue(file, v) : null;
}

/** Layer 1: structure and version compatibility of every file. */
export function parseDataFiles(files: DataFileMap): { dataSet: OfficialDataSet | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const partial: Partial<OfficialDataSet> = { budgets: {}, transactions: {} };

  for (const [path, content] of Object.entries(files)) {
    const early = earlyVersionIssue(path, content);
    if (early) {
      issues.push(early);
      continue;
    }
    if (path === "meta.json") {
      const r = metaSchema.safeParse(content);
      if (!r.success) issues.push(...zodIssues(path, r.error));
      else partial.meta = r.data;
      continue;
    }
    if (path === "settings.json") {
      const r = settingsFileSchema.safeParse(content);
      if (!r.success) issues.push(...zodIssues(path, r.error));
      else partial.settings = r.data.settings;
      continue;
    }
    if (path in SINGLE_FILES) {
      const key = path.slice(0, -".json".length) as SingleKey;
      const r = SINGLE_FILES[path as keyof typeof SINGLE_FILES].safeParse(content);
      if (!r.success) issues.push(...zodIssues(path, r.error));
      else (partial as Record<SingleKey, unknown>)[key] = r.data.records;
      continue;
    }
    const budget = BUDGET_FILE.exec(path);
    if (budget) {
      const r = budgetsFileSchema.safeParse(content);
      if (!r.success) issues.push(...zodIssues(path, r.error));
      else {
        if (r.data.period !== budget[1]) issues.push(err("structure", path, `period ${r.data.period} does not match the file name`));
        partial.budgets![path] = r.data.records;
      }
      continue;
    }
    const tx = TRANSACTION_FILE.exec(path);
    if (tx) {
      const r = transactionsFileSchema.safeParse(content);
      if (!r.success) issues.push(...zodIssues(path, r.error));
      else {
        if (r.data.period !== tx[2] || !tx[2]!.startsWith(tx[1]!)) issues.push(err("structure", path, `period ${r.data.period} does not match the file path`));
        partial.transactions![path] = r.data.records;
      }
      continue;
    }
    issues.push(err("structure", path, "Unexpected file in data/"));
  }

  for (const required of ["meta.json", "settings.json", ...Object.keys(SINGLE_FILES)]) {
    if (!(required in files)) issues.push(err("structure", required, "Required file is missing"));
  }

  if (issues.length > 0 || !partial.meta || !partial.settings) return { dataSet: null, issues };
  return { dataSet: partial as OfficialDataSet, issues };
}

/** Number of records and sum of `amount` fields per file (invariant I-10). */
export function computeChecksums(dataSet: OfficialDataSet): Record<string, { count: number; amountSum: number }> {
  const sum = (records: readonly object[]) =>
    records.reduce((acc, r) => acc + ("amount" in r && typeof r.amount === "number" ? r.amount : 0), 0);
  const out: Record<string, { count: number; amountSum: number }> = {};
  const single: [string, readonly object[]][] = [
    ["accounts.json", dataSet.accounts],
    ["categories.json", dataSet.categories],
    ["cards.json", dataSet.cards],
    ["bills.json", dataSet.bills],
    ["recurrences.json", dataSet.recurrences],
  ];
  for (const [file, records] of single) out[file] = { count: records.length, amountSum: sum(records) };
  for (const [file, records] of Object.entries(dataSet.budgets)) out[file] = { count: records.length, amountSum: sum(records) };
  for (const [file, records] of Object.entries(dataSet.transactions)) out[file] = { count: records.length, amountSum: sum(records) };
  return out;
}

/** Content key used to flag possible duplicate transactions (same day, amount, account, text). */
export function transactionDuplicateKey(t: Pick<Transaction, "date" | "amount" | "currency" | "accountId" | "type" | "description">): string {
  const text = t.description.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  return [t.date, t.type, t.amount, t.currency, t.accountId, text].join("|");
}

/** Layers 2–4: references and consistency, uniqueness and partition, invariants. */
export function validateIntegrity(dataSet: OfficialDataSet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allTx = Object.entries(dataSet.transactions).flatMap(([file, rs]) => rs.map((r) => ({ file, r })));
  const allBudgets = Object.entries(dataSet.budgets).flatMap(([file, rs]) => rs.map((r) => ({ file, r })));

  // Layer 3a — unique ids across the whole repository.
  const seen = new Map<string, string>();
  const register = (file: string, id: string) => {
    const previous = seen.get(id);
    if (previous) issues.push(err("uniqueness", file, `Duplicate id (also in ${previous})`, id));
    else seen.set(id, file);
  };
  dataSet.accounts.forEach((r) => register("accounts.json", r.id));
  dataSet.categories.forEach((r) => register("categories.json", r.id));
  dataSet.cards.forEach((r) => register("cards.json", r.id));
  dataSet.bills.forEach((r) => register("bills.json", r.id));
  dataSet.recurrences.forEach((r) => register("recurrences.json", r.id));
  allBudgets.forEach(({ file, r }) => register(file, r.id));
  allTx.forEach(({ file, r }) => register(file, r.id));

  // Layer 2 — references point to existing, non-deleted records (I-05) and agree on type and currency.
  const activeMap = <T extends { id: string; deletedAt: string | null }>(rs: T[]) => new Map(rs.filter((r) => r.deletedAt === null).map((r) => [r.id, r]));
  const accounts = activeMap(dataSet.accounts);
  const categories = activeMap(dataSet.categories);
  const cards = activeMap(dataSet.cards);
  const bills = activeMap(dataSet.bills);
  const recurrences = activeMap(dataSet.recurrences);
  const ref = <T>(file: string, id: string, field: string, target: string | null, map: Map<string, T>): T | undefined => {
    if (target === null) return undefined;
    const found = map.get(target);
    if (!found) issues.push(err("references", file, `${field} points to a missing or deleted record`, id));
    return found;
  };
  const sameCurrency = (file: string, id: string, what: string, a: string, b: string) => {
    if (a !== b) issues.push(err("references", file, `currency differs from ${what} (no conversion rules: D2-02)`, id));
  };
  const categoryType = (file: string, id: string, category: Category | undefined, expected: "income" | "expense") => {
    if (category && category.type !== expected) issues.push(err("references", file, `categoryId must be an ${expected} category`, id));
  };

  for (const c of dataSet.cards.filter((x) => x.deletedAt === null)) {
    const account = ref("cards.json", c.id, "accountId", c.accountId, accounts);
    if (account) sameCurrency("cards.json", c.id, "its account", c.currency, account.currency);
    if (c.accountId === null) issues.push({ layer: "references", severity: "warning", file: "cards.json", recordId: c.id, message: "Card has no paying account (migrated from 1.x)" });
  }
  for (const issue of validateCategoryTree(dataSet.categories)) issues.push(err("references", "categories.json", issue.message, issue.id));
  for (const b of dataSet.bills.filter((x) => x.deletedAt === null)) {
    const account = ref("bills.json", b.id, "accountId", b.accountId, accounts);
    if (account) sameCurrency("bills.json", b.id, "its account", b.currency, account.currency);
    categoryType("bills.json", b.id, ref("bills.json", b.id, "categoryId", b.categoryId, categories), "expense");
  }
  for (const r of dataSet.recurrences.filter((x) => x.deletedAt === null)) {
    const account = ref("recurrences.json", r.id, "accountId", r.accountId, accounts);
    if (account) sameCurrency("recurrences.json", r.id, "its account", r.currency, account.currency);
    categoryType("recurrences.json", r.id, ref("recurrences.json", r.id, "categoryId", r.categoryId, categories), r.type);
  }
  for (const { file, r } of allBudgets.filter((x) => x.r.deletedAt === null)) {
    categoryType(file, r.id, ref(file, r.id, "categoryId", r.categoryId, categories), "expense");
  }
  for (const { file, r } of allTx.filter((x) => x.r.deletedAt === null)) {
    const account = ref(file, r.id, "accountId", r.accountId, accounts);
    if (account) sameCurrency(file, r.id, "its account", r.currency, account.currency);
    const destination = ref(file, r.id, "destinationAccountId", r.destinationAccountId, accounts);
    if (destination) sameCurrency(file, r.id, "the destination account", r.currency, destination.currency);
    if (r.type !== "transfer") categoryType(file, r.id, ref(file, r.id, "categoryId", r.categoryId, categories), r.type);
    const card = ref(file, r.id, "cardId", r.cardId, cards);
    if (card) {
      sameCurrency(file, r.id, "its card", r.currency, card.currency);
      if (card.accountId !== null && card.accountId !== r.accountId) issues.push(err("references", file, "accountId must be the card's paying account", r.id));
    }
    ref(file, r.id, "billId", r.billId, bills);
    ref(file, r.id, "recurrenceId", r.recurrenceId, recurrences);
  }

  // Layer 3b — partition: each record lives in the file of its period (I-06).
  for (const { file, r } of allTx) {
    const period = TRANSACTION_FILE.exec(file)?.[2];
    if (period && !r.date.startsWith(period)) issues.push(err("uniqueness", file, "date is outside the file period", r.id));
  }
  for (const { file, r } of allBudgets) {
    const y = BUDGET_FILE.exec(file)?.[1];
    if (y && !r.startDate.startsWith(y)) issues.push(err("uniqueness", file, "startDate is outside the file year", r.id));
  }

  // Layer 4 — invariants.
  // I-03 (v2): transfers are single records; the schema enforces two different accounts and
  // no category. Here: possible duplicate transactions are flagged (warning, never merged).
  const keys = new Map<string, string>();
  for (const { file, r } of allTx) {
    if (r.deletedAt !== null || r.status === "cancelled") continue;
    const key = transactionDuplicateKey(r);
    const other = keys.get(key);
    if (other) issues.push({ layer: "invariants", severity: "warning", file, recordId: r.id, message: `Possible duplicate of ${other}` });
    else keys.set(key, r.id);
  }
  // I-10: checksums in meta.json match the data.
  const computed = computeChecksums(dataSet);
  const declared = dataSet.meta.checksums;
  for (const [file, c] of Object.entries(computed)) {
    const d = declared[file];
    if (!d) issues.push(err("invariants", "meta.json", `I-10: no checksum for ${file}`));
    else if (d.count !== c.count || d.amountSum !== c.amountSum) issues.push(err("invariants", file, "I-10: count or sum does not match meta.json"));
  }
  for (const file of Object.keys(declared)) {
    if (!(file in computed)) issues.push(err("invariants", "meta.json", `I-10: checksum for a file that does not exist (${file})`));
  }
  return issues;
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Full validation: layers 1–4. Warnings do not reject the data set. */
export function validateDataFiles(files: DataFileMap): { dataSet: OfficialDataSet | null; issues: ValidationIssue[] } {
  const parsed = parseDataFiles(files);
  if (!parsed.dataSet) return parsed;
  const issues = validateIntegrity(parsed.dataSet);
  return { dataSet: hasErrors(issues) ? null : parsed.dataSet, issues };
}

/** Serialises a data set back to the file map of data/ (used by migrations and exports). */
export function dataSetToFiles(dataSet: OfficialDataSet, schemaVersion: string): DataFileMap {
  const env = (schema: string, records: unknown[]) => ({ schema, schemaVersion, records });
  const files: DataFileMap = {
    "meta.json": dataSet.meta,
    "settings.json": { schema: "pfm.settings", schemaVersion, settings: dataSet.settings },
    "accounts.json": env("pfm.accounts", dataSet.accounts),
    "categories.json": env("pfm.categories", dataSet.categories),
    "cards.json": env("pfm.cards", dataSet.cards),
    "bills.json": env("pfm.bills", dataSet.bills),
    "recurrences.json": env("pfm.recurrences", dataSet.recurrences),
  };
  for (const [path, records] of Object.entries(dataSet.budgets)) files[path] = { schema: "pfm.budgets", schemaVersion, period: BUDGET_FILE.exec(path)![1], records };
  for (const [path, records] of Object.entries(dataSet.transactions)) files[path] = { schema: "pfm.transactions", schemaVersion, period: TRANSACTION_FILE.exec(path)![2], records };
  return files;
}
