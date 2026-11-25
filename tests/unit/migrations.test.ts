import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/domain/schemas";
import { validateDataFiles, type DataFileMap } from "@/services/data/dataset";
import { DATA_MIGRATIONS, detectSchemaVersion, migrateDataFiles } from "@/services/versioning/data-migrations";
import { clone, loadSampleFiles } from "../helpers/sample-data";

const V1_DIR = resolve(__dirname, "../fixtures/v1");
function loadV1(): DataFileMap {
  const out: DataFileMap = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".json")) out[relative(V1_DIR, p).replaceAll("\\", "/")] = JSON.parse(readFileSync(p, "utf8"));
    }
  };
  walk(V1_DIR);
  return out;
}
const TRANSFER = "0193a1b0-000e-7000-8000-00000000000e";
const SOURCE = "0193a1b0-0001-7000-8000-000000000001";
const ctx = { now: "2026-11-24T09:00:00-03:00", transferDirections: { [TRANSFER]: SOURCE } };

const ids = (files: DataFileMap) =>
  Object.values(files).flatMap((f) => ((f as { records?: { id: string; legacyIds?: string[] }[] }).records ?? []).flatMap((r) => [r.id, ...(r.legacyIds ?? [])]));

describe("migration 1.0.0 → 2.0.0", () => {
  it("is registered and targets the current version", () => {
    expect(DATA_MIGRATIONS.map((m) => `${m.from}→${m.to}`)).toEqual(["1.0.0→2.0.0"]);
    expect(SCHEMA_VERSION).toBe("2.4.0"); // 2.1.0 to 2.4.0 are additive: migrated 2.0.0 data is current
  });

  it("produces data that passes every validation layer", () => {
    const { files, report } = migrateDataFiles(loadV1(), ctx);
    expect(detectSchemaVersion(files)).toBe("2.0.0");
    expect(validateDataFiles(files).dataSet).not.toBeNull();
    expect(report).toMatchObject({ from: "1.0.0", to: "2.0.0", changed: true, recordsBefore: 13, recordsAfter: 12, recordsAbsorbed: 1 });
  });

  it("never discards a record: every v1 id survives, as a record or in legacyIds", () => {
    const before = ids(loadV1()).sort();
    const { files } = migrateDataFiles(loadV1(), ctx);
    expect(ids(files).sort()).toEqual(before);
  });

  it("keeps amounts exactly (sum of cents per file)", () => {
    const v1 = loadV1();
    const { files } = migrateDataFiles(v1, ctx);
    const sum = (f: unknown, k: string) => ((f as { records: Record<string, number>[] }).records ?? []).reduce((n, r) => n + (r[k] ?? 0), 0);
    expect(sum(files["accounts.json"], "initialBalance")).toBe(sum(v1["accounts.json"], "openingBalanceMinor"));
    expect(sum(files["bills.json"], "amount")).toBe(sum(v1["bills.json"], "amountMinor"));
    const tx = "transactions/2026/2026-11.json";
    const legs = (v1[tx] as { records: { kind: string; amountMinor: number }[] }).records;
    const oneLeg = legs.filter((r) => r.kind === "transfer")[0]!.amountMinor;
    expect(sum(files[tx], "amount")).toBe(sum(v1[tx], "amountMinor") - oneLeg);
  });

  it("turns the two transfer legs into one record with the given direction", () => {
    const { files, report } = migrateDataFiles(loadV1(), ctx);
    const transfers = (files["transactions/2026/2026-11.json"] as { records: Record<string, unknown>[] }).records.filter((r) => r.type === "transfer");
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ accountId: SOURCE, destinationAccountId: "0193a1b0-0002-7000-8000-000000000002" });
    expect(report.steps[0]!.merged).toHaveLength(1);
  });

  it("stops without guessing when a transfer direction is missing", () => {
    expect(() => migrateDataFiles(loadV1(), { now: ctx.now })).toThrow(expect.objectContaining({ code: "MIGRATION_BLOCKED" }));
  });

  it("reports renamed fields, defaults and warnings without amounts or descriptions", () => {
    const { report } = migrateDataFiles(loadV1(), ctx);
    const step = report.steps[0]!;
    expect(step.renamedFields).toContain("transactions.amountMinor → amount");
    expect(step.defaultsApplied.some((d) => d.entity === "cards" && d.field === "accountId")).toBe(true);
    expect(step.warnings).toContain("1 card(s) have no paying account (accountId = null)");
    expect(JSON.stringify(report)).not.toContain("EJEMPLO-FICTICIO");
  });

  it("is idempotent: current data is returned unchanged", () => {
    const { files } = migrateDataFiles(loadV1(), ctx);
    const again = migrateDataFiles(files, ctx);
    expect(again.report.changed).toBe(false);
    expect(again.files).toBe(files);
    expect(migrateDataFiles(loadSampleFiles(), ctx).report.changed).toBe(false);
  });

  it("never downgrades: a newer version is rejected", () => {
    const files = clone(loadSampleFiles());
    for (const f of Object.values(files)) (f as { schemaVersion: string }).schemaVersion = "3.0.0";
    expect(() => migrateDataFiles(files, ctx)).toThrow(expect.objectContaining({ code: "INCOMPATIBLE_SCHEMA_VERSION" }));
  });

  it("rejects files that disagree on their version", () => {
    const files = loadV1();
    (files["accounts.json"] as { schemaVersion: string }).schemaVersion = "2.0.0";
    expect(() => migrateDataFiles(files, ctx)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});
