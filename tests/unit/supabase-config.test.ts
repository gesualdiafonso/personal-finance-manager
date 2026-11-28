import { describe, expect, it } from "vitest";
import { classifyKey, describeSupabaseConfig, findPrivilegedPublicVariables, parseSupabaseConfig, readSupabasePublicEnv } from "@/lib/supabase/config";
import { configuredEnv, FAKE } from "../helpers/supabase-fixtures";

/** Step 12 — environment validation (Zod), missing/invalid configuration, secret refusal. */
describe("Supabase environment validation", () => {
  it("is 'not-configured' — not an error — when nothing is set (the app keeps working locally)", () => {
    const config = parseSupabaseConfig({});
    expect(config).toEqual({ status: "not-configured", missing: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)"] });
    expect(describeSupabaseConfig(config)).toContain("keeps working locally");
    expect(parseSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "  ", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }).status).toBe("not-configured");
  });

  it("accepts the publishable key (preferred) and the legacy anon key", () => {
    expect(parseSupabaseConfig(configuredEnv)).toEqual({ status: "configured", url: FAKE.url, publishableKey: FAKE.publishableKey, keyKind: "publishable", keyVariable: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" });
    expect(parseSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: FAKE.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE.legacyAnonKey })).toMatchObject({ status: "configured", keyKind: "legacy-anon", keyVariable: "NEXT_PUBLIC_SUPABASE_ANON_KEY" });
    // Both set: the publishable key wins.
    expect(parseSupabaseConfig({ ...configuredEnv, NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE.legacyAnonKey })).toMatchObject({ keyKind: "publishable" });
    // Local Supabase (CLI) over http on localhost.
    expect(parseSupabaseConfig({ ...configuredEnv, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toMatchObject({ status: "configured", url: "http://127.0.0.1:54321" });
    expect(parseSupabaseConfig({ ...configuredEnv, NEXT_PUBLIC_SUPABASE_URL: `${FAKE.url}/` })).toMatchObject({ url: FAKE.url });
  });

  it("rejects invalid URLs and keys with value-free messages", () => {
    const cases: [Record<string, string>, string][] = [
      [{ ...configuredEnv, NEXT_PUBLIC_SUPABASE_URL: "no-es-una-url" }, "url-invalid"],
      [{ ...configuredEnv, NEXT_PUBLIC_SUPABASE_URL: "http://ejemploficticio.supabase.example" }, "url-insecure"],
      [{ ...configuredEnv, NEXT_PUBLIC_SUPABASE_URL: "https://user:pass@ejemploficticio.supabase.example" }, "url-has-credentials"],
      [{ ...configuredEnv, NEXT_PUBLIC_SUPABASE_URL: `${FAKE.url}/rest/v1` }, "url-has-path"],
      [{ ...configuredEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "clave-cualquiera" }, "key-invalid"],
      [{ NEXT_PUBLIC_SUPABASE_URL: FAKE.url }, "key-invalid"], // half configured
      [{ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE.publishableKey }, "url-invalid"],
    ];
    for (const [env, code] of cases) {
      const config = parseSupabaseConfig(env);
      expect(config.status, code).toBe("invalid");
      if (config.status !== "invalid") continue;
      expect(config.problems.map((p) => p.code)).toContain(code);
      const text = JSON.stringify(config) + describeSupabaseConfig(config);
      for (const value of Object.values(env)) if (value.length > 12) expect(text).not.toContain(value);
    }
  });

  it("refuses a privileged key in a public variable, even with no URL", () => {
    for (const env of [
      { ...configuredEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE.secretKey },
      { NEXT_PUBLIC_SUPABASE_URL: FAKE.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE.serviceRoleKey },
      { NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE.secretKey },
    ]) {
      const config = parseSupabaseConfig(env);
      expect(config).toMatchObject({ status: "invalid", problems: [expect.objectContaining({ code: "key-privileged" })] });
      expect(JSON.stringify(config)).not.toContain(FAKE.secretKey);
      expect(JSON.stringify(config)).not.toContain(FAKE.serviceRoleKey);
    }
    expect(classifyKey(FAKE.secretKey)).toEqual({ problem: "key-privileged" });
    expect(classifyKey(FAKE.serviceRoleKey)).toEqual({ problem: "key-privileged" });
    expect(classifyKey(FAKE.legacyAnonKey)).toEqual({ kind: "legacy-anon" });
  });

  it("the build guard finds privileged values in any NEXT_PUBLIC_ variable, by name only", () => {
    expect(
      findPrivilegedPublicVariables({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE.publishableKey,
        NEXT_PUBLIC_OTRA: FAKE.secretKey,
        NEXT_PUBLIC_JWT: FAKE.serviceRoleKey,
        SUPABASE_SECRET_KEY: FAKE.secretKey, // server-only variable: allowed to exist
      }),
    ).toEqual(["NEXT_PUBLIC_JWT", "NEXT_PUBLIC_OTRA"]);
    expect(findPrivilegedPublicVariables({ NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE.legacyAnonKey })).toEqual([]);
  });

  it("reads only the public variables from process.env", () => {
    expect(Object.keys(readSupabasePublicEnv()).sort()).toEqual(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });
});
