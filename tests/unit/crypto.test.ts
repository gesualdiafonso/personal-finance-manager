import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { canonicalJson, decryptBundle, encryptBundle, manifestSchema, PBKDF2_ITERATIONS } from "@/services/crypto/bundle";

const PASS = "frase de prueba con cinco palabras";
const plaintext = new TextEncoder().encode(canonicalJson({ format: "pfm.bundle.content", files: { "a.json": { x: 1 } } }));

async function sample() {
  return encryptBundle({
    plaintext,
    passphrase: PASS,
    schemaVersion: "1.0.0",
    dataRevision: 42,
    sourceCommit: "abc123",
    publishedAt: "2026-11-24T09:10:00-03:00",
  });
}

async function expectCode(promise: Promise<unknown>, code: AppError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe("encrypted bundle (PBKDF2 600k + AES-256-GCM + AAD)", () => {
  it("round-trips and writes a valid manifest", async () => {
    const { manifest, ciphertext } = await sample();
    expect(manifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.kdf.iterations).toBe(PBKDF2_ITERATIONS);
    expect(manifest.file).toBe("pfm-data.42.enc");
    expect(ciphertext.byteLength).toBe(plaintext.byteLength + 16); // GCM tag
    const decrypted = await decryptBundle(manifest, ciphertext, PASS);
    expect(new TextDecoder().decode(decrypted)).toBe(new TextDecoder().decode(plaintext));
  });

  it("uses a fresh salt and IV every time", async () => {
    const [a, b] = await Promise.all([sample(), sample()]);
    expect(a.manifest.kdf.salt).not.toBe(b.manifest.kdf.salt);
    expect(a.manifest.cipher.iv).not.toBe(b.manifest.cipher.iv);
  });

  it("rejects a wrong passphrase", async () => {
    const { manifest, ciphertext } = await sample();
    await expectCode(decryptBundle(manifest, ciphertext, "otra frase"), "CRYPTO_FAILED");
  });

  it("rejects an altered byte before deriving the key (hash check)", async () => {
    const { manifest, ciphertext } = await sample();
    const altered = ciphertext.slice();
    altered[10] = altered[10]! ^ 1;
    await expectCode(decryptBundle(manifest, altered, PASS), "INTEGRITY_FAILED");
  });

  it("rejects a bundle presented as another revision (AAD)", async () => {
    const { manifest, ciphertext } = await sample();
    await expectCode(decryptBundle({ ...manifest, dataRevision: 43 }, ciphertext, PASS), "CRYPTO_FAILED");
  });

  it("rejects a manifest with weaker key derivation", async () => {
    const { manifest, ciphertext } = await sample();
    await expectCode(decryptBundle({ ...manifest, kdf: { ...manifest.kdf, iterations: 1000 } }, ciphertext, PASS), "VALIDATION_FAILED");
  });

  it("produces canonical JSON independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 0, y: 1 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":1,"z":0}]},"b":1}');
  });
});
