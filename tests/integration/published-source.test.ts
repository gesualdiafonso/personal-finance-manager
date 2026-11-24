import { describe, expect, it } from "vitest";
import { encryptBundle } from "@/services/crypto/bundle";
import { createFileMapSource, createPublishedSource, serializeBundleContent } from "@/services/data/sources";
import { loadSampleFiles } from "../helpers/sample-data";

const PASS = "frase de prueba con cinco palabras";

async function publish(revision = 1) {
  const files = loadSampleFiles();
  (files["meta.json"] as { dataRevision: number }).dataRevision = revision;
  const { manifest, ciphertext } = await encryptBundle({
    plaintext: serializeBundleContent(files),
    passphrase: PASS,
    schemaVersion: "1.0.0",
    dataRevision: revision,
    sourceCommit: "test",
    publishedAt: "2026-11-24T09:10:00-03:00",
  });
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/data/manifest.json")) return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json" } });
    if (url.endsWith(`/data/${manifest.file}`)) return new Response(ciphertext);
    return new Response("not found", { status: 404 });
  };
  return { manifest, fetchImpl };
}

describe("data loading abstractions", () => {
  it("file-map source validates before returning", async () => {
    const dataSet = await createFileMapSource(loadSampleFiles()).load();
    expect(dataSet.accounts).toHaveLength(2);
    await expect(createFileMapSource({}).load()).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("published source: manifest → hash → decrypt → validate", async () => {
    const { fetchImpl } = await publish(3);
    const source = createPublishedSource({ manifestUrl: "https://pfm.test/data/manifest.json", passphrase: PASS, localRevision: 2, fetchImpl });
    const dataSet = await source.load();
    expect(dataSet.meta.dataRevision).toBe(3);
    expect(Object.values(dataSet.transactions).flat()).toHaveLength(4);
  });

  it("published source rejects a wrong passphrase and an older revision", async () => {
    const { fetchImpl } = await publish(3);
    const url = "https://pfm.test/data/manifest.json";
    await expect(createPublishedSource({ manifestUrl: url, passphrase: "otra", localRevision: null, fetchImpl }).load()).rejects.toMatchObject({ code: "CRYPTO_FAILED" });
    await expect(createPublishedSource({ manifestUrl: url, passphrase: PASS, localRevision: 4, fetchImpl }).load()).rejects.toMatchObject({ code: "DATA_REVISION_REGRESSION" });
  });
});
