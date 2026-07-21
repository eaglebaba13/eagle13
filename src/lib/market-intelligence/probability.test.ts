import { describe, it, expect } from "vitest";
import { computeInstitutionalProbability } from "./probability";

describe("probability", () => {
  it("returns bullish tilt when institutional plus global plus breadth align", () => {
    const r = computeInstitutionalProbability({
      institutionalBias: "STRONG_BUY",
      macroRisk: "LOW",
      sectorRotationScore: 40,
      globalCompositeBiasPct: 0.5,
      vix: 11,
      breadthAdvanceDeclinePct: 0.4,
      pcr: 1.35,
    });
    expect(r.bullishPct).toBeGreaterThan(70);
    expect(r.confidence).toBeGreaterThan(0.6);
  });
  it("flags conflicts and returns partial confidence when inputs missing", () => {
    const r = computeInstitutionalProbability({
      institutionalBias: "STRONG_BUY",
      macroRisk: "HIGH",
      globalCompositeBiasPct: -0.6,
    });
    expect(r.conflicts.length).toBeGreaterThan(0);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThan(0.7);
  });
});