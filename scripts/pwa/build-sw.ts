/**
 * Writes public/sw.js from scripts/pwa/sw.template.js with a cache version unique to this
 * build: <package version>+<git sha or timestamp>. Runs automatically before `next build`.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };

function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  }
}

const version = `${pkg.version}+${buildId()}`;
const template = readFileSync(resolve(root, "scripts/pwa/sw.template.js"), "utf8");
if (!template.includes("__PFM_SW_VERSION__")) throw new Error("sw.template.js is missing the version placeholder");
writeFileSync(resolve(root, "public/sw.js"), template.replaceAll("__PFM_SW_VERSION__", version));
console.log(`public/sw.js written (cache version ${version})`);
