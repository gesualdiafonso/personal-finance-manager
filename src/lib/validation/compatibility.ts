import { DATA_COMPATIBILITY } from "@/lib/config/app";
import { AppError } from "@/lib/errors/app-error";

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

/**
 * Same major → readable (a newer minor only adds optional fields, ignored by this build).
 * A different major → rejected; the previous local copy keeps working.
 */
export function assertSchemaCompatible(version: string, supportedMajor: number = DATA_COMPATIBILITY.supportedMajor): void {
  const { major } = parseSemVer(version);
  if (major !== supportedMajor) {
    throw new AppError(
      "INCOMPATIBLE_SCHEMA_VERSION",
      `schemaVersion ${version} is not readable by this build (supports ${supportedMajor}.x)`,
    );
  }
}

export function isSchemaCompatible(version: string, supportedMajor: number = DATA_COMPATIBILITY.supportedMajor): boolean {
  try {
    assertSchemaCompatible(version, supportedMajor);
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
