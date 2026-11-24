import { z } from "zod";
import { currencyCodeSchema } from "@/domain/currency";
import {
  REPORT_COMPARISONS,
  REPORT_GRANULARITIES,
  REPORT_TYPES,
} from "@/domain/rules/reports";
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "@/domain/schemas";
import { APP_CONFIG } from "@/lib/config/app";
import { toIsoWithOffset } from "@/lib/formatting/date";
import type { Report } from "./build-report";

/**
 * Report exports (Step 08, decision D8-05). Everything is generated in the browser from the
 * report already on screen and handed to the user as a download: nothing is sent anywhere,
 * nothing is written to public/ or to the repository.
 *
 * SECURITY: these files are PLAINTEXT. They contain financial data and are NOT encrypted (the
 * encrypted export of docs/architecture/data-security.md §A is a different, not yet built,
 * feature). The interface says so next to every export button.
 *
 * Amounts are integers in minor units (centavos) with their currency, as in the app; the CSV
 * also carries a decimal column for spreadsheets.
 */

export const REPORT_FORMAT = "pfm.report";
export const REPORT_FORMAT_VERSION = 1;

const minor = z.number().int();
const date = z.iso.date();
const range = z.strictObject({ from: date, to: date });
const flow = z.strictObject({ income: minor, expenses: minor, result: minor });

export const reportDocumentSchema = z.strictObject({
  format: z.literal(REPORT_FORMAT),
  formatVersion: z.literal(REPORT_FORMAT_VERSION),
  generatedAt: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1),
  amountUnit: z.literal("minor"),
  containsFinancialData: z.literal(true),
  encrypted: z.literal(false),
  period: range.extend({
    granularity: z.enum(REPORT_GRANULARITIES),
    status: z.enum(["closed", "inProgress", "future"]),
  }),
  comparison: range.extend({ mode: z.enum(REPORT_COMPARISONS) }),
  filters: z.strictObject({
    categoryId: z.uuid().nullable(),
    category: z.string().nullable(),
    accountId: z.uuid().nullable(),
    account: z.string().nullable(),
    type: z.enum(REPORT_TYPES),
  }),
  baseCurrency: currencyCodeSchema,
  currencies: z.array(currencyCodeSchema),
  notes: z.array(z.string()),
  incomeExpenses: z.array(
    z.strictObject({
      currency: currencyCodeSchema,
      current: flow.extend({ pendingIncome: minor, pendingExpenses: minor }),
      previous: flow,
      movements: z.number().int().min(0),
    }),
  ),
  monthly: z.array(
    z.strictObject({
      currency: currencyCodeSchema,
      months: z.array(flow.extend({ month: z.string().regex(/^\d{4}-\d{2}$/) })),
    }),
  ),
  categories: z.array(
    z.strictObject({
      currency: currencyCodeSchema,
      kind: z.enum(["income", "expense"]),
      total: minor,
      previousTotal: minor,
      rows: z.array(
        z.strictObject({
          categoryId: z.uuid().nullable(),
          category: z.string(),
          amount: minor,
          previous: minor,
          shareBasisPoints: z.number().int().min(0).max(10_000),
        }),
      ),
    }),
  ),
  cashFlow: z.array(
    z.strictObject({
      currency: currencyCodeSchema,
      opening: minor,
      closing: minor,
      inflow: minor,
      outflow: minor,
      transfersIn: minor,
      transfersOut: minor,
      net: minor,
      positivePeriods: z.number().int().min(0),
      negativePeriods: z.number().int().min(0),
      buckets: z.array(
        range.extend({ inflow: minor, outflow: minor, transfersIn: minor, transfersOut: minor, net: minor, balance: minor.nullable() }),
      ),
    }),
  ),
  expected: z.array(
    z.strictObject({ currency: currencyCodeSchema, pendingIncome: minor, pendingExpenses: minor, billsDue: minor, recurring: minor }),
  ),
  accounts: z.array(
    z.strictObject({
      accountId: z.uuid(),
      account: z.string(),
      currency: currencyCodeSchema,
      opening: minor,
      closing: minor,
      income: minor,
      expenses: minor,
      creditCardPurchases: minor,
      transfersIn: minor,
      transfersOut: minor,
      operations: z.strictObject({ income: minor, expense: minor, transfer: minor }),
      pendingOperations: minor,
    }),
  ),
  cards: z.array(
    z.strictObject({
      cardId: z.uuid(),
      card: z.string(),
      cardType: z.enum(["credit", "debit", "prepaid"]),
      currency: currencyCodeSchema,
      purchases: minor,
      purchasesCount: minor,
      pendingPurchases: minor,
      previousPurchases: minor,
      committed: minor.nullable(),
      creditLimit: minor.nullable(),
      utilizationPercent: minor.nullable(),
    }),
  ),
  budgets: z.array(
    z.strictObject({
      budgetId: z.uuid(),
      budget: z.string(),
      category: z.string().nullable(),
      currency: currencyCodeSchema,
      from: date,
      to: date,
      budgeted: minor,
      spent: minor,
      pending: minor,
      usedPercent: minor.nullable(),
      state: z.enum(["within", "attention", "near", "exceeded"]),
      previousSpent: minor.nullable(),
      running: z.boolean(),
    }),
  ),
  goals: z.array(
    z.strictObject({
      goalId: z.uuid(),
      goal: z.string(),
      currency: currencyCodeSchema,
      target: minor,
      saved: minor,
      remaining: minor,
      percent: minor,
      contributedInPeriod: minor,
      pacePerMonth: minor.nullable(),
      estimatedDate: date.nullable(),
      targetDate: date.nullable(),
    }),
  ),
  transactions: z.array(
    z.strictObject({
      id: z.uuid(),
      date,
      type: z.enum(TRANSACTION_TYPES),
      status: z.enum(TRANSACTION_STATUSES),
      description: z.string(),
      category: z.string().nullable(),
      account: z.string().nullable(),
      destinationAccount: z.string().nullable(),
      card: z.string().nullable(),
      currency: currencyCodeSchema,
      amount: minor,
    }),
  ),
});
export type ReportDocument = z.infer<typeof reportDocumentSchema>;

