import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENV_REQUIREMENTS,
  assertRequiredEnv,
  validateEnv,
} from "./index";

function fullEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {};
  for (const r of DEFAULT_ENV_REQUIREMENTS) base[r.key] = "value";
  return { ...base, ...overrides };
}

describe("env-validation", () => {
  it("passes when every required key is present", () => {
    const r = validateEnv(fullEnv());
    expect(r.ok).toBe(true);
    expect(r.missingRequired).toEqual([]);
  });

  it("flags missing required keys", () => {
    const r = validateEnv(fullEnv({ SUPABASE_URL: undefined }));
    expect(r.ok).toBe(false);
    expect(r.missingRequired).toContain("SUPABASE_URL");
  });

  it("treats empty strings as missing", () => {
    const r = validateEnv(fullEnv({ LOVABLE_API_KEY: "   " }));
    expect(r.ok).toBe(false);
    expect(r.missingRequired).toContain("LOVABLE_API_KEY");
  });

  it("separates optional keys into missingOptional", () => {
    const r = validateEnv(fullEnv({ UPSTOX_ACCESS_TOKEN: undefined }));
    expect(r.ok).toBe(true);
    expect(r.missingOptional).toContain("UPSTOX_ACCESS_TOKEN");
  });

  it("groups by category", () => {
    const r = validateEnv(fullEnv({ SUPABASE_URL: undefined }));
    expect(r.byCategory.secrets.missing).toContain("SUPABASE_URL");
  });

  it("assertRequiredEnv throws when required missing", () => {
    expect(() => assertRequiredEnv(fullEnv({ SUPABASE_DB_URL: undefined }))).toThrow(
      /SUPABASE_DB_URL/,
    );
  });

  it("assertRequiredEnv is silent when all present", () => {
    expect(() => assertRequiredEnv(fullEnv())).not.toThrow();
  });
});