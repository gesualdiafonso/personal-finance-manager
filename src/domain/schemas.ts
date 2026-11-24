import { z } from "zod";
import { isLocalDate } from "@/lib/formatting/date";
import { currencyCodeSchema } from "./currency";

/**
 * Domain models, schemaVersion 2.0.0 (Step 02). Zod is the single source of truth:
 * TypeScript types are inferred from these schemas and schemas/*.schema.json is generated
 * from them (`npm run schemas:build`). See docs/architecture/domain-models.md.
 *
 * - Every monetary field is an integer number of minor units (centavos) and every record
 *   carries its ISO 4217 currency (D2-01, D2-02).
 * - Objects are STRICT: unknown fields are rejected, so nothing can be smuggled in
 *   (for example full card numbers, CVV or credentials).
 * - Control fields come from the approved data architecture (rev for conflicts, deletedAt
 *   for tombstones, deviceId for provenance).
 * - Derived values (Account.currentBalance, Recurrence.nextOccurrence) are NOT persisted;
 *   they are computed by src/domain/rules (D2-10).
 */

/**
 * 2.1.0 (Step 03, D3-01): adds cardType "prepaid". Additive only: every 2.0.x file is valid
 * 2.1.0 data and is read as-is; new exports are written as 2.1.0.
 */
export const SCHEMA_VERSION = "2.1.0";

/* ----------------------------------------------------------------------------- */
/* Primitives                                                                    */
/* ----------------------------------------------------------------------------- */

export const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "Expected semantic version x.y.z");
export const uuid = z.uuid();
export const isoDateTime = z.iso.datetime({ offset: true });
export const localDate = z.iso.date().refine(isLocalDate, "Invalid calendar date");
export const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");
export const year = z.string().regex(/^\d{4}$/, "Expected YYYY");

/** Integer minor units within the safe integer range. Decimals are rejected (I-01). */
export const amountMinor = z
  .number()
  .refine(Number.isInteger, "Monetary amounts must be integer minor units (cents); decimals are rejected")
  .refine(Number.isSafeInteger, "Outside the safe integer range");
export const positiveAmount = amountMinor.refine((v) => v > 0, "Must be greater than zero");
export const nonNegativeAmount = amountMinor.refine((v) => v >= 0, "Must be zero or greater");

/** 12–19 consecutive digits look like a payment card number (PAN): never stored. */
const CARD_NUMBER_PATTERN = /\d(?:[ -]?\d){11,18}/;
const safeText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((v) => !CARD_NUMBER_PATTERN.test(v), "Must not contain a card number");
const requiredText = (max: number) => safeText(max).refine((v) => v.trim().length > 0, "Required");

export const controlFields = {
  id: uuid,
  rev: z.number().int().min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.nullable(),
  deviceId: z.string().min(1).max(64),
} as const;
export const CONTROL_FIELDS = Object.keys(controlFields) as (keyof typeof controlFields)[];

/* ----------------------------------------------------------------------------- */
/* Entities                                                                      */
/* ----------------------------------------------------------------------------- */

export const ACCOUNT_TYPES = ["checking", "savings", "cash", "investment", "other"] as const;
export const accountSchema = z.strictObject({
  ...controlFields,
  name: requiredText(80),
  institution: safeText(80).nullable(),
  accountType: z.enum(ACCOUNT_TYPES),
  currency: currencyCodeSchema,
  /** May be negative: an account can start overdrawn (the only negative stored amount). */
  initialBalance: amountMinor,
  /** Kept from schema 1.x (openingDate); optional, informational. */
  openingDate: localDate.nullable(),
  status: z.enum(["active", "archived"]),
});

