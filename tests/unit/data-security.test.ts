import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { canonicalJson, decryptBundle, encryptBundle, sha256Hex, toBase64 } from "@/services/crypto/bundle";
import { exportData } from "@/services/exchange/exchange";
import { importPublication, openLocalStore } from "@/services/storage/local-store";
import { samplePublication } from "../helpers/sample-data";

/**
 * Security tests required by Step 02 Phase 07 (docs/architecture/data-security.md).
 * They exercise the EXISTING bundle design (Step 00/01); no new encryption is enabled here.
 */
const PASS = "frase de prueba con cinco palabras";
const plaintext = new TextEncoder().encode(canonicalJson({ format: "pfm.bundle.content", files: { "meta.json": { ejemplo: "EJEMPLO-FICTICIO" } } }));
const sample = () =>
  encryptBundle({ plaintext, passphrase: PASS, schemaVersion: "2.0.0", dataRevision: 7, sourceCommit: "abc123", publishedAt: "2026-11-24T09:00:00-03:00", iterations: 600_000 });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resolved";
  } catch (e) {
    return e instanceof AppError ? e.code : "other";
  }
}

describe("encrypted bundle — failure modes", () => {
  it("modified ciphertext with a matching hash fails authentication (GCM tag)", async () => {
    const { manifest, ciphertext } = await sample();
    const altered = ciphertext.slice();
    altered[altered.length - 1] = altered[altered.length - 1]! ^ 0x01;
    // An attacker who can also edit the manifest recomputes the hash: AES-GCM must still refuse.
    const forged = { ...manifest, sha256: await sha256Hex(altered) };
    expect(await code(decryptBundle(forged, altered, PASS))).toBe("CRYPTO_FAILED");
  });

  it("truncated ciphertext is rejected before decrypting", async () => {
    const { manifest, ciphertext } = await sample();
    expect(await code(decryptBundle(manifest, ciphertext.slice(0, -1), PASS))).toBe("INTEGRITY_FAILED");
  });

  it("an invalid key (wrong passphrase or altered salt) fails", async () => {
    const { manifest, ciphertext } = await sample();
    expect(await code(decryptBundle(manifest, ciphertext, PASS + " "))).toBe("CRYPTO_FAILED");
    const salt = toBase64(new Uint8Array(16).fill(7));
    expect(await code(decryptBundle({ ...manifest, kdf: { ...manifest.kdf, salt } }, ciphertext, PASS))).toBe("CRYPTO_FAILED");
  });

  it("an altered IV or schemaVersion (AAD) fails authentication", async () => {
    const { manifest, ciphertext } = await sample();
    const iv = toBase64(new Uint8Array(12).fill(1));
    expect(await code(decryptBundle({ ...manifest, cipher: { ...manifest.cipher, iv } }, ciphertext, PASS))).toBe("CRYPTO_FAILED");
    expect(await code(decryptBundle({ ...manifest, schemaVersion: "2.0.1" }, ciphertext, PASS))).toBe("CRYPTO_FAILED");
  });

  it("missing metadata is rejected before any key derivation", async () => {
    const { manifest, ciphertext } = await sample();
    for (const field of ["kdf", "cipher", "sha256", "schemaVersion", "dataRevision"] as const) {
      const incomplete: Partial<typeof manifest> = { ...manifest };
      delete incomplete[field];
      expect(await code(decryptBundle(incomplete, ciphertext, PASS))).toBe("VALIDATION_FAILED");
    }
  });

  it("failure messages never contain the passphrase or the plaintext", async () => {
    const { manifest, ciphertext } = await sample();
    try {
      await decryptBundle(manifest, ciphertext, "secreto-de-prueba");
    } catch (e) {
      const text = `${(e as Error).message} ${JSON.stringify((e as AppError).details)}`;
      expect(text).not.toContain("secreto-de-prueba");
      expect(text).not.toContain("EJEMPLO-FICTICIO");
    }
  });
});

describe("local data is NOT encrypted (stated, not hidden)", () => {
  it("IndexedDB holds readable records: at-rest encryption is open decision OD-3", async () => {
    const db = await openLocalStore();
    const { dataSet, files } = await samplePublication(2);
    await importPublication(db, dataSet, files);
    const raw = JSON.stringify(await db.getAll("accounts"));
    expect(raw).toContain("EJEMPLO-FICTICIO");
    db.close();
  });

  it("exports are plaintext JSON with an integrity hash, not encryption (D2-07)", async () => {
    const db = await openLocalStore();
    const { dataSet, files } = await samplePublication(2);
    await importPublication(db, dataSet, files);
    const file = await exportData(db);
    expect(file.integrity.algorithm).toBe("SHA-256");
    expect(JSON.stringify(file)).toContain("EJEMPLO-FICTICIO");
    expect(Object.keys(file)).not.toContain("cipher");
    db.close();
  });

  it("no key, passphrase or salt is stored next to the data", async () => {
    const db = await openLocalStore();
    const { dataSet, files } = await samplePublication(2);
    await importPublication(db, dataSet, files);
    for (const store of db.objectStoreNames) {
      const text = JSON.stringify(await db.getAll(store as never)).toLowerCase();
      expect(text).not.toMatch(/passphrase|password|"salt"|privatekey|cryptokey/);
    }
    db.close();
  });
});
