import { describe, it, expect } from "vitest";
import { canDisplayActionableSignal, blockedLabel } from "./actionable-signal";

describe("Phase 24B · actionable-signal safety", () => {
  it("LIVE + OK + formula → allowed", () => {
    const r = canDisplayActionableSignal({ freshness: "LIVE", dataQuality: "OK", formulaVersion: "GANN_NIFTY_ASTRO_V1_1" });
    expect(r.allowed).toBe(true);
  });
  it("STALE blocks", () => {
    const r = canDisplayActionableSignal({ freshness: "STALE", formulaVersion: "V1" });
    expect(r.allowed).toBe(false);
    expect(blockedLabel(r.blockingReasons)).toBe("STALE");
  });
  it("UNAVAILABLE blocks", () => {
    const r = canDisplayActionableSignal({ freshness: "UNAVAILABLE", formulaVersion: "V1" });
    expect(r.allowed).toBe(false);
    expect(blockedLabel(r.blockingReasons)).toBe("DATA UNAVAILABLE");
  });
  it("DELAYED blocks", () => {
    const r = canDisplayActionableSignal({ freshness: "DELAYED", formulaVersion: "V1" });
    expect(r.allowed).toBe(false);
  });
  it("Causality FAILED blocks with validation label", () => {
    const r = canDisplayActionableSignal({ freshness: "LIVE", formulaVersion: "V1", causalityStatus: "FAILED" });
    expect(r.allowed).toBe(false);
    expect(blockedLabel(r.blockingReasons)).toBe("VALIDATION BLOCKED");
  });
  it("missing formula version blocks", () => {
    const r = canDisplayActionableSignal({ freshness: "LIVE" });
    expect(r.allowed).toBe(false);
  });
  it("provider DOWN blocks", () => {
    const r = canDisplayActionableSignal({ freshness: "LIVE", formulaVersion: "V1", providerStatus: "DOWN" });
    expect(r.allowed).toBe(false);
  });
});