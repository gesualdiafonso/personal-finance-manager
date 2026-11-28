/**
 * SEC-01 guard: nothing that is served publicly may contain official data in plaintext.
 * Run after `next build`. Checks public/ and the build output (.next/static, .next/server)
 * for any data/ file and for the canary strings planted in the fictitious sample data.
 *
 * Step 12 (Supabase): also fails if the build output contains a privileged Supabase key —
 * an sb_secret_… key or a JWT whose role is service_role/supabase_admin. Only the public
 * publishable/anon key may ever reach the browser. Findings name the file, never the value.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Every sample description starts with this marker (data/README.md). */
const CANARY = "EJEMPLO-FICTICIO";
const DATA_SCHEMAS = ["pfm.transactions", "pfm.accounts", "pfm.bills", "pfm.budgets", "pfm.meta"];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const roots = ["public", ".next/static", ".next/server"].map((r) => resolve(r));
if (!existsSync(resolve(".next"))) {
  console.error("✗ .next/ not found — run `npm run build` first");
  process.exit(1);
}
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{16,}/;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{16,}/g;
function privilegedJwt(text) {
  for (const match of text.matchAll(JWT)) {
    try {
      const role = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")).role;
      if (role === "service_role" || role === "supabase_admin") return true;
    } catch {
      // not a JWT
    }
  }
  return false;
}

const problems = [];
let scanned = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    if (!/\.(js|json|html|txt|rsc|body|map|css|webmanifest)$/.test(file)) continue;
    scanned++;
    const text = readFileSync(file, "utf8");
    if (text.includes(CANARY)) problems.push(`${file}: contains sample-data marker`);
    if (SECRET_KEY.test(text) || privilegedJwt(text)) problems.push(`${file}: contains a privileged Supabase key (never ship it to the browser)`);
    for (const schema of DATA_SCHEMAS) {
      if (text.includes(`"schema":"${schema}"`) || text.includes(`"schema": "${schema}"`)) problems.push(`${file}: contains a ${schema} file`);
    }
  }
}
for (const file of walk(resolve("public"))) {
  if (file.includes(`${"/"}data${"/"}`) && !file.endsWith(".enc") && !file.endsWith("manifest.json")) problems.push(`${file}: plaintext under public/data`);
}
if (problems.length > 0) {
  console.error("✗ Plaintext financial data or privileged keys found in public artifacts (SEC-01):");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`✓ No plaintext data or privileged keys in public artifacts (${scanned} files scanned)`);
