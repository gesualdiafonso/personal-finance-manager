import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENCY_CODES } from "@/domain/currency";
import { CONVERSION_MODES, QUOTE_SOURCES, RATE_SET_KINDS } from "@/domain/fx";
import { DATE_FORMATS, PROFILE_COUNTRIES } from "@/domain/profile";
import {
  ACCOUNT_TYPES,
  BILL_STATUSES,
  BUDGET_PERIODS,
  CARD_TYPES,
  ENTITY_SCHEMAS,
  GOAL_KINDS,
  GOAL_STATUSES,
  RECURRENCE_FREQUENCIES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  financialSettingsSchema,
  type EntityName,
} from "@/domain/schemas";
import { DATABASE_TABLES } from "@/lib/supabase/types";

/**
 * Step 13 — static checks of database/sql against the TypeScript/Zod models. Runs without a
 * database (CI); the scripts themselves are executed and verified on a local PostgreSQL by
 * database/tests/run-local.sh (docs/database/STEP-13-VALIDATION.md).
 */
const DIR = "database/sql";
const allFiles = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const sql = Object.fromEntries(allFiles.map((f) => [f, readFileSync(join(DIR, f), "utf8")]));
/** Step 14 adds 09 (own-profile access), checked on its own below; Step 13 checks cover 00–08 and 99 unchanged. */
const STEP14_FILES = ["09_profile_access.sql"];
const files = allFiles.filter((f) => !STEP14_FILES.includes(f));
const all = files.map((f) => sql[f]).join("\n");
const stripComments = (s: string) => s.replace(/--[^\n]*/g, "");

/** Column names of `create table public.<name> ( … );` (first identifier of each column line). */
function tableColumns(name: string): string[] {
  const match = new RegExp(`create table public\\.${name} \\(([\\s\\S]*?)\\n\\);`).exec(stripComments(all));
  if (!match) throw new Error(`table ${name} not found`);
  // Column definitions start at the table's indentation (two spaces); deeper lines continue them.
  return match[1]!
    .split("\n")
    .filter((l) => /^ {2}[a-z_]+\s/.test(l))
    .map((l) => l.trim())
    .filter((l) => !/^(constraint|primary|foreign|unique|check)\b/.test(l))
    .map((l) => l.split(/\s+/)[0]!);
}

