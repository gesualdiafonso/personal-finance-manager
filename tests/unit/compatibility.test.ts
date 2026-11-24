import { describe, expect, it } from "vitest";
import { DATA_COMPATIBILITY } from "@/lib/config/app";
import { AppError } from "@/lib/errors/app-error";
import { assertCurrentSchema, assertRevisionNotOlder, assertSchemaCompatible, classifySchemaVersion, isSchemaCompatible, parseSemVer } from "@/lib/validation/compatibility";

describe("data version compatibility", () => {
  it("reads the current version and newer minors/patches of the same major", () => {
    expect(DATA_COMPATIBILITY.current).toBe("2.1.0");
    expect(isSchemaCompatible(DATA_COMPATIBILITY.current)).toBe(true);
    expect(isSchemaCompatible("2.4.0")).toBe(true);
    expect(isSchemaCompatible("2.0.9")).toBe(true);
  });

  it("classifies older majors as needing migration and newer majors as unsupported", () => {
    expect(classifySchemaVersion("2.1.0")).toBe("current");
    expect(classifySchemaVersion("1.0.0")).toBe("needs-migration");
    expect(classifySchemaVersion("3.0.0")).toBe("unsupported-future");
    expect(() => assertCurrentSchema("1.0.0")).toThrow(/migrate/);
    expect(() => assertCurrentSchema("3.0.0")).toThrow(/update the application/);
  });

  it("rejects another major with INCOMPATIBLE_SCHEMA_VERSION", () => {
    expect(isSchemaCompatible("1.0.0")).toBe(false);
    expect(isSchemaCompatible("3.0.0")).toBe(false);
    try {
      assertSchemaCompatible("3.0.0");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("INCOMPATIBLE_SCHEMA_VERSION");
    }
  });

  it("rejects malformed versions", () => {
    expect(() => parseSemVer("2.0")).toThrow(AppError);
    expect(isSchemaCompatible("v2.0.0")).toBe(false);
  });

  it("never accepts an older dataRevision unless restoring", () => {
    expect(() => assertRevisionNotOlder(5, null)).not.toThrow();
    expect(() => assertRevisionNotOlder(5, 5)).not.toThrow();
    expect(() => assertRevisionNotOlder(6, 5)).not.toThrow();
    expect(() => assertRevisionNotOlder(4, 5)).toThrow(expect.objectContaining({ code: "DATA_REVISION_REGRESSION" }));
    expect(() => assertRevisionNotOlder(4, 5, { allowRestore: true })).not.toThrow();
  });
});