/** Debit and prepaid cards behave alike in the model: no limit, no statement days (D3-01). */
export const CARD_TYPES = ["credit", "debit", "prepaid"] as const;
export const cardSchema = z
  .strictObject({
    ...controlFields,
    /** Paying account. Nullable only for cards migrated from 1.x, which had no account link. */
    accountId: uuid.nullable(),
    name: requiredText(60),
    cardType: z.enum(CARD_TYPES),
    lastFourDigits: z.string().regex(/^\d{4}$/, "Exactly 4 digits").nullable(),
    creditLimit: nonNegativeAmount.nullable(),
    closingDay: z.number().int().min(1).max(31).nullable(),
    dueDay: z.number().int().min(1).max(31).nullable(),
    currency: currencyCodeSchema,
    status: z.enum(["active", "inactive"]),
  })
  .superRefine((c, ctx) => {
    if (c.cardType === "credit" && (c.closingDay === null || c.dueDay === null)) {
      ctx.addIssue({ code: "custom", path: ["closingDay"], message: "A credit card needs closingDay and dueDay" });
    }
    if (c.cardType !== "credit" && (c.creditLimit !== null || c.closingDay !== null || c.dueDay !== null)) {
      ctx.addIssue({ code: "custom", path: ["cardType"], message: "Only credit cards have a credit limit, closing day and due day" });
    }
  });

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export const TRANSACTION_STATUSES = ["pending", "completed", "cancelled"] as const;
export const transactionSchema = z
  .strictObject({
    ...controlFields,
    type: z.enum(TRANSACTION_TYPES),
    description: requiredText(140),
    /** Always positive: the direction comes from `type` (and, for transfers, the two accounts). */
    amount: positiveAmount,
    currency: currencyCodeSchema,
    categoryId: uuid.nullable(),
    accountId: uuid,
    destinationAccountId: uuid.nullable(),
    cardId: uuid.nullable(),
    date: localDate,
    status: z.enum(TRANSACTION_STATUSES),
    notes: safeText(500).nullable(),
    billId: uuid.nullable(),
    recurrenceId: uuid.nullable(),
    /** Ids of 1.x records merged into this one by a migration (provenance; never reused). */
    legacyIds: z.array(uuid).optional(),
  })
  .superRefine((t, ctx) => {
    if (t.type === "transfer") {
      if (t.destinationAccountId === null) ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "A transfer needs destinationAccountId" });
      if (t.destinationAccountId === t.accountId) ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "A transfer must move money between two different accounts" });
      if (t.categoryId !== null) ctx.addIssue({ code: "custom", path: ["categoryId"], message: "A transfer has no category (it is neither income nor expense)" });
      if (t.cardId !== null) ctx.addIssue({ code: "custom", path: ["cardId"], message: "A transfer cannot be charged to a card" });
    } else if (t.destinationAccountId !== null) {
      ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Only transfers have destinationAccountId" });
    }
    if (t.type === "income" && t.cardId !== null) ctx.addIssue({ code: "custom", path: ["cardId"], message: "Income cannot be charged to a card" });
  });

