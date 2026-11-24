import { describe, expect, it } from "vitest";
import { computeChecksums, validateDataFiles } from "@/services/data/dataset";
import { transactionSchema } from "@/lib/validation/schemas";
import { clone, loadSampleFiles } from "../helpers/sample-data";

type Json = Record<string, unknown> & { records: Record<string, unknown>[] };
const TX = "transactions/2026/2026-11.json";

describe("JSON validation of the sample data", () => {
  it("validates in all four layers", () => {
    const { dataSet, issues } = validateDataFiles(loadSampleFiles());
    expect(issues).toEqual([]);
    expect(dataSet?.meta.dataRevision).toBe(1);
    expect(Object.keys(dataSet?.transactions ?? {})).toEqual([TX]);
  });

  it("matches the checksums declared in meta.json (I-10)", () => {
    const files = loadSampleFiles();
    const { dataSet } = validateDataFiles(files);
    expect(computeChecksums(dataSet!)).toEqual((files["meta.json"] as { checksums: unknown }).checksums);
  });
});

describe("layer 1 — structure", () => {
  it("rejects a decimal amount (I-01)", () => {
    const files = clone(loadSampleFiles());
    (files[TX] as Json).records[0]!.amountMinor = 42310.5;
    const { dataSet, issues } = validateDataFiles(files);
    expect(dataSet).toBeNull();
    expect(issues.some((i) => i.layer === "structure" && i.message.startsWith("records.0.amountMinor"))).toBe(true);
  });

  it("rejects an invalid calendar date", () => {
    const record = (loadSampleFiles()[TX] as Json).records[0]!;
    expect(transactionSchema.safeParse({ ...record, date: "2026-02-30" }).success).toBe(false);
  });

  it("rejects a currency other than ARS", () => {
    const files = clone(loadSampleFiles());
    (files["meta.json"] as Record<string, unknown>).currency = "USD";
    expect(validateDataFiles(files).issues.some((i) => i.file === "meta.json")).toBe(true);
  });

  it("rejects an incompatible major schemaVersion", () => {
    const files = clone(loadSampleFiles());
    (files["accounts.json"] as Json).schemaVersion = "2.0.0";
    const { issues } = validateDataFiles(files);
    expect(issues).toContainEqual(expect.objectContaining({ file: "accounts.json", layer: "structure" }));
  });

  it("reports missing required files and unexpected files", () => {
    const files = clone(loadSampleFiles());
    delete files["cards.json"];
    files["notes.json"] = {};
    const messages = validateDataFiles(files).issues.map((i) => `${i.file}: ${i.message}`);
    expect(messages).toContain("cards.json: Required file is missing");
    expect(messages).toContain("notes.json: Unexpected file in data/");
  });
});

describe("layers 2–4 — references, uniqueness, invariants", () => {
  it("detects a reference to a missing account", () => {
    const files = clone(loadSampleFiles());
    (files[TX] as Json).records[1]!.accountId = "0193a1b0-ffff-7000-8000-00000000ffff";
    const { issues } = validateDataFiles(files);
    expect(issues).toContainEqual(expect.objectContaining({ layer: "references", message: "accountId points to a missing or deleted record" }));
  });

  it("detects a duplicate id across files", () => {
    const files = clone(loadSampleFiles());
    const accountId = (files["accounts.json"] as Json).records[0]!.id;
    (files[TX] as Json).records[1]!.id = accountId;
    expect(validateDataFiles(files).issues).toContainEqual(expect.objectContaining({ layer: "uniqueness", recordId: accountId }));
  });

  it("detects a transaction outside its file period", () => {
    const files = clone(loadSampleFiles());
    (files[TX] as Json).records[1]!.date = "2026-12-01";
    expect(validateDataFiles(files).issues).toContainEqual(expect.objectContaining({ message: "date is outside the file period" }));
  });

  it("detects a broken transfer (I-03)", () => {
    const files = clone(loadSampleFiles());
    const legs = (files[TX] as Json).records.filter((r) => r.kind === "transfer");
    legs[1]!.amountMinor = 999;
    const { issues } = validateDataFiles(files);
    expect(issues.some((i) => i.layer === "invariants" && i.message.startsWith("I-03"))).toBe(true);
  });

  it("detects checksum drift (I-10)", () => {
    const files = clone(loadSampleFiles());
    (files[TX] as Json).records.pop();
    expect(validateDataFiles(files).issues).toContainEqual(expect.objectContaining({ layer: "invariants", file: TX }));
  });

  it("never puts amounts or descriptions in issue messages", () => {
    const files = clone(loadSampleFiles());
    (files[TX] as Json).records[1]!.amountMinor = 1;
    const text = JSON.stringify(validateDataFiles(files).issues);
    expect(text).not.toContain("EJEMPLO-FICTICIO");
    expect(text).not.toMatch(/4231000|423100/);
  });
});
