import { z } from "zod";
import { isLocalDate } from "@/lib/formatting/date";

/**
 * FROZEN copy of the schemaVersion 1.x schemas (Step 01). Used only to validate v1 input
 * before migrating it to the current version. Never edit: v1 is a closed format.
 *
 * Original description: Zod schemas for the official JSON data (docs/architecture/data.md).
 * These are the single source of truth: schemas/*.schema.json are GENERATED from them
 * (`npm run schemas:build`) and `npm run schemas:check` fails on drift.
 *
 * Control fields and envelopes follow the approved data architecture (Step 00, D6).
 * Entity fields beyond the control fields are PROVISIONAL: the business rules for
 * cards, bills and recurrences are open (OD-8) and may be affected by brief §11–14.
 */

export const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "Expected semantic version x.y.z");
export const uuid = z.uuid();
export const isoDateTime = z.iso.datetime({ offset: true });
export const localDate = z.iso.date().refine(isLocalDate, "Invalid calendar date");
export const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");
export const year = z.string().regex(/^\d{4}$/, "Expected YYYY");

/** Integer minor units (centavos), within the safe integer range (I-01). */
export const minor = z.number().int().refine(Number.isSafeInteger, "Outside the safe integer range");
export const positiveMinor = minor.refine((v) => v > 0, "Must be greater than zero");
export const nonNegativeMinor = minor.refine((v) => v >= 0, "Must be zero or greater");

export const recordControl = z.object({
  id: uuid,
  rev: z.number().int().min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.nullable(),
  deviceId: z.string().min(1).max(64),
});

const nullableId = uuid.nullable();

export const accountSchema = recordControl.extend({
  name: z.string().min(1).max(80),
  /** May be negative (overdraft). */
  openingBalanceMinor: minor,
  openingDate: localDate,
});

export const categorySchema = recordControl.extend({
  name: z.string().min(1).max(60),
  kind: z.enum(["expense", "income"]),
});

export const cardSchema = recordControl.extend({
  name: z.string().min(1).max(60),
  last4: z.string().regex(/^\d{4}$/).nullable(),
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  limitMinor: nonNegativeMinor.nullable(),
});

export const billSchema = recordControl.extend({
  name: z.string().min(1).max(80),
  amountMinor: positiveMinor,
  dueDate: localDate,
  status: z.enum(["pending", "paid"]),
  accountId: nullableId,
});

export const recurrenceSchema = recordControl.extend({
  description: z.string().min(1).max(120),
  kind: z.enum(["expense", "income"]),
  amountMinor: positiveMinor,
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  startDate: localDate,
  endDate: localDate.nullable(),
  accountId: uuid,
  categoryId: nullableId,
});

export const budgetSchema = recordControl.extend({
  period: yearMonth,
  categoryId: uuid,
  amountMinor: nonNegativeMinor,
});

export const transactionSchema = recordControl.extend({
  kind: z.enum(["expense", "income", "transfer"]),
  date: localDate,
  description: z.string().min(1).max(140),
  amountMinor: positiveMinor,
  accountId: uuid,
  categoryId: nullableId,
  status: z.enum(["paid", "pending"]),
  cardId: nullableId,
  billId: nullableId,
  recurrenceId: nullableId,
  transferId: nullableId,
});

export const checksumSchema = z.object({ count: z.number().int().min(0), sumMinor: minor });

export const metaSchema = z.object({
  schema: z.literal("pfm.meta"),
  schemaVersion: semver,
  dataRevision: z.number().int().min(0),
  currency: z.literal("ARS"),
  minorUnit: z.literal(2),
  timezone: z.literal("America/Argentina/Buenos_Aires"),
  updatedAt: isoDateTime,
  appliedChangesets: z.array(uuid),
  /** Per data file: number of records and sum of amountMinor (invariant I-10). */
  checksums: z.record(z.string(), checksumSchema),
});

function envelope<S extends string, R extends z.ZodType>(schema: S, record: R) {
  return z.object({ schema: z.literal(schema), schemaVersion: semver, records: z.array(record) });
}

export const accountsFileSchema = envelope("pfm.accounts", accountSchema);
export const categoriesFileSchema = envelope("pfm.categories", categorySchema);
export const cardsFileSchema = envelope("pfm.cards", cardSchema);
export const billsFileSchema = envelope("pfm.bills", billSchema);
export const recurrencesFileSchema = envelope("pfm.recurrences", recurrenceSchema);
export const budgetsFileSchema = envelope("pfm.budgets", budgetSchema).extend({ period: year });
export const transactionsFileSchema = envelope("pfm.transactions", transactionSchema).extend({ period: yearMonth });

export type Meta = z.infer<typeof metaSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Card = z.infer<typeof cardSchema>;
export type Bill = z.infer<typeof billSchema>;
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type BudgetsFile = z.infer<typeof budgetsFileSchema>;
export type TransactionsFile = z.infer<typeof transactionsFileSchema>;

