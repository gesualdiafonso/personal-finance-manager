import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { semver } from "@/lib/validation/schemas";

/**
 * Encrypted publication bundle — implements exactly the design approved in Step 00 (D2),
 * documented in docs/architecture/crypto.md:
 *
 *   key  = PBKDF2-HMAC-SHA-256(passphrase, salt[16], iterations) → AES-256-GCM key (non-extractable)
 *   data = AES-256-GCM(key, iv[12], AAD = "pfm.bundle|<schemaVersion>|rev=<dataRevision>")
 *   manifest.sha256 = SHA-256(ciphertext)  (checked before deriving the key)
 *
 * Works with the Web Crypto API in browsers and in Node (globalThis.crypto).
 * Out of scope here, by open decision: where the CI gets the passphrase (OD-1), whether the
 * repository is encrypted (OD-2), at-rest encryption of IndexedDB (OD-3), encrypted exports (OD-5).
 */

export const BUNDLE_FORMAT = "pfm.bundle";
export const BUNDLE_FORMAT_VERSION = 1;
/** OWASP Password Storage Cheat Sheet: PBKDF2-HMAC-SHA256, 600 000 iterations. */
export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const manifestSchema = z.object({
  format: z.literal(BUNDLE_FORMAT),
  formatVersion: z.literal(BUNDLE_FORMAT_VERSION),
  schemaVersion: semver,
  dataRevision: z.number().int().min(0),
  file: z.string().regex(/^pfm-data\.\d+\.enc$/),
  bytes: z.number().int().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  kdf: z.object({
    name: z.literal("PBKDF2"),
    hash: z.literal("SHA-256"),
    iterations: z.number().int().min(PBKDF2_ITERATIONS),
    salt: base64,
  }),
  cipher: z.object({ name: z.literal("AES-GCM"), iv: base64 }),
  sourceCommit: z.string().min(1),
  publishedAt: z.iso.datetime({ offset: true }),
});
export type BundleManifest = z.infer<typeof manifestSchema>;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new AppError("CRYPTO_FAILED", "Web Crypto API is not available (requires a secure context)");
  return s;
}

/** Copies into a fresh ArrayBuffer-backed view (Web Crypto rejects SharedArrayBuffer views). */
function bytes(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(view.byteLength));
  copy.set(view);
  return copy;
}

export function toBase64(data: Uint8Array): string {
  let s = "";
  for (const b of data) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await subtle().digest("SHA-256", bytes(data)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function additionalData(schemaVersion: string, dataRevision: number): Uint8Array<ArrayBuffer> {
  return bytes(new TextEncoder().encode(`${BUNDLE_FORMAT}|${schemaVersion}|rev=${dataRevision}`));
}

/** Derives a non-extractable AES-256-GCM key. The passphrase is not kept anywhere. */
export async function deriveBundleKey(passphrase: string, salt: Uint8Array, iterations: number = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  if (passphrase.length === 0) throw new AppError("CRYPTO_FAILED", "Empty passphrase");
  const base = await subtle().importKey("raw", bytes(new TextEncoder().encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Canonical JSON: object keys sorted recursively, no whitespace. Same data → same bytes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface EncryptInput {
  plaintext: Uint8Array;
  passphrase: string;
  schemaVersion: string;
  dataRevision: number;
  sourceCommit: string;
  publishedAt: string;
  iterations?: number;
}

/** Builds manifest + ciphertext. Used by the publication pipeline (not wired yet: OD-1, OD-7). */
export async function encryptBundle(input: EncryptInput): Promise<{ manifest: BundleManifest; ciphertext: Uint8Array<ArrayBuffer> }> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const iterations = input.iterations ?? PBKDF2_ITERATIONS;
  const key = await deriveBundleKey(input.passphrase, salt, iterations);
  const ciphertext = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(input.schemaVersion, input.dataRevision) },
      key,
      bytes(input.plaintext),
    ),
  );
  const manifest = manifestSchema.parse({
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    schemaVersion: input.schemaVersion,
    dataRevision: input.dataRevision,
    file: `pfm-data.${input.dataRevision}.enc`,
    bytes: ciphertext.byteLength,
    sha256: await sha256Hex(ciphertext),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv: toBase64(iv) },
    sourceCommit: input.sourceCommit,
    publishedAt: input.publishedAt,
  });
  return { manifest, ciphertext };
}

/**
 * Verifies and decrypts. Order (docs/architecture/crypto.md): manifest schema → size and
 * SHA-256 → key derivation → AES-GCM with the AAD rebuilt from the manifest. Any failure
 * throws AppError and nothing is returned. Schema validation of the plaintext is the
 * caller's next step (services/data).
 */
export async function decryptBundle(manifestInput: unknown, ciphertext: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const parsed = manifestSchema.safeParse(manifestInput);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid bundle manifest");
  const manifest = parsed.data;
  if (ciphertext.byteLength !== manifest.bytes || (await sha256Hex(ciphertext)) !== manifest.sha256) {
    throw new AppError("INTEGRITY_FAILED", "Bundle hash does not match the manifest");
  }
  const key = await deriveBundleKey(passphrase, fromBase64(manifest.kdf.salt), manifest.kdf.iterations);
  try {
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: fromBase64(manifest.cipher.iv), additionalData: additionalData(manifest.schemaVersion, manifest.dataRevision) },
      key,
      bytes(ciphertext),
    );
    return new Uint8Array(plain);
  } catch (cause) {
    // Wrong passphrase, altered bytes and a swapped AAD are indistinguishable by design.
    throw new AppError("CRYPTO_FAILED", "Decryption failed: wrong passphrase or altered data", { cause });
  }
}
