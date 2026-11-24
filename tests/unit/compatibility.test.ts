import { describe, expect, it } from "vitest";
import { DATA_COMPATIBILITY } from "@/lib/config/app";
import { AppError } from "@/lib/errors/app-error";
import { assertRevisionNotOlder, assertSchemaCompatible, isSchemaCompatible, parseSemVer } from "@/lib/validation/compatibility";

describe("data version compatibility", () => {
  it("reads the current version and newer minors/patches of the same major", () => {
    expect(isSchemaCompatible(DATA_COMPATIBILITY.current)).toBe(true);
    expect(isSchemaCompatible("1.4.0")).toBe(true);
    expect(isSchemaCompatible("1.0.9")).toBe(true);
  });

  it("rejects another major with INCOMPATIBLE_SCHEMA_VERSION", () => {
    expect(isSchemaCompatible("2.0.0")).toBe(false);
    expect(isSchemaCompatible("0.9.0")).toBe(false);
    try {
      assertSchemaCompatible("2.0.0");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("INCOMPATIBLE_SCHEMA_VERSION");
    }
  });

  it("rejects malformed versions", () => {
    expect(() => parseSemVer("1.0")).toThrow(AppError);
    expect(isSchemaCompatible("v1.0.0")).toBe(false);
  });

  it("never accepts an older dataRevision unless restoring", () => {
    expect(() => assertRevisionNotOlder(5, null)).not.toThrow();
    expect(() => assertRevisionNotOlder(5, 5)).not.toThrow();
    expect(() => assertRevisionNotOlder(6, 5)).not.toThrow();
    expect(() => assertRevisionNotOlder(4, 5)).toThrow(expect.objectContaining({ code: "DATA_REVISION_REGRESSION" }));
    expect(() => assertRevisionNotOlder(4, 5, { allowRestore: true })).not.toThrow();
  });
});
