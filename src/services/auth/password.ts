import { z } from "zod";

/**
 * Password verifiers for the LOCAL account (D-AUTH-02). Web Crypto only — no custom
 * algorithm: PBKDF2-HMAC-SHA-256, 600 000 iterations (OWASP Password Storage Cheat Sheet, the
 * same parameter as src/services/crypto/bundle.ts), a random 16-byte salt per password and a
 * 32-byte derived value. The password itself is never stored; the verifier is kept in its
 * own IndexedDB store, apart from the profile, and never exported.
 *
 * What this protects: the password cannot be read back from the device. What it does not:
 * the financial data on the device is NOT encrypted by it (OD-3, not implemented), so the
 * login is a lock on the interface, not on the data.
 */
export const PASSWORD_KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export const passwordVerifierSchema = z.strictObject({
  algorithm: z.literal("PBKDF2-HMAC-SHA-256"),
  iterations: z.number().int().min(PASSWORD_KDF_ITERATIONS),
  salt: z.base64(),
  hash: z.base64(),
});
export type PasswordVerifier = z.infer<typeof passwordVerifierSchema>;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** A handful of passwords too common to accept (not a full breach list; no network call). */
const TOO_COMMON = new Set(["12345678", "123456789", "1234567890", "password", "password1", "qwerty123", "contraseña", "contrasena", "aureon123", "11111111", "00000000", "abcd1234"]);

export type PasswordProblem = "too-short" | "too-long" | "same-as-username" | "same-as-current" | "too-common" | "mismatch";

/** Policy (NIST SP 800-63B style): length matters; no composition rules; no obvious choices. */
export function checkPassword(password: string, context: { username?: string; confirmation?: string } = {}): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return "too-short";
  if (length > PASSWORD_MAX_LENGTH) return "too-long";
  const lower = password.toLowerCase();
  if (context.username && lower === context.username.toLowerCase()) return "same-as-username";
  if (TOO_COMMON.has(lower)) return "too-common";
  if (context.confirmation !== undefined && context.confirmation !== password) return "mismatch";
  return null;
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Web Crypto is not available");
  return s;
}

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await subtle().importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

export async function createPasswordVerifier(password: string): Promise<PasswordVerifier> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PASSWORD_KDF_ITERATIONS);
  return { algorithm: "PBKDF2-HMAC-SHA-256", iterations: PASSWORD_KDF_ITERATIONS, salt: toBase64(salt), hash: toBase64(hash) };
}

/** Constant-time comparison of two equal-length byte arrays. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(password: string, verifier: PasswordVerifier): Promise<boolean> {
  const parsed = passwordVerifierSchema.safeParse(verifier);
  if (!parsed.success) return false;
  const actual = await derive(password, fromBase64(parsed.data.salt), parsed.data.iterations);
  return sameBytes(actual, fromBase64(parsed.data.hash));
}

/** A verifier for a password nobody knows: used to keep "unknown user" as slow as "wrong password". */
export const DUMMY_VERIFIER: PasswordVerifier = {
  algorithm: "PBKDF2-HMAC-SHA-256",
  iterations: PASSWORD_KDF_ITERATIONS,
  salt: "AAAAAAAAAAAAAAAAAAAAAA==",
  hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

/** 32 random bytes, base64url: an opaque session id (grants nothing beyond this device). */
export function randomToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
