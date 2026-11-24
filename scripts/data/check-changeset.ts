/**
 * Checks a changeset exported by the app against data/ before the owner integrates it by
 * hand (D2-08): format, SHA-256, schemaVersion, baseRev of every operation, and full
 * validation of data/ with the changeset applied IN MEMORY. Never writes anything.
 *
 *   npm run data:changeset -- <changeset.json> [dataDir]
 *
 * Output names entities, ids and counts — never amounts or descriptions.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { isAppError } from "../../src/lib/errors/app-error";
import type { DataFileMap } from "../../src/services/data/dataset";
import { checkChangeset } from "../../src/services/exchange/exchange";

const [changesetPath, dir = "data"] = process.argv.slice(2);
if (!changesetPath) {
  console.error("usage: npm run data:changeset -- <changeset.json> [dataDir]");
  process.exit(2);
}
const root = resolve(dir);
const files: DataFileMap = {};
const walk = (d: string) => {
  for (const name of readdirSync(d)) {
    const p = resolve(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".json")) files[relative(root, p).split(sep).join("/")] = JSON.parse(readFileSync(p, "utf8"));
  }
};
walk(root);

try {
  const result = await checkChangeset(files, JSON.parse(readFileSync(changesetPath, "utf8")));
  console.log(`changeset ${result.changesetId}: ${result.operations} operation(s), based on revision ${String(result.basedOnRevision)}; data/ is at revision ${result.dataRevision}`);
  for (const [entity, ops] of Object.entries(result.byEntity)) console.log(`  ${entity}: ${Object.entries(ops).map(([o, n]) => `${o} ${n}`).join(", ")}`);
  for (const m of result.mismatches) console.error(`  [mismatch] ${m.entity} ${m.id}: ${m.reason}`);
  for (const i of result.issues) (i.severity === "error" ? console.error : console.warn)(`  [${i.severity}] [${i.layer}] ${i.file}${i.recordId ? ` (${i.recordId})` : ""}: ${i.message}`);
  if (!result.ok) {
    console.error("✗ changeset cannot be integrated as is");
    process.exit(1);
  }
  console.log("✓ changeset applies cleanly to data/ and the result passes validation");
} catch (e) {
  console.error(isAppError(e) ? `✗ ${e.code}: ${e.message}` : e);
  if (isAppError(e)) for (const d of e.details) console.error(`  ${d}`);
  process.exit(1);
}
