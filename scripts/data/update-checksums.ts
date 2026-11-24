/**
 * Recomputes meta.json checksums (count and amountSum per file, invariant I-10) after a
 * deliberate edit of data/. Refuses to write when the data does not pass layers 1–3, so a
 * checksum can never "bless" invalid data.
 *
 *   npm run data:checksums [-- <dir>]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { computeChecksums, parseDataFiles, validateIntegrity, type DataFileMap } from "../../src/services/data/dataset";

const dir = resolve(process.argv[2] ?? "data");
const files: DataFileMap = {};
const walk = (d: string) => {
  for (const name of readdirSync(d)) {
    const p = resolve(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".json")) files[relative(dir, p).split(sep).join("/")] = JSON.parse(readFileSync(p, "utf8"));
  }
};
walk(dir);

const { dataSet, issues } = parseDataFiles(files);
if (!dataSet) {
  console.error(`✗ ${issues.length} structural issue(s); fix them first (npm run data:validate)`);
  process.exit(1);
}
const blocking = validateIntegrity(dataSet).filter((i) => i.severity === "error" && !i.message.startsWith("I-10"));
if (blocking.length > 0) {
  console.error(`✗ ${blocking.length} integrity issue(s); fix them first (npm run data:validate)`);
  process.exit(1);
}
const meta = files["meta.json"] as { checksums: unknown };
meta.checksums = computeChecksums(dataSet);
writeFileSync(resolve(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.log(`✓ meta.json checksums updated (${Object.keys(meta.checksums as object).length} files)`);
