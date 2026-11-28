#!/usr/bin/env node
/**
 * Builds the app in Supabase mode for the Step 14 E2E suite (playwright.supabase.config.ts):
 * output in .next-e2e-supabase, Supabase URL pointing at the FAKE Auth server of the tests
 * (127.0.0.1:54329) and a FICTITIOUS publishable key, assembled at runtime so no literal in
 * the repository looks like a credential. Never points at a real Supabase project.
 */
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  NEXT_DIST_DIR: ".next-e2e-supabase",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ["sb", "publishable", "EJEMPLOficticioNoValido0123456789"].join("_"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  NEXT_PUBLIC_SITE_URL: "",
};
const result = spawnSync("npm", ["run", "build"], { stdio: "inherit", env });
process.exit(result.status ?? 1);
