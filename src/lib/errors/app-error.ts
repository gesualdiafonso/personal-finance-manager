/**
 * Error foundation. Every failure that can reach the interface carries a stable code;
 * the interface maps codes to Spanish messages (src/lib/i18n/es.ts). Messages never
 * contain financial data (security requirement: logs and errors show counts, not values).
 */
export type AppErrorCode =
  | "VALIDATION_FAILED"
  | "INCOMPATIBLE_SCHEMA_VERSION"
  | "DATA_REVISION_REGRESSION"
  | "INTEGRITY_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_FAILURE"
  | "CRYPTO_FAILED"
  | "CURRENCY_MISMATCH"
  | "NOT_FOUND"
  | "DUPLICATE_ID"
  | "POSSIBLE_DUPLICATE"
  | "REFERENCE_CONSTRAINT"
  | "CONFLICT"
  | "IMPORT_REJECTED"
  | "MIGRATION_BLOCKED"
  | "PROTECTED_OPERATION"
  | "AUTH_FAILED"
  | "AUTH_LOCKED"
  | "ACCOUNT_EXISTS"
  | "USERNAME_TAKEN"
  | "WEAK_PASSWORD"
  | "UNAUTHENTICATED"
  | "UNKNOWN";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details: readonly string[];

  constructor(code: AppErrorCode, message: string, options: { cause?: unknown; details?: readonly string[] } = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.details = options.details ?? [];
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown, fallback: AppErrorCode = "UNKNOWN"): AppError {
  if (isAppError(error)) return error;
  const message = error instanceof Error ? error.message : "Unexpected error";
  return new AppError(fallback, message, { cause: error });
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E>(error: E): Result<never, E> => ({ ok: false, error });
