import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { assertRevisionNotOlder } from "@/lib/validation/compatibility";
import { canonicalJson, decryptBundle, manifestSchema } from "@/services/crypto/bundle";
import { validateDataFiles, type DataFileMap, type OfficialDataSet } from "./dataset";

/**
 * Data loading abstractions. Every source returns the same thing — a fully validated
 * OfficialDataSet — or throws an AppError. Nothing unvalidated reaches the interface
 * or IndexedDB.
 */
export interface OfficialDataSource {
  readonly kind: "file-map" | "published";
  load(): Promise<OfficialDataSet>;
}

function validatedOrThrow(files: DataFileMap): OfficialDataSet {
  const { dataSet, issues } = validateDataFiles(files);
  if (!dataSet) {
    throw new AppError("VALIDATION_FAILED", `Data failed validation (${issues.length} issue(s))`, {
      details: issues.slice(0, 20).map((i) => `[${i.layer}] ${i.file}${i.recordId ? ` ${i.recordId}` : ""}: ${i.message}`),
    });
  }
  return dataSet;
}

/** A map of data files already in memory: the CLI validator, tests, imported files. */
export function createFileMapSource(files: DataFileMap): OfficialDataSource {
  return { kind: "file-map", load: async () => validatedOrThrow(files) };
}

/** Plaintext inside the encrypted bundle: every file of data/, canonical JSON. */
const bundleContentSchema = z.object({
  format: z.literal("pfm.bundle.content"),
  files: z.record(z.string(), z.unknown()),
});

export function serializeBundleContent(files: DataFileMap): Uint8Array {
  return new TextEncoder().encode(canonicalJson({ format: "pfm.bundle.content", files }));
}

export interface PublishedSourceOptions {
  /** URL of /data/manifest.json on the hosting. */
  manifestUrl: string;
  passphrase: string;
  /** dataRevision already in IndexedDB, or null on first import. */
  localRevision: number | null;
  allowRestore?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * Reads the encrypted publication: manifest → bundle → hash → decrypt → validate (4 layers)
 * → revision check. Not wired to the interface in Step 01: no publication exists yet
 * (pipeline publication depends on OD-1 and OD-7).
 */
export function createPublishedSource(options: PublishedSourceOptions): OfficialDataSource {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    kind: "published",
    async load() {
      const manifestResponse = await doFetch(options.manifestUrl, { cache: "no-cache" });
      if (!manifestResponse.ok) throw new AppError("UNKNOWN", `Manifest request failed (${manifestResponse.status})`);
      const manifest = manifestSchema.safeParse(await manifestResponse.json());
      if (!manifest.success) throw new AppError("VALIDATION_FAILED", "Invalid bundle manifest");
      assertRevisionNotOlder(manifest.data.dataRevision, options.localRevision, { allowRestore: options.allowRestore });

      const bundleUrl = new URL(manifest.data.file, new URL(options.manifestUrl, "http://localhost")).toString();
      const bundleResponse = await doFetch(bundleUrl);
      if (!bundleResponse.ok) throw new AppError("UNKNOWN", `Bundle request failed (${bundleResponse.status})`);
      const ciphertext = new Uint8Array(await bundleResponse.arrayBuffer());

      const plaintext = await decryptBundle(manifest.data, ciphertext, options.passphrase);
      let content: unknown;
      try {
        content = JSON.parse(new TextDecoder().decode(plaintext));
      } catch (cause) {
        throw new AppError("VALIDATION_FAILED", "Decrypted bundle is not valid JSON", { cause });
      }
      const parsed = bundleContentSchema.safeParse(content);
      if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Unexpected bundle content");
      const dataSet = validatedOrThrow(parsed.data.files);
      if (dataSet.meta.dataRevision !== manifest.data.dataRevision || dataSet.meta.schemaVersion !== manifest.data.schemaVersion) {
        throw new AppError("INTEGRITY_FAILED", "Manifest and bundle content disagree on revision or schemaVersion");
      }
      return dataSet;
    },
  };
}
