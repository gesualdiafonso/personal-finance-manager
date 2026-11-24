import { DATA_COMPATIBILITY } from "@/lib/config/app";
import { AppError } from "@/lib/errors/app-error";

/**
 * Version compatibility (docs/architecture/data-versioning.md).
 *
 * - Same major as this build → readable (a newer minor only adds optional fields).
 * - Older major → NOT read directly: it must go through the migrations first.
 * - Newer major → rejected: this build cannot know the format (never downgraded).
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemVer(version: string): SemVer {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new AppError("VALIDATION_FAILED", `Invalid schemaVersion "${version}"`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function compareSemVer(a: string, b: string): -1 | 0 | 1 {
  const x = parseSemVer(a);
  const y = parseSemVer(b);
  for (const k of ["major", "minor", "patch"] as const) {
    if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  }
  return 0;
}

export type Compatibility = "current" | "needs-migration" | "unsupported-future";

export function classifySchemaVersion(version: string, supportedMajor: number = DATA_COMPATIBILITY.supportedMajor): Compatibility {
  const { major } = parseSemVer(version);
  if (major === supportedMajor) return "current";
  return major < supportedMajor ? "needs-migration" : "unsupported-future";
}

/** Accepts only the current major; explains what to do otherwise. */
export function assertCurrentSchema(version: string, supportedMajor: number = DATA_COMPATIBILITY.supportedMajor): void {
  const c = classifySchemaVersion(version, supportedMajor);
  if (c === "needs-migration") {
    throw new AppError("INCOMPATIBLE_SCHEMA_VERSION", `schemaVersion ${version} is older than ${supportedMajor}.x: migrate it first (npm run data:migrate)`);
  }
  if (c === "unsupported-future") {
    throw new AppError("INCOMPATIBLE_SCHEMA_VERSION", `schemaVersion ${version} is newer than this build supports (${supportedMajor}.x): update the application`);
  }
}

/** Kept for Step 01 callers: true only for the current major. */
export function assertSchemaCompatible(version: string, supportedMajor: number = DATA_COMPATIBILITY.supportedMajor): void {
  assertCurrentSchema(version, supportedMajor);
}

export function isSchemaCompatible(version: string, supportedMajor: number = DATA_COMPATIBILITY.supportedMajor): boolean {
  try {
    assertCurrentSchema(version, supportedMajor);
    return true;
  } catch {
    return false;
  }
}

/** dataRevision only goes up. A lower revision is rejected unless explicitly allowed (restore). */
export function assertRevisionNotOlder(incoming: number, local: number | null, options: { allowRestore?: boolean } = {}): void {
  if (local !== null && incoming < local && !options.allowRestore) {
    throw new AppError("DATA_REVISION_REGRESSION", `Incoming dataRevision ${incoming} is older than local ${local}`);
  }
}
