/**
 * Application-wide configuration. Values here are product decisions, not user settings.
 * Changing any of them requires a documented decision (docs/decisions).
 */
export const APP_CONFIG = {
  name: "PFM",
  fullName: "Personal Finance Manager",
  /** Step 01: initial interface language is Spanish (see docs/decisions/ADR-005). */
  locale: "es-AR",
  htmlLang: "es",
  currency: "ARS",
  /** Number of minor units (centavos) per peso. */
  minorUnitDigits: 2,
  timeZone: "America/Argentina/Buenos_Aires",
  /** Single user, local-first (ADR-001, ADR-002). */
  userModel: "single-user",
} as const;

/** Data format versions this build can read (docs/architecture/data.md). */
export const DATA_COMPATIBILITY = {
  /** Current schemaVersion written by this build. */
  current: "1.0.0",
  /** Major version this build reads. A higher major is rejected. */
  supportedMajor: 1,
} as const;

export type AppConfig = typeof APP_CONFIG;
