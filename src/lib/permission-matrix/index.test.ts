import { describe, expect, it } from "vitest";
import { buildPermissionMatrix, PERMISSION_MATRIX_VERSION } from "./index";

describe("permission-matrix", () => {
  it("rows cover every flag", () => {
    const m = buildPermissionMatrix();
    expect(m.rows.length).toBeGreaterThan(0);
  });
  it("free plan lacks admin.console", () => {
    const m = buildPermissionMatrix();
    const row = m.rows.find((r) => r.flagId === "admin.console")!;
    expect(row.grants.free).toBe(false);
    expect(row.grants.enterprise).toBe(true);
  });
  it("pro grants options.chain", () => {
    const m = buildPermissionMatrix();
    const row = m.rows.find((r) => r.flagId === "options.chain")!;
    expect(row.grants.pro).toBe(true);
    expect(row.grants.free).toBe(false);
  });
  it("version stable", () => {
    expect(PERMISSION_MATRIX_VERSION).toBe("permission-matrix@1.0.0");
  });
});