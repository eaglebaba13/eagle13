import { describe, it, expect } from "vitest";
import { explainCapability, isCapabilityLive, type ModuleCapability } from "./capability";

describe("decision capability", () => {
  it("SUPPORTED and PARTIAL are live", () => {
    expect(isCapabilityLive("SUPPORTED")).toBe(true);
    expect(isCapabilityLive("PARTIAL")).toBe(true);
  });

  it("all failure capabilities are not live", () => {
    const failures: ModuleCapability[] = [
      "UNSUPPORTED", "AUTH_REQUIRED", "NO_DATA", "INVALID_RESPONSE",
      "STALE", "DATA_QUALITY_FAILURE", "INVALID_EXPIRY", "NO_STRIKES", "PARTIAL_CHAIN",
    ];
    for (const f of failures) expect(isCapabilityLive(f)).toBe(false);
  });

  it("explainCapability returns non-empty reason + suggestion for every state", () => {
    const all: ModuleCapability[] = [
      "SUPPORTED","PARTIAL","UNSUPPORTED","AUTH_REQUIRED","NO_DATA","INVALID_RESPONSE",
      "STALE","DATA_QUALITY_FAILURE","INVALID_EXPIRY","NO_STRIKES","PARTIAL_CHAIN",
    ];
    for (const c of all) {
      const ex = explainCapability(c, { module: "options", stage: "provider-fetch", provider: "UPSTOX" });
      expect(ex.capability).toBe(c);
      expect(ex.reason.length).toBeGreaterThan(5);
      expect(ex.suggestion.length).toBeGreaterThan(5);
      expect(ex.module).toBe("options");
      expect(ex.provider).toBe("UPSTOX");
    }
  });
});