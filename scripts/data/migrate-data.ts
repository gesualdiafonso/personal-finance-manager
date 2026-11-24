/**
 * Migrates data/ to the current schemaVersion and prints the migration report.
 *
 *   npm run data:migrate -- [dir] [--out <dir>] [--transfer <transferId>=<sourceAccountId> ...]
 *   npm run data:migrate -- --check [dir]     fails unless dir is already at the current version
 *
 * Writes the result only when the whole migration succeeded and passed validation. The
 * report shows versions, counts, renamed fields, defaults and merges — never amounts or
 * descriptions.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { toIsoWithOffset } from "../../src/lib/formatting/date";
import { isAppError } from "../../src/lib/errors/app-error";
import type { DataFileMap } from "../../src/services/data/dataset";
import { migrateDataFiles } from "../../src/services/versioning/data-migrations";

function collect(dir: string, base = dir, files: DataFileMap = {}): DataFileMap {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) collect(path, base, files);
    else if (name.endsWith(".json")) files[relative(base, path).split(sep).join("/")] = JSON.parse(readFileSync(path, "utf8"));
  }
  return files;
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const transferDirections: Record<string, string> = {};
let outDir: string | null = null;
let dir = "data";
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === "--check") continue;
  if (a === "--out") outDir = args[++i] ?? null;
  else if (a === "--transfer") {
    const [id, account] = (args[++i] ?? "").split("=");
    if (id && account) transferDirections[id] = account;
  } else dir = a;
}

const root = resolve(dir);
try {
  const { files, report } = migrateDataFiles(collect(root), { now: toIsoWithOffset(new Date()), transferDirections });
  console.log(JSON.stringify(report, null, 2));
  if (check) {
    if (report.changed) {
      console.error(`✗ ${dir} is at ${report.from}; current is ${report.to}. Run npm run data:migrate.`);
      process.exit(1);
    }
    console.log(`✓ ${dir} is at the current schemaVersion (${report.to})`);
    process.exit(0);
  }
  if (!report.changed) {
    console.log("Nothing to migrate.");
    process.exit(0);
  }
  const target = resolve(outDir ?? dir);
  mkdirSync(target, { recursive: true });
  // Replace only the data files; keep README.md and other non-JSON files.
  for (const p of Object.keys(collect(target))) rmSync(join(target, p));
  for (const [p, content] of Object.entries(files)) {
    const path = join(target, p);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`);
  }
  console.log(`✓ Migrated ${report.from} → ${report.to}: ${report.recordsBefore} record(s) in, ${report.recordsAfter} out, ${report.recordsAbsorbed} absorbed`);
} catch (e) {
  if (isAppError(e)) {
    console.error(`✗ ${e.code}: ${e.message}`);
    for (const d of e.details) console.error(`  ${d}`);
  } else console.error(e);
  process.exit(1);
}
