import { DEFAULT_FINANCIAL_SETTINGS } from "@/domain/settings";
import { SCHEMA_VERSION } from "@/domain/schemas";
import { AppError } from "@/lib/errors/app-error";
import {
  classifySchemaVersion,
  compareSemVer,
} from "@/lib/validation/compatibility";
import {
  BUDGET_FILE,
  computeChecksums,
  hasErrors,
  TRANSACTION_FILE,
  validateDataFiles,
  type DataFileMap,
  type OfficialDataSet,
} from "@/services/data/dataset";
import * as v1 from "./legacy/v1-schemas";

/**
 * Data migrations (docs/architecture/data-versioning.md).
 *
 * Rules: migrations only go UP (never downgrade); they never discard a record (every input
 * record is either kept or explicitly absorbed into another, with its id recorded); they
 * never guess missing information (they stop with MIGRATION_BLOCKED and say what is
 * needed); the result must pass full validation; a report is always produced.
 */
export interface MigrationContext {
  /** ISO timestamp with offset, used for meta.updatedAt. Injected for reproducibility. */
  now: string;
  /** 1.x transfers had no direction: transferId → source accountId. Required per transfer. */
  transferDirections?: Record<string, string>;
}

export interface MigrationStepReport {
  from: string;
  to: string;
  description: string;
  counts: Record<string, { before: number; after: number }>;
  renamedFields: string[];
  defaultsApplied: {
    entity: string;
    field: string;
    value: string;
    count: number;
  }[];
  merged: {
    entity: string;
    survivorId: string;
    absorbedIds: string[];
    reason: string;
  }[];
  warnings: string[];
}

export interface MigrationReport {
  from: string;
  to: string;
  changed: boolean;
  steps: MigrationStepReport[];
  recordsBefore: number;
  recordsAfter: number;
  recordsAbsorbed: number;
}

export interface DataMigration {
  from: string;
  to: string;
  description: string;
  migrate(
    files: DataFileMap,
    ctx: MigrationContext,
  ): { files: DataFileMap; report: MigrationStepReport };
}

/* ------------------------------------------------------------------------------ */
/* 1.0.0 → 2.0.0                                                                   */
/* ------------------------------------------------------------------------------ */

function parseV1(files: DataFileMap) {
  const problems: string[] = [];
  const get = <T>(
    path: string,
    schema: {
      safeParse: (
        x: unknown,
      ) => { success: true; data: T } | { success: false };
    },
  ): T | null => {
    const r = schema.safeParse(files[path]);
    if (!r.success) {
      problems.push(`${path} is not a valid 1.x file`);
      return null;
    }
    return r.data;
  };
  const meta = get("meta.json", v1.metaSchema);
  const accounts = get("accounts.json", v1.accountsFileSchema);
  const categories = get("categories.json", v1.categoriesFileSchema);
  const cards = get("cards.json", v1.cardsFileSchema);
  const bills = get("bills.json", v1.billsFileSchema);
  const recurrences = get("recurrences.json", v1.recurrencesFileSchema);
  const budgets: Record<string, v1.BudgetsFile> = {};
  const transactions: Record<string, v1.TransactionsFile> = {};
  for (const path of Object.keys(files)) {
    if (BUDGET_FILE.test(path)) {
      const b = get(path, v1.budgetsFileSchema);
      if (b) budgets[path] = b;
    } else if (TRANSACTION_FILE.test(path)) {
      const t = get(path, v1.transactionsFileSchema);
      if (t) transactions[path] = t;
    } else if (
      ![
        "meta.json",
        "accounts.json",
        "categories.json",
        "cards.json",
        "bills.json",
        "recurrences.json",
      ].includes(path)
    ) {
      problems.push(`${path} is not part of the 1.x format`);
    }
  }
  if (
    problems.length > 0 ||
    !meta ||
    !accounts ||
    !categories ||
    !cards ||
    !bills ||
    !recurrences
  ) {
    throw new AppError("VALIDATION_FAILED", "Input is not valid 1.x data", {
      details: problems,
    });
  }
  return {
    meta,
    accounts,
    categories,
    cards,
    bills,
    recurrences,
    budgets,
    transactions,
  };
}

const v1ToV2: DataMigration = {
  from: "1.0.0",
  to: "2.0.0",
  description:
    "Step 02 domain models: amounts renamed and tagged with a currency, single-record transfers, financial settings file",
  migrate(files, ctx) {
    const d = parseV1(files);
    const report: MigrationStepReport = {
      from: "1.0.0",
      to: "2.0.0",
      description: this.description,
      counts: {},
      renamedFields: [
        "accounts.openingBalanceMinor → initialBalance",
        "cards.last4 → lastFourDigits",
        "cards.limitMinor → creditLimit",
        "categories.kind → type",
        "bills.amountMinor → amount",
        "recurrences.amountMinor → amount",
        "recurrences.kind → type",
        "budgets.amountMinor → amount",
        "budgets.period (YYYY-MM) → period=monthly + startDate/endDate",
        "transactions.kind → type",
        "transactions.amountMinor → amount",
        "transactions.status paid → completed",
        "meta.currency/minorUnit/timezone → settings.json",
        "meta.checksums.sumMinor → amountSum",
      ],
      defaultsApplied: [],
      merged: [],
      warnings: [],
    };
    const currency = d.meta.currency; // "ARS" — 1.x was single-currency by definition (I-02)
    const applied = (
      entity: string,
      field: string,
      value: string,
      count: number,
    ) => {
      if (count > 0)
        report.defaultsApplied.push({ entity, field, value, count });
    };

    const accounts = d.accounts.records.map(
      ({ openingBalanceMinor, ...r }) => ({
        ...r,
        institution: null,
        accountType: "other" as const,
        currency,
        initialBalance: openingBalanceMinor,
        openingDate: r.openingDate,
        status: "active" as const,
      }),
    );
    applied("accounts", "institution", "null", accounts.length);
    applied(
      "accounts",
      "accountType",
      "other (unknown in 1.x)",
      accounts.length,
    );
    applied("accounts", "currency", currency, accounts.length);
    applied("accounts", "status", "active", accounts.length);

    const categories = d.categories.records.map(({ kind, ...r }) => ({
      ...r,
      type: kind,
      parentId: null,
      icon: null,
      color: null,
      isDefault: false,
      isActive: true,
    }));
    applied("categories", "parentId/icon/color", "null", categories.length);
    applied(
      "categories",
      "isDefault/isActive",
      "false/true",
      categories.length,
    );

    const cards = d.cards.records.map(({ last4, limitMinor, ...r }) => ({
      ...r,
      accountId: null,
      cardType: "credit" as const,
      lastFourDigits: last4,
      creditLimit: limitMinor,
      currency,
      status: "active" as const,
    }));
    applied(
      "cards",
      "accountId",
      "null (1.x had no paying account; to be completed by hand)",
      cards.length,
    );
    applied(
      "cards",
      "cardType",
      "credit (1.x cards had closing and due days)",
      cards.length,
    );
    if (cards.length > 0)
      report.warnings.push(
        `${cards.length} card(s) have no paying account (accountId = null)`,
      );

    const bills = d.bills.records.map(({ amountMinor, ...r }) => ({
      ...r,
      categoryId: null,
      amount: amountMinor,
      currency,
      notes: null,
    }));
    applied("bills", "categoryId/notes", "null", bills.length);

    const recurrences = d.recurrences.records.map(
      ({ amountMinor, kind, ...r }) => ({
        ...r,
        amount: amountMinor,
        type: kind,
        currency,
        isActive: true,
      }),
    );
    applied("recurrences", "isActive", "true", recurrences.length);

    const categoryName = new Map(
      d.categories.records.map((c) => [c.id, c.name]),
    );
    const budgets: Record<string, unknown[]> = {};
    for (const [path, file] of Object.entries(d.budgets)) {
      budgets[path] = file.records.map(({ amountMinor, period, ...r }) => {
        const [y, m] = period.split("-").map(Number) as [number, number];
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return {
          ...r,
          name: categoryName.get(r.categoryId) ?? "Presupuesto",
          amount: amountMinor,
          currency,
          period: "monthly" as const,
          startDate: `${period}-01`,
          endDate: `${period}-${String(last).padStart(2, "0")}`,
        };
      });
      applied("budgets", "name", "category name", file.records.length);
    }

    // Transfers: 1.x stored two legs without direction. Never guess: require the direction.
    const legsByTransfer = new Map<
      string,
      { path: string; r: v1.Transaction }[]
    >();
    for (const [path, file] of Object.entries(d.transactions)) {
      for (const r of file.records)
        if (r.kind === "transfer" && r.transferId)
          legsByTransfer.set(r.transferId, [
            ...(legsByTransfer.get(r.transferId) ?? []),
            { path, r },
          ]);
    }
    const missing = [...legsByTransfer.keys()].filter(
      (id) => !ctx.transferDirections?.[id],
    );
    if (missing.length > 0) {
      throw new AppError(
        "MIGRATION_BLOCKED",
        `${missing.length} transfer(s) need their direction (source account); nothing was changed`,
        {
          details: missing.map(
            (id) =>
              `transferId ${id}: legs on accounts ${legsByTransfer
                .get(id)!
                .map((l) => l.r.accountId)
                .join(", ")}`,
          ),
        },
      );
    }
    const absorbed = new Set<string>();
    const survivors = new Map<string, Record<string, unknown>>();
    for (const [transferId, legs] of legsByTransfer) {
      const sourceAccount = ctx.transferDirections![transferId]!;
      const source = legs.find((l) => l.r.accountId === sourceAccount);
      const others = legs.filter((l) => l !== source);
      if (!source || others.length !== 1) {
        throw new AppError(
          "MIGRATION_BLOCKED",
          `Transfer ${transferId} must have exactly two legs and its source must be one of them`,
        );
      }
      const destination = others[0]!;
      absorbed.add(destination.r.id);
      survivors.set(source.r.id, {
        destinationAccountId: destination.r.accountId,
        legacyIds: [destination.r.id],
        rev: Math.max(source.r.rev, destination.r.rev) + 1,
      });
      report.merged.push({
        entity: "transactions",
        survivorId: source.r.id,
        absorbedIds: [destination.r.id],
        reason: `transfer ${transferId}: two 1.x legs → one 2.0 record`,
      });
    }

    const transactions: Record<string, unknown[]> = {};
    for (const [path, file] of Object.entries(d.transactions)) {
      transactions[path] = file.records
        .filter((r) => !absorbed.has(r.id))
        .map(({ kind, amountMinor, status, ...withTransferId }) => {
          const r: Omit<typeof withTransferId, "transferId"> & {
            transferId?: unknown;
          } = { ...withTransferId };
          delete r.transferId; // 1.x leg link, replaced by destinationAccountId
          return {
            ...r,
            type: kind,
            amount: amountMinor,
            currency,
            status:
              status === "paid" ? ("completed" as const) : ("pending" as const),
            destinationAccountId: null,
            notes: null,
            ...(survivors.get(r.id) ?? {}),
          };
        });
    }

    const v2: OfficialDataSet = {
      meta: {
        schema: "pfm.meta",
        schemaVersion: "2.0.0",
        dataRevision: d.meta.dataRevision + 1,
        updatedAt: ctx.now,
        appliedChangesets: d.meta.appliedChangesets,
        checksums: {},
      },
      settings: {
        ...DEFAULT_FINANCIAL_SETTINGS,
        baseCurrency: currency,
        timezone: d.meta.timezone,
      },
      accounts,
      categories,
      cards,
      bills,
      recurrences,
      budgets: budgets as OfficialDataSet["budgets"],
      transactions: transactions as OfficialDataSet["transactions"],
      goals: [],
      goalContributions: [],
    } as OfficialDataSet;
    v2.meta.checksums = computeChecksums(v2);

    const countV1 = (path: string, n: number) =>
      (report.counts[path] = { before: n, after: 0 });
    countV1("accounts.json", d.accounts.records.length);
    countV1("categories.json", d.categories.records.length);
    countV1("cards.json", d.cards.records.length);
    countV1("bills.json", d.bills.records.length);
    countV1("recurrences.json", d.recurrences.records.length);
    for (const [p, f] of Object.entries(d.budgets))
      countV1(p, f.records.length);
    for (const [p, f] of Object.entries(d.transactions))
      countV1(p, f.records.length);
    for (const [p, c] of Object.entries(v2.meta.checksums))
      report.counts[p]!.after = c.count;

    return { files: dataSetToFilesV2(v2), report };
  },
};

function dataSetToFilesV2(ds: OfficialDataSet): DataFileMap {
  const env = (schema: string, records: unknown[]) => ({
    schema,
    schemaVersion: "2.0.0",
    records,
  });
  const files: DataFileMap = {
    "meta.json": ds.meta,
    "settings.json": {
      schema: "pfm.settings",
      schemaVersion: "2.0.0",
      settings: ds.settings,
    },
    "accounts.json": env("pfm.accounts", ds.accounts),
    "categories.json": env("pfm.categories", ds.categories),
    "cards.json": env("pfm.cards", ds.cards),
    "bills.json": env("pfm.bills", ds.bills),
    "recurrences.json": env("pfm.recurrences", ds.recurrences),
  };
  for (const [p, r] of Object.entries(ds.budgets))
    files[p] = {
      schema: "pfm.budgets",
      schemaVersion: "2.0.0",
      period: BUDGET_FILE.exec(p)![1],
      records: r,
    };
  for (const [p, r] of Object.entries(ds.transactions))
    files[p] = {
      schema: "pfm.transactions",
      schemaVersion: "2.0.0",
      period: TRANSACTION_FILE.exec(p)![2],
      records: r,
    };
  return files;
}

/* ------------------------------------------------------------------------------ */
/* Registry and runner                                                             */
/* ------------------------------------------------------------------------------ */

