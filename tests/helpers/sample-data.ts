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