/** Texts written into the files (Spanish, like the interface). */
export const EXPORT_NOTES = {
  sensitive: "Contiene datos financieros. Generado en este dispositivo; el archivo no está cifrado.",
  rules:
    "Importes en centavos (unidades mínimas) y por moneda; ARS y USD nunca se suman ni se convierten. Ingresos y gastos: solo movimientos completados; transferencias, cancelados y aportes a metas no cuentan.",
  partial: "El período no terminó: las cifras todavía pueden cambiar.",
  pending: "Hay movimientos pendientes en el período: se informan aparte y no están en los totales.",
  narrowed: "Filtro de categoría o tipo activo: cuentas, flujo de caja, presupuestos y metas no lo aplican.",
  noCategory: "Sin categoría",
} as const;

const status = (r: Report) => (r.timing === "past" ? "closed" : r.timing === "current" ? "inProgress" : "future");

export function reportNotes(r: Report): string[] {
  return [
    EXPORT_NOTES.sensitive,
    EXPORT_NOTES.rules,
    ...(r.reliability.partial ? [EXPORT_NOTES.partial] : []),
    ...(r.reliability.pending ? [EXPORT_NOTES.pending] : []),
    ...(r.reliability.narrowed ? [EXPORT_NOTES.narrowed] : []),
  ];
}

