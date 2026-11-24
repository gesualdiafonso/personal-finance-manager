/**
 * Validates every file in data/ in four layers (structure + version, references,
 * uniqueness and partition, financial invariants) — the same code the app runs on import.
 * Output shows file names, counts and rule ids only, never amounts or descriptions
 * (security rule: CI logs never print financial data).
 *
 *   npm run data:validate                         validates ./data (all layers)
 *   npm run data:validate -- <dir>                validates another directory
 *   npm run data:validate -- --only references    reports one layer (CI names each check);
 *                                                 layers: structure, references, uniqueness, invariants
 * Warnings (e.g. possible duplicates) are printed but do not fail.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { computeChecksums, hasErrors, parseDataFiles, validateIntegrity, type DataFileMap, type ValidationLayer } from "../../src/services/data/dataset";

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

const args = process.argv.slice(2);
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? (args[onlyIndex + 1] as ValidationLayer | undefined) : undefined;
const LAYERS: ValidationLayer[] = ["structure", "references", "uniqueness", "invariants"];
if (onlyIndex >= 0 && (!only || !LAYERS.includes(only))) {
  console.error(`--only needs one of: ${LAYERS.join(", ")}`);
  process.exit(2);
}
const positional = args.filter((a, i) => !a.startsWith("--") && !(onlyIndex >= 0 && i === onlyIndex + 1));
const dataDir = resolve(positional[0] ?? "data");
const files = collect(dataDir);
const broken = Object.entries(files).filter(([, v]) => typeof v === "symbol");
if (broken.length > 0) {
  for (const [file] of broken) console.error(`✗ ${file}: not valid JSON or not a .json file`);
  process.exit(1);
}

const parsed = parseDataFiles(files);
const issues = parsed.dataSet ? [...parsed.issues, ...validateIntegrity(parsed.dataSet)] : parsed.issues;
const shown = only ? issues.filter((i) => i.layer === only) : issues;
const label = only ? `layer "${only}"` : "all layers";
for (const i of shown) {
  const line = `  [${i.severity}] [${i.layer}] ${i.file}${i.recordId ? ` (${i.recordId})` : ""}: ${i.message}`;
  if (i.severity === "error") console.error(line);
  else console.warn(line);
}
// A layer cannot be judged if the structure is broken: --only <layer> fails in that case too.
if (!parsed.dataSet || hasErrors(shown)) {
  console.error(`✗ data/ failed validation (${label}): ${shown.filter((i) => i.severity === "error").length} error(s)`);
  process.exit(1);
}

const checksums = computeChecksums(parsed.dataSet);
console.log(`✓ data/ valid (${label}) — schemaVersion ${parsed.dataSet.meta.schemaVersion}, dataRevision ${parsed.dataSet.meta.dataRevision}`);
if (!only) for (const [file, c] of Object.entries(checksums).sort()) console.log(`  ${file}: ${c.count} record(s)`);