export const DATA_MIGRATIONS: readonly DataMigration[] = [v1ToV2];

export function detectSchemaVersion(files: DataFileMap): string {
  const version = (
    files["meta.json"] as { schemaVersion?: unknown } | undefined
  )?.schemaVersion;
  if (typeof version !== "string")
    throw new AppError("VALIDATION_FAILED", "meta.json has no schemaVersion");
  const others = Object.entries(files)
    .map(
      ([p, c]) =>
        [p, (c as { schemaVersion?: unknown } | null)?.schemaVersion] as const,
    )
    .filter(([, v]) => v !== version);
  if (others.length > 0)
    throw new AppError("VALIDATION_FAILED", "Files disagree on schemaVersion", {
      details: others.map(([p, v]) => `${p}: ${String(v)}`),
    });
  return version;
}

function countRecords(files: DataFileMap): number {
  return Object.values(files).reduce<number>(
    (n, c) =>
      n +
      (Array.isArray((c as { records?: unknown }).records)
        ? (c as { records: unknown[] }).records.length
        : 0),
    0,
  );
}

/**
 * Migrates a data file map to the current schemaVersion. Never downgrades, never discards,
 * validates the result; throws and returns nothing on any problem.
 */
export function migrateDataFiles(
  files: DataFileMap,
  ctx: MigrationContext,
): { files: DataFileMap; report: MigrationReport } {
  const from = detectSchemaVersion(files);
  const target = SCHEMA_VERSION;
  const kind = classifySchemaVersion(from);
  if (kind === "unsupported-future" || compareSemVer(from, target) > 0) {
    throw new AppError(
      "INCOMPATIBLE_SCHEMA_VERSION",
      `Data is ${from}, newer than ${target}: never downgraded`,
    );
  }
  const recordsBefore = countRecords(files);
  if (kind === "current") {
    return {
      files,
      report: {
        from,
        to: from,
        changed: false,
        steps: [],
        recordsBefore,
        recordsAfter: recordsBefore,
        recordsAbsorbed: 0,
      },
    };
  }
  let current = files;
  let version = from;
  const steps: MigrationStepReport[] = [];
  while (classifySchemaVersion(version) === "needs-migration") {
    const step = DATA_MIGRATIONS.find(
      (m) => m.from.split(".")[0] === version.split(".")[0],
    );
    if (!step)
      throw new AppError("MIGRATION_BLOCKED", `No migration from ${version}`);
    const out = step.migrate(current, ctx);
    current = out.files;
    version = step.to;
    steps.push(out.report);
  }
  const recordsAfter = countRecords(current);
  const recordsAbsorbed = steps.reduce(
    (n, s) => n + s.merged.reduce((m, x) => m + x.absorbedIds.length, 0),
    0,
  );
  if (recordsAfter + recordsAbsorbed !== recordsBefore) {
    throw new AppError(
      "MIGRATION_BLOCKED",
      `Record count mismatch: ${recordsBefore} before, ${recordsAfter} after + ${recordsAbsorbed} absorbed`,
    );
  }
  const { issues } = validateDataFiles(current);
  if (hasErrors(issues)) {
    throw new AppError(
      "MIGRATION_BLOCKED",
      "Migrated data does not pass validation; nothing was changed",
      {
        details: issues
          .filter((i) => i.severity === "error")
          .map((i) => `[${i.layer}] ${i.file}: ${i.message}`),
      },
    );
  }
  return {
    files: current,
    report: {
      from,
      to: version,
      changed: true,
      steps,
      recordsBefore,
      recordsAfter,
      recordsAbsorbed,
    },
  };
}