export const CATEGORY_MAX_DEPTH = 2;
export const categorySchema = z
  .strictObject({
    ...controlFields,
    name: requiredText(60),
    type: z.enum(["income", "expense"]),
    parentId: uuid.nullable(),
    /** Stored for completeness, NEVER rendered: the Design System forbids category icons (P-08, D2-09). */
    icon: z.string().regex(/^[a-z0-9-]{1,40}$/, "Icon name in kebab-case").nullable(),
    /** Stored for completeness, NEVER rendered as decoration (O-11, D2-09). */
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Hex colour #RRGGBB").nullable(),
    isDefault: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((c) => c.parentId !== c.id, { path: ["parentId"], message: "A category cannot be its own parent" });

export const billSchema = z.strictObject({
  ...controlFields,
  name: requiredText(80),
  categoryId: uuid.nullable(),
  amount: positiveAmount,
  currency: currencyCodeSchema,
  dueDate: localDate,
  accountId: uuid.nullable(),
  status: z.enum(["pending", "paid", "cancelled"]),
  notes: safeText(500).nullable(),
});

export const RECURRENCE_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export const recurrenceSchema = z
  .strictObject({
    ...controlFields,
    description: requiredText(120),
    amount: positiveAmount,
    currency: currencyCodeSchema,
    type: z.enum(["income", "expense"]),
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    startDate: localDate,
    endDate: localDate.nullable(),
    categoryId: uuid.nullable(),
    accountId: uuid,
    isActive: z.boolean(),
  })
  .refine((r) => r.endDate === null || r.endDate >= r.startDate, { path: ["endDate"], message: "endDate is before startDate" });

export const BUDGET_PERIODS = ["monthly", "yearly", "custom"] as const;
export const budgetSchema = z
  .strictObject({
    ...controlFields,
    name: requiredText(80),
    categoryId: uuid,
    amount: nonNegativeAmount,
    currency: currencyCodeSchema,
    period: z.enum(BUDGET_PERIODS),
    startDate: localDate,
    endDate: localDate,
  })
  .superRefine((b, ctx) => {
    if (b.endDate < b.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate is before startDate" });
    const [y, m] = b.startDate.split("-").map(Number) as [number, number];
    if (b.period === "monthly") {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const expectedEnd = `${b.startDate.slice(0, 8)}${String(last).padStart(2, "0")}`;
      if (!b.startDate.endsWith("-01") || b.endDate !== expectedEnd) {
        ctx.addIssue({ code: "custom", path: ["period"], message: "A monthly budget runs from the 1st to the last day of one month" });
      }
    }
    if (b.period === "yearly" && (b.startDate !== `${y}-01-01` || b.endDate !== `${y}-12-31`)) {
      ctx.addIssue({ code: "custom", path: ["period"], message: "A yearly budget runs from 1 January to 31 December" });
    }
  });

/* ----------------------------------------------------------------------------- */
/* Financial settings (separate from UI preferences in LocalStorage)             */
/* ----------------------------------------------------------------------------- */

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const financialSettingsSchema = z.strictObject({
  baseCurrency: currencyCodeSchema,
  timezone: z.string().refine(isTimeZone, "Unknown IANA time zone"),
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, "Expected a BCP 47 locale like es-AR"),
  firstDayOfWeek: z.enum(["monday", "sunday"]),
  numberFormat: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, "Expected a BCP 47 locale like es-AR"),
});

/* ----------------------------------------------------------------------------- */
/* Files                                                                         */
/* ----------------------------------------------------------------------------- */

export const checksumSchema = z.strictObject({ count: z.number().int().min(0), amountSum: amountMinor });

export const metaSchema = z.strictObject({
  schema: z.literal("pfm.meta"),
  schemaVersion: semver,
  dataRevision: z.number().int().min(0),
  updatedAt: isoDateTime,
  appliedChangesets: z.array(uuid),
  /** Per data file: number of records and sum of `amount` fields (invariant I-10). */
  checksums: z.record(z.string(), checksumSchema),
});

export const settingsFileSchema = z.strictObject({
  schema: z.literal("pfm.settings"),
  schemaVersion: semver,
  settings: financialSettingsSchema,
});

function envelope<S extends string, R extends z.ZodType>(schema: S, record: R) {
  return z.strictObject({ schema: z.literal(schema), schemaVersion: semver, records: z.array(record) });
}

export const accountsFileSchema = envelope("pfm.accounts", accountSchema);
export const categoriesFileSchema = envelope("pfm.categories", categorySchema);
export const cardsFileSchema = envelope("pfm.cards", cardSchema);
export const billsFileSchema = envelope("pfm.bills", billSchema);
export const recurrencesFileSchema = envelope("pfm.recurrences", recurrenceSchema);
export const budgetsFileSchema = z.strictObject({
  schema: z.literal("pfm.budgets"),
  schemaVersion: semver,
  period: year,
  records: z.array(budgetSchema),
});
export const transactionsFileSchema = z.strictObject({
  schema: z.literal("pfm.transactions"),
  schemaVersion: semver,
  period: yearMonth,
  records: z.array(transactionSchema),
});

/* ----------------------------------------------------------------------------- */
/* Types                                                                         */
/* ----------------------------------------------------------------------------- */

export type Account = z.infer<typeof accountSchema>;
export type Card = z.infer<typeof cardSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Bill = z.infer<typeof billSchema>;
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type FinancialSettings = z.infer<typeof financialSettingsSchema>;
export type Meta = z.infer<typeof metaSchema>;
export type ControlFields = { [K in keyof typeof controlFields]: z.infer<(typeof controlFields)[K]> };

export const ENTITY_SCHEMAS = {
  accounts: accountSchema,
  cards: cardSchema,
  categories: categorySchema,
  transactions: transactionSchema,
  bills: billSchema,
  recurrences: recurrenceSchema,
  budgets: budgetSchema,
} as const;
export type EntityName = keyof typeof ENTITY_SCHEMAS;
export const ENTITY_NAMES = Object.keys(ENTITY_SCHEMAS) as EntityName[];
export type EntityOf<N extends EntityName> = z.infer<(typeof ENTITY_SCHEMAS)[N]>;

/** Generated JSON Schema files (Step 02 names). One per document type. */
export const JSON_SCHEMA_EXPORTS = {
  "meta.schema.json": metaSchema,
  "settings.schema.json": settingsFileSchema,
  "account.schema.json": accountsFileSchema,
  "card.schema.json": cardsFileSchema,
  "category.schema.json": categoriesFileSchema,
  "transaction.schema.json": transactionsFileSchema,
  "bill.schema.json": billsFileSchema,
  "recurrence.schema.json": recurrencesFileSchema,
  "budget.schema.json": budgetsFileSchema,
} as const;
