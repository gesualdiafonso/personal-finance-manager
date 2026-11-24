/**
 * ADR-001 guard: fails if any database, database service, ORM, remote key-value store or
 * GitHub write client appears in package.json or anywhere in the installed dependency tree
 * (package-lock.json); and if application code (src/) talks to the GitHub API — the
 * frontend must never write to the repository (Step 02 constraints).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  /^@supabase\//,
  /^supabase$/,
  /^pg$/,
  /^pg-/,
  /^postgres$/,
  /^@neondatabase\//,
  /^@vercel\/postgres$/,
  /^mysql2?$/,
  /^mongodb$/,
  /^mongoose$/,
  /^firebase$/,
  /^firebase-admin$/,
  /^@firebase\//,
  /^sqlite3?$/,
  /^better-sqlite3$/,
  /^@libsql\//,
  /^prisma$/,
  /^@prisma\//,
  /^drizzle-orm$/,
  /^drizzle-kit$/,
  /^typeorm$/,
  /^sequelize$/,
  /^knex$/,
  /^@planetscale\//,
  /^dexie$/, // IndexedDB wrapper that ships a sync service; `idb` is used instead
  /^redis$/,
  /^ioredis$/,
  /^@redis\//,
  /^@upstash\//,
  /^@vercel\/kv$/,
  /^@octokit\//, // GitHub API clients: the app never writes to the repository
  /^octokit$/,
  /^rxdb$/, // replication/sync engines (no automatic multi-device sync)
  /^pouchdb/,
];

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
const installed = Object.keys(lock.packages ?? {})
  .filter((p) => p.startsWith("node_modules/"))
  .map((p) => p.slice(p.lastIndexOf("node_modules/") + "node_modules/".length));

const hits = [...new Set([...declared, ...installed])].filter((name) => FORBIDDEN.some((re) => re.test(name)));
if (hits.length > 0) {
  console.error(`✗ Forbidden database/ORM dependencies (ADR-001): ${hits.join(", ")}`);
  process.exit(1);
}
// Application code must not reach the GitHub API or any remote persistence endpoint.
const FORBIDDEN_IN_SOURCE = [/api\.github\.com/, /uploads\.github\.com/, /supabase\.co/, /firebaseio\.com/, /upstash\.io/];
const sourceHits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      const text = readFileSync(path, "utf8");
      for (const re of FORBIDDEN_IN_SOURCE) if (re.test(text)) sourceHits.push(`${path} (${re.source})`);
    }
  }
};
walk("src");
if (sourceHits.length > 0) {
  console.error(`✗ Application code references a remote write/persistence endpoint: ${sourceHits.join(", ")}`);
  process.exit(1);
}

console.log(`✓ No database or ORM dependency (${declared.length} declared, ${installed.length} installed packages checked; src/ has no remote write endpoint)`);