/** Values of `<column> … check (<column> in (…))` in a table. */
function checkList(table: string, column: string): string[] {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(stripComments(all))![1]!;
  const m = new RegExp(`check \\((?:${column} is null or )?${column} in \\(([^)]*)\\)`).exec(body);
  if (!m) throw new Error(`no check list for ${table}.${column}`);
  return m[1]!.split(",").map((v) => v.trim().replace(/^'|'$/g, "")).filter((v) => v !== "");
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const TABLE_OF: Record<EntityName, string> = {
  accounts: "accounts",
  cards: "cards",
  categories: "categories",
  transactions: "transactions",
  bills: "bills",
  recurrences: "recurrences",
  budgets: "budgets",
  goals: "goals",
  goalContributions: "goal_contributions",
};
const SERVER_ONLY = ["user_id", "server_updated_at"];
const CONVERSION_COLUMNS = ["conv_from", "conv_to", "conv_amount", "conv_converted", "conv_rate", "conv_mode", "conv_rate_set_id", "conv_source", "conv_rate_at", "conv_overridden"];

describe("SQL scripts: organisation", () => {
  it("has the documented scripts, in order", () => {
    expect(allFiles).toEqual([
      "00_preflight_checks.sql",
      "01_extensions.sql",
      "02_identity_schema.sql",
      "03_financial_schema.sql",
      "04_system_schema.sql",
      "05_constraints_and_indexes.sql",
      "06_functions_and_triggers.sql",
      "07_rls_enablement.sql",
      "08_verification.sql",
      "09_profile_access.sql",
      "99_uninstall_empty_install.sql",
    ]);
  });
  it("00 and 08 are read-only; 01–07 run in one transaction each", () => {
    for (const f of ["00_preflight_checks.sql", "08_verification.sql"]) {
      expect(stripComments(sql[f]!)).not.toMatch(/\b(create|alter|drop|insert|update|delete|grant|revoke|truncate|begin|commit)\b\s/i);
    }
    for (const f of files.slice(1, 8)) {
      expect(stripComments(sql[f]!), f).toMatch(/^\s*begin;/m);
      expect(stripComments(sql[f]!), f).toMatch(/^commit;/m);
    }
  });
});

describe("SQL ↔ Zod: every field of every entity has a column (and vice versa)", () => {
  for (const [entity, table] of Object.entries(TABLE_OF) as [EntityName, string][]) {
    it(`${entity} ↔ public.${table}`, () => {
      const zodKeys = Object.keys(ENTITY_SCHEMAS[entity].shape);
      const expected = zodKeys.flatMap((k) => (k === "conversion" ? CONVERSION_COLUMNS : [snake(k)]));
      const columns = tableColumns(table).filter((c) => !SERVER_ONLY.includes(c));
      expect(columns.sort()).toEqual(expected.sort());
    });
  }
  it("FinancialSettings ↔ user_preferences (exchange normalised into enabled_currencies, mode, active set, provider + rate set tables)", () => {
    const cols = tableColumns("user_preferences");
    for (const k of Object.keys(financialSettingsSchema.shape).filter((k) => k !== "exchange")) expect(cols, k).toContain(k === "baseCurrency" ? "base_currency" : snake(k));
    for (const c of ["enabled_currencies", "default_conversion_mode", "active_rate_set_id", "provider_enabled", "secondary_currency", "language", "date_format"]) expect(cols).toContain(c);
  });
  it("no password, hash, token or session column anywhere", () => {
    for (const t of DATABASE_TABLES) for (const c of tableColumns(t)) expect(c, `${t}.${c}`).not.toMatch(/password|passwd|hash$|verifier|salt|token|secret|session/);
  });
  it("the generated TypeScript types list the same tables", () => {
    const created = [...all.matchAll(/create table public\.([a-z_]+) \(/g)].map((m) => m[1]);
    expect([...DATABASE_TABLES].sort()).toEqual([...created].sort());
  });
});

describe("SQL ↔ Zod: enumerations match", () => {
  const pairs: [string, string, readonly string[]][] = [
    ["accounts", "account_type", ACCOUNT_TYPES],
    ["cards", "card_type", CARD_TYPES],
    ["transactions", "type", TRANSACTION_TYPES],
    ["transactions", "status", TRANSACTION_STATUSES],
    ["transactions", "conv_mode", CONVERSION_MODES],
    ["bills", "status", BILL_STATUSES],
    ["recurrences", "frequency", RECURRENCE_FREQUENCIES],
    ["budgets", "period", BUDGET_PERIODS],
    ["goals", "kind", GOAL_KINDS],
    ["goals", "status", GOAL_STATUSES],
    ["exchange_rate_sets", "kind", RATE_SET_KINDS],
    ["exchange_rate_quotes", "source", QUOTE_SOURCES],
    ["user_preferences", "date_format", DATE_FORMATS],
  ];
  for (const [table, column, values] of pairs) {
    it(`${table}.${column}`, () => expect(checkList(table, column)).toEqual([...values]));
  }
  it("currencies (domain) and countries", () => {
    const domain = /create domain public\.currency_code as text\s+check \(value in \(([^)]*)\)\)/.exec(all)![1]!;
    expect(domain.split(",").map((v) => v.trim().replace(/'/g, ""))).toEqual(CURRENCY_CODES);
    expect(checkList("profiles", "country").filter(Boolean)).toEqual([...PROFILE_COUNTRIES]);
  });
});

describe("SQL security foundation", () => {
  const code = stripComments(all);
  it("every table is created with RLS enabled and client grants revoked, and listed in 07", () => {
    for (const t of DATABASE_TABLES) {
      expect(code, t).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      expect(sql["07_rls_enablement.sql"], t).toContain(`'${t}'`);
    }
    expect(code).toMatch(/revoke all on table public\.profiles[\s\S]*from public, anon, authenticated/);
  });
  it("creates no policies and grants nothing to anon", () => {
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant[^;]*\bto\b[^;]*\banon\b/i);
  });
  it("authenticated only gets EXECUTE on the five pure helper functions (needed by CHECK constraints)", () => {
    const grants = [...code.matchAll(/grant ([^;]+) to ([^;]+);/gi)].filter((m) => /authenticated/.test(m[2]!));
    expect(grants).toHaveLength(5);
    for (const g of grants) expect(g[1]).toMatch(/^execute on function public\.(currency_minor_digits|conversion_amount|has_no_card_number|budget_period_is_valid|array_is_distinct)\(/);
  });
  it("every function pins search_path; SECURITY DEFINER only where documented", () => {
    const fns = [...code.matchAll(/create function (public\.[a-z_]+)\(([\s\S]*?)\nas \$\$/g)];
    expect(fns.length).toBe(22);
    for (const f of fns) expect(f[0], f[1]).toMatch(/set search_path = ''/);
    const definers = fns.filter((f) => /security definer/.test(f[0])).map((f) => f[1]);
    expect(definers.sort()).toEqual(["public.audit_row_change", "public.handle_new_user", "public.initialize_user"]);
  });
  it("financial tables have user_id and unique (user_id, id) for composite foreign keys", () => {
    for (const t of Object.values(TABLE_OF)) {
      expect(tableColumns(t)).toContain("user_id");
      expect(code).toContain(`constraint ${t}_user_id_id_key unique (user_id, id)`);
    }
    const fks = [...code.matchAll(/foreign key \(user_id, [a-z_]+\)\s+references public\./g)];
    expect(fks.length).toBe(21); // 19 in 05 (17 between financial tables + 2 to user_devices) + 2 in 02 (quotes and preferences → rate set)
    expect(code).not.toMatch(/foreign key \((?!user_id)[a-z_]+\)\s+references public\./); // no single-column FK between user tables
  });
  it("the audit log stores column names, never values", () => {
    expect(tableColumns("audit_logs")).toEqual(["id", "user_id", "occurred_at", "table_name", "record_key", "action", "changed_columns", "device_id", "actor_role"]);
  });
});

describe("SQL 09 (Step 14): own-profile access only", () => {
  const code = stripComments(sql["09_profile_access.sql"]!);
  it("runs in one transaction and aborts on unknown policies, missing Step 13 or disabled RLS", () => {
    expect(code).toMatch(/^\s*begin;/m);
    expect(code).toMatch(/^commit;/m);
    expect(code).toMatch(/raise exception 'public\.profiles não existe/);
    expect(code).toMatch(/raise exception 'RLS não está ativa/);
    expect(code).toMatch(/raise exception 'public\.profiles já tem outras políticas/);
  });
  it("creates exactly two policies, on profiles, for authenticated, scoped to auth.uid() = id", () => {
    const policies = [...code.matchAll(/create policy (\w+) on public\.(\w+)\s+for (\w+) to (\w+)\s+using \(\(select auth\.uid\(\)\) = id\)/g)].map((m) => m.slice(1).join(" "));
    expect(policies).toEqual(["aureon_profiles_select_own profiles select authenticated", "aureon_profiles_update_own profiles update authenticated"]);
    expect([...code.matchAll(/create policy/gi)]).toHaveLength(2);
    expect(code).toMatch(/with check \(\(select auth\.uid\(\)\) = id\)/);
  });
  it("grants only column privileges to authenticated (no insert/delete, no contact_email), nothing to anon", () => {
    const grants = [...code.matchAll(/grant ([^;]+) to ([^;]+);/gi)].map((m) => `${m[1]!.replace(/\s+/g, " ")} → ${m[2]}`);
    expect(grants).toEqual([
      "select (id, username, full_name, phone, country, region, created_at, updated_at) on public.profiles → authenticated",
      "update (full_name, phone, country, region) on public.profiles → authenticated",
    ]);
    expect(code).not.toMatch(/grant[^;]*\bto\b[^;]*\banon\b/i);
    expect(code).not.toMatch(/\b(create|alter) table\b/i);
    expect(code).not.toMatch(/service_role/i);
  });
});
