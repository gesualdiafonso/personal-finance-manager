import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { DataFileMap } from "@/services/data/dataset";

const DATA_DIR = resolve(__dirname, "../../data");

/** Loads the fictitious sample data in data/ as a file map (fresh copy each call). */
export function loadSampleFiles(): DataFileMap {
  const out: DataFileMap = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".json")) out[relative(DATA_DIR, path).replaceAll("\\", "/")] = JSON.parse(readFileSync(path, "utf8"));
    }
  };
  walk(DATA_DIR);
  return out;
}

/** Deep clone helper for mutation tests. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Fictitious record id used in data/ (n in hex in the last group). */
export const sampleId = (n: number) => `0193a1b0-${n.toString(16).padStart(4, "0")}-7000-8000-${n.toString(16).padStart(12, "0")}`;

/** The sample data as a validated publication with the given dataRevision. */
export async function samplePublication(revision = 2) {
  const { validateDataFiles } = await import("@/services/data/dataset");
  const files = loadSampleFiles();
  (files["meta.json"] as { dataRevision: number }).dataRevision = revision;
  const { dataSet } = validateDataFiles(files);
  if (!dataSet) throw new Error("sample data invalid");
  return { dataSet, files };
}