/** The structured, schema-validated JSON document of a report. */
export function reportDocument(r: Report, now: Date = new Date()): ReportDocument {
  const { lookups } = r;
  const doc: ReportDocument = {
    format: REPORT_FORMAT,
    formatVersion: REPORT_FORMAT_VERSION,
    generatedAt: toIsoWithOffset(now),
    timeZone: APP_CONFIG.timeZone,
    amountUnit: "minor",
    containsFinancialData: true,
    encrypted: false,
    period: { ...r.range, granularity: r.filters.granularity, status: status(r) },
    comparison: { ...r.previousRange, mode: r.filters.comparison },
    filters: {
      categoryId: r.filters.categoryId,
      category: lookups.category(r.filters.categoryId),
      accountId: r.filters.accountId,
      account: lookups.account(r.filters.accountId),
      type: r.filters.type,
    },
    baseCurrency: r.baseCurrency,
    currencies: r.currencies,
    notes: reportNotes(r),
    incomeExpenses: r.incomeExpenses.map((x) => ({
      currency: x.currency,
      current: {
        income: x.current.income,
        expenses: x.current.expenses,
        result: x.current.result,
        pendingIncome: x.current.pendingIncome,
        pendingExpenses: x.current.pendingExpenses,
      },
      previous: { income: x.previous.income, expenses: x.previous.expenses, result: x.previous.result },
      movements: x.movements,
    })),
    monthly: r.monthly.map((m) => ({
      currency: m.currency,
      months: m.points.map((p) => ({ month: p.from.slice(0, 7), income: p.income, expenses: p.expenses, result: p.result })),
    })),
    categories: r.categories
      .filter((c) => c.total > 0 || c.previousTotal > 0)
      .map((c) => ({
        currency: c.currency,
        kind: c.kind,
        total: c.total,
        previousTotal: c.previousTotal,
        rows: c.rows.map((row) => ({
          categoryId: row.categoryId,
          category: lookups.category(row.categoryId) ?? EXPORT_NOTES.noCategory,
          amount: row.amount,
          previous: row.previous,
          shareBasisPoints: row.share,
        })),
      })),
    cashFlow: r.cashFlow.map((c) => ({
      currency: c.currency,
      opening: c.opening,
      closing: c.closing,
      inflow: c.inflow,
      outflow: c.outflow,
      transfersIn: c.transfersIn,
      transfersOut: c.transfersOut,
      net: c.net,
      positivePeriods: c.positive,
      negativePeriods: c.negative,
      buckets: c.points.map((p) => ({ ...p })),
    })),
    expected: r.expected.map((e) => ({ ...e })),
    accounts: r.accounts.map((a) => ({
      accountId: a.account.id,
      account: a.account.name,
      currency: a.account.currency,
      opening: a.opening,
      closing: a.closing,
      income: a.income,
      expenses: a.expenses,
      creditCardPurchases: a.creditPurchases,
      transfersIn: a.transfersIn,
      transfersOut: a.transfersOut,
      operations: { ...a.operations },
      pendingOperations: a.pending,
    })),
    cards: r.cards.map((c) => ({
      cardId: c.card.id,
      card: c.card.name,
      cardType: c.card.cardType,
      currency: c.card.currency,
      purchases: c.purchases,
      purchasesCount: c.purchasesCount,
      pendingPurchases: c.pendingPurchases,
      previousPurchases: c.previousPurchases,
      committed: c.committed,
      creditLimit: c.card.creditLimit,
      utilizationPercent: c.utilization,
    })),
    budgets: r.budgets.rows.map((b) => ({
      budgetId: b.budget.id,
      budget: b.budget.name,
      category: b.category?.name ?? null,
      currency: b.budget.currency,
      from: b.budget.startDate,
      to: b.budget.endDate,
      budgeted: b.budget.amount,
      spent: b.usage.spent,
      pending: b.usage.pending,
      usedPercent: b.usage.percent,
      state: b.usage.state,
      previousSpent: b.previousSpent,
      running: b.running,
    })),
    goals: r.goals.map((g) => ({
      goalId: g.goal.id,
      goal: g.goal.name,
      currency: g.goal.currency,
      target: g.progress.target,
      saved: g.progress.saved,
      remaining: g.progress.remaining,
      percent: g.progress.percent,
      contributedInPeriod: g.contributedInRange,
      pacePerMonth: g.pacePerMonth,
      estimatedDate: g.estimatedDate,
      targetDate: g.goal.targetDate,
    })),
    transactions: r.transactions.map((t) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      status: t.status,
      description: t.description,
      category: lookups.category(t.categoryId),
      account: lookups.account(t.accountId),
      destinationAccount: lookups.account(t.destinationAccountId),
      card: lookups.card(t.cardId),
      currency: t.currency,
      amount: t.amount,
    })),
  };
  return reportDocumentSchema.parse(doc);
}

