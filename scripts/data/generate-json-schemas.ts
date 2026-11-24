/**
 * Generates schemas/*.schema.json from the Zod schemas (src/lib/validation/schemas.ts).
 * Zod is the source of truth; the JSON Schema files exist for editors and external tools.
 * `--check` fails when the committed files differ from what Zod produces.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { JSON_SCHEMA_EXPORTS } from "../../src/lib/validation/schemas";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = resolve(root, "schemas");

function render(name: string, schema: z.ZodType): string {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  const withId = { $id: `https://pfm.local/schemas/${name}`, ...json };
  return `${JSON.stringify(withId, null, 2)}\n`;
}

const check = process.argv.includes("--check");
mkdirSync(dir, { recursive: true });
let drift = 0;
for (const [name, schema] of Object.entries(JSON_SCHEMA_EXPORTS)) {
  const content = render(name, schema);
  const path = resolve(dir, name);
  if (check) {
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      /* missing */
    }
    if (current !== content) {
      console.error(`schemas/${name} is out of date`);
      drift++;
    }
  } else {
    writeFileSync(path, content);
  }
}
if (check) {
  const expected = new Set(Object.keys(JSON_SCHEMA_EXPORTS));
  for (const f of readdirSync(dir)) {
    if (!expected.has(f)) {
      console.error(`schemas/${f} is not generated from Zod`);
      drift++;
    }
  }
  if (drift > 0) {
    console.error("Run `npm run schemas:build`.");
    process.exit(1);
  }
  console.log(`schemas/ matches the Zod schemas (${expected.size} files)`);
} else {
  console.log(`Wrote ${Object.keys(JSON_SCHEMA_EXPORTS).length} JSON Schema files to schemas/`);
}
