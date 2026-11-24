/**
 * ADR-001 guard: fails if any database, database service or ORM package appears in
 * package.json or anywhere in the installed dependency tree (package-lock.json).
 */
import { readFileSync } from "node:fs";

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
console.log(`✓ No database or ORM dependency (${declared.length} declared, ${installed.length} installed packages checked)`);