export function reportJson(r: Report, now?: Date): string {
  return `${JSON.stringify(reportDocument(r, now), null, 2)}\n`;
}

/* ------------------------------------------------------------------------------ */
/* CSV                                                                              */
/* ------------------------------------------------------------------------------ */

/** UTF-8 byte order mark: Excel then reads accents and "ñ" correctly. */
export const BOM = "﻿";
/** Semicolon: the list separator of Excel in es-AR, where the comma is the decimal mark. */
export const CSV_SEPARATOR = ";";

/** Minor units → "1234,56" / "-1234,56": no thousands separator, comma decimal (es-AR Excel). */
export function csvDecimal(minorUnits: number): string {
  const sign = minorUnits < 0 ? "-" : "";
  const abs = Math.abs(minorUnits);
  return `${sign}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Quotes a text cell when needed and neutralises spreadsheet formulas: a text starting with
 * = + - @ (or a tab / carriage return) is prefixed with an apostrophe, so a description can
 * never run as a formula in Excel (CSV injection). Numbers are written by csvDecimal/String.
 */
export function csvText(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[";\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

type Cell = { text: string | null } | { minor: number } | { int: number | null };
const cell = (c: Cell): string =>
  "text" in c ? csvText(c.text) : "minor" in c ? csvDecimal(c.minor) : c.int === null ? "" : String(c.int);

function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header.map((h) => csvText(h)).join(CSV_SEPARATOR), ...rows.map((r) => r.map(cell).join(CSV_SEPARATOR))];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

const TYPE = { income: "Ingreso", expense: "Gasto", transfer: "Transferencia" } as const;
const STATUS = { completed: "Completada", pending: "Pendiente", cancelled: "Cancelada" } as const;

/** One row per movement of the report (filters and range applied; cancelled excluded). */
export function transactionsCsv(r: Report): string {
  const { lookups } = r;
  return toCsv(
    ["Fecha", "Tipo", "Estado", "Descripción", "Categoría", "Cuenta", "Cuenta destino", "Tarjeta", "Moneda", "Importe", "Importe (centavos)"],
    r.transactions.map((t) => [
      { text: t.date },
      { text: TYPE[t.type] },
      { text: STATUS[t.status] },
      { text: t.description },
      { text: lookups.category(t.categoryId) },
      { text: lookups.account(t.accountId) },
      { text: lookups.account(t.destinationAccountId) },
      { text: lookups.card(t.cardId) },
      { text: t.currency },
      // Signed as it affects the result: income positive, expense negative, transfer unsigned.
      { minor: t.type === "expense" ? -t.amount : t.amount },
      { int: t.type === "expense" ? -t.amount : t.amount },
    ]),
  );
}

/** The aggregated figures of every section, one row per figure, always with its currency. */
export function summaryCsv(r: Report): string {
  const rows: Cell[][] = [];
  const add = (section: string, currency: string, concept: string, detail: string | null, amount: number | null, previous: number | null = null, share: number | null = null) =>
    rows.push([
      { text: section },
      { text: currency },
      { text: concept },
      { text: detail },
      amount === null ? { text: "" } : { minor: amount },
      { int: amount },
      previous === null ? { text: "" } : { minor: previous },
      { int: previous },
      share === null ? { text: "" } : { text: `${Math.trunc(share / 100)},${String(share % 100).padStart(2, "0")}` },
    ]);
  for (const x of r.incomeExpenses) {
    add("Ingresos y gastos", x.currency, "Ingresos", null, x.current.income, x.previous.income);
    add("Ingresos y gastos", x.currency, "Gastos", null, x.current.expenses, x.previous.expenses);
    add("Ingresos y gastos", x.currency, "Resultado", null, x.current.result, x.previous.result);
    add("Ingresos y gastos", x.currency, "Ingresos pendientes (no incluidos)", null, x.current.pendingIncome);
    add("Ingresos y gastos", x.currency, "Gastos pendientes (no incluidos)", null, x.current.pendingExpenses);
  }
  for (const m of r.monthly)
    for (const p of m.points) {
      if (p.income === 0 && p.expenses === 0) continue;
      add("Evolución mensual", m.currency, "Ingresos", p.from.slice(0, 7), p.income);
      add("Evolución mensual", m.currency, "Gastos", p.from.slice(0, 7), p.expenses);
    }
  for (const c of r.categories)
    for (const row of c.rows)
      add(
        c.kind === "expense" ? "Gastos por categoría" : "Ingresos por categoría",
        c.currency,
        r.lookups.category(row.categoryId) ?? EXPORT_NOTES.noCategory,
        null,
        row.amount,
        row.previous,
        row.share,
      );
  for (const c of r.cashFlow) {
    if (c.points.every((p) => p.net === 0 && p.inflow === 0 && p.outflow === 0) && c.opening === 0 && c.closing === 0) continue;
    add("Flujo de caja", c.currency, "Saldo inicial", r.range.from, c.opening);
    add("Flujo de caja", c.currency, "Entradas", null, c.inflow);
    add("Flujo de caja", c.currency, "Salidas", null, c.outflow);
    add("Flujo de caja", c.currency, "Transferencias recibidas", null, c.transfersIn);
    add("Flujo de caja", c.currency, "Transferencias enviadas", null, c.transfersOut);
    add("Flujo de caja", c.currency, "Saldo final", null, c.closing);
  }
  for (const a of r.accounts) {
    const cur = a.account.currency;
    add("Cuentas", cur, a.account.name, "Saldo inicial", a.opening);
    add("Cuentas", cur, a.account.name, "Ingresos", a.income);
    add("Cuentas", cur, a.account.name, "Gastos", a.expenses);
    add("Cuentas", cur, a.account.name, "Compras con tarjeta de crédito", a.creditPurchases);
    add("Cuentas", cur, a.account.name, "Transferencias recibidas", a.transfersIn);
    add("Cuentas", cur, a.account.name, "Transferencias enviadas", a.transfersOut);
    add("Cuentas", cur, a.account.name, "Saldo final", a.closing);
  }
  for (const c of r.cards) {
    add("Tarjetas", c.card.currency, c.card.name, "Compras", c.purchases, c.previousPurchases);
    if (c.committed !== null) add("Tarjetas", c.card.currency, c.card.name, "Comprometido", c.committed);
  }
  for (const b of r.budgets.rows) {
    const detail = `${b.budget.startDate} a ${b.budget.endDate}`;
    add("Presupuestos", b.budget.currency, b.budget.name, `Presupuestado (${detail})`, b.budget.amount);
    add("Presupuestos", b.budget.currency, b.budget.name, `Gastado (${detail})`, b.usage.spent, b.previousSpent);
  }
  for (const g of r.goals) {
    add("Metas", g.goal.currency, g.goal.name, "Objetivo", g.progress.target);
    add("Metas", g.goal.currency, g.goal.name, "Ahorrado", g.progress.saved);
    add("Metas", g.goal.currency, g.goal.name, "Falta", g.progress.remaining);
    add("Metas", g.goal.currency, g.goal.name, "Aportado en el período", g.contributedInRange);
  }
  return toCsv(
    ["Sección", "Moneda", "Concepto", "Detalle", "Importe", "Importe (centavos)", "Período de comparación", "Período de comparación (centavos)", "Participación (%)"],
    rows,
  );
}

/** "pfm-informe-2026-11-01_2026-11-30-transacciones.csv" */
export const reportFileName = (r: Report, suffix: string, ext: "csv" | "json") =>
  `pfm-informe-${r.range.from}_${r.range.to}-${suffix}.${ext}`;

/**
 * Hands a file to the browser as a download. The data never leaves the device: the Blob lives
 * in memory and its object URL is revoked right after the click.
 */
export function downloadFile(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
