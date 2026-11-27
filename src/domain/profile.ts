import { z } from "zod";
import { currencyCodeSchema } from "./currency";

/**
 * Global user profile (local account of this device). One record per device: AUREON is
 * single-user and every financial record lives in one local database, so the account that
 * registers on a device owns that device's data (D-AUTH-01).
 *
 * Preferences that already exist in FinancialSettings — preferred (primary) currency, time
 * zone and number format — are NOT copied here: the profile view reads and writes them there,
 * so there is exactly one source for each value (D-AUTH-03).
 *
 * The profile never travels in data exports or publications (personal data, D-AUTH-06).
 */

const isoInstant = z.iso.datetime({ offset: true });
const uuid = z.uuid();

/** Lower-case letters, digits, ".", "_" and "-"; starts and ends with a letter or digit. */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;

/** Unicode-normalised, trimmed and lower-cased: "Ana.Perez " and "ana.perez" are the same user. */
export function normalizeUsername(input: string): string {
  return input.normalize("NFKC").trim().toLowerCase();
}

export const usernameSchema = z.string().regex(USERNAME_PATTERN, "Username: 3–32 characters, a–z, 0–9, '.', '_' or '-'");

/** Languages the interface can show today. Spanish (es-AR) only until ADR-005 is decided. */
export const PROFILE_LANGUAGES = ["es-AR"] as const;
/** Numeric date format used wherever a date is shown as digits ("form" style). */
export const DATE_FORMATS = ["dd/MM/yyyy", "yyyy-MM-dd"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Countries offered in the profile (ISO 3166-1 alpha-2); names come from Intl.DisplayNames. */
export const PROFILE_COUNTRIES = ["AR", "UY", "CL", "BR", "PY", "BO", "PE", "CO", "EC", "VE", "MX", "US", "CA", "ES", "PT", "IT", "FR", "DE", "GB"] as const;

const optionalText = (max: number) => z.string().trim().max(max);

export const userProfileSchema = z.strictObject({
  id: uuid,
  username: usernameSchema,
  fullName: optionalText(80),
  /** Optional: "" when not given. Only used to show it back; nothing is ever sent. */
  email: z.union([z.literal(""), z.email().max(120)]),
  phone: z.union([z.literal(""), z.string().regex(/^\+?[0-9 ()-]{6,24}$/, "Phone: digits, spaces, (), - and an optional leading +")]),
  country: z.union([z.literal(""), z.enum(PROFILE_COUNTRIES)]),
  region: optionalText(60),
  /** A second currency the user follows (default target of the converter); null when none. */
  secondaryCurrency: currencyCodeSchema.nullable(),
  language: z.enum(PROFILE_LANGUAGES),
  dateFormat: z.enum(DATE_FORMATS),
  createdAt: isoInstant,
  updatedAt: isoInstant,
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/** Fields a user may edit (identity and dates are managed by the service). */
export type ProfileEdit = Pick<UserProfile, "fullName" | "email" | "phone" | "country" | "region" | "secondaryCurrency" | "language" | "dateFormat">;

export const DEFAULT_PROFILE_PREFERENCES: Pick<UserProfile, "language" | "dateFormat" | "secondaryCurrency"> = {
  language: "es-AR",
  dateFormat: "dd/MM/yyyy",
  secondaryCurrency: null,
};

/** "Ana Pérez" → "AP"; falls back to the username's first two letters. */
export function profileInitials(profile: Pick<UserProfile, "fullName" | "username">): string {
  const words = profile.fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[words.length - 1]![0]!).toLocaleUpperCase("es-AR");
  if (words.length === 1) return words[0]!.slice(0, 2).toLocaleUpperCase("es-AR");
  return profile.username.slice(0, 2).toLocaleUpperCase("es-AR");
}

/** Name to greet the user with: first word of the full name, else the username. */
export function displayFirstName(profile: Pick<UserProfile, "fullName" | "username">): string {
  return profile.fullName.trim().split(/\s+/)[0] || profile.username;
}
