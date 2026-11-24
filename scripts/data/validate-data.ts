/**
 * Validates every file in data/ in four layers (structure + version, references,
 * uniqueness and partition, financial invariants) — the same code the app runs on import.
 * Output shows file names, counts and rule ids only, never amounts or descriptions
 * (security rule: CI logs never print financial data).
 *
 *   npm run data:validate            validates ./data
 *   npm run data:validate -- <dir>   validates another directory (used by tests)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { computeChecksums, validateDataFiles, type DataFileMap } from "../../src/services/data/dataset";

function collect(dir: string, base = dir, files: DataFileMap = {}): DataFileMap {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) collect(path, base, files);
    else if (name.endsWith(".json")) {
      const key = relative(base, path).split(sep).join("/");
      try {
        files[key] = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        files[key] = Symbol.for("invalid-json");
      }
    } else if (name !== ".gitkeep" && name !== "README.md") {
      files[relative(base, path).split(sep).join("/")] = Symbol.for("unexpected-file");
    }
  }
  return files;
}

const dataDir = resolve(process.argv[2] ?? "data");
const files = collect(dataDir);
const broken = Object.entries(files).filter(([, v]) => typeof v === "symbol");
if (broken.length > 0) {
  for (const [file] of broken) console.error(`✗ ${file}: not valid JSON or not a .json file`);
  process.exit(1);
}

const { dataSet, issues } = validateDataFiles(files);
if (issues.length > 0 || !dataSet) {
  console.error(`✗ data/ failed validation: ${issues.length} issue(s)`);
  for (const i of issues) console.error(`  [${i.layer}] ${i.file}${i.recordId ? ` (${i.recordId})` : ""}: ${i.message}`);
  process.exit(1);
}

const checksums = computeChecksums(dataSet);
console.log(`✓ data/ valid — schemaVersion ${dataSet.meta.schemaVersion}, dataRevision ${dataSet.meta.dataRevision}`);
for (const [file, c] of Object.entries(checksums).sort()) console.log(`  ${file}: ${c.count} record(s)`);
