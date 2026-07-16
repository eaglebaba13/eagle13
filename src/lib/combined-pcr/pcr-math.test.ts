import { describe, it, expect } from "vitest";
import {
  aggregateStrikes,
  combinedScore,
  instrumentScore,
  normalizePcr,
  renormalizeWeights,
  safeRatio,
  validateWeights,
} from "./pcr-math";
import { makeStrike } from "../option-chain/types";
import { DEFAULT_COMBINED_PCR_WEIGHTS, type InstrumentPcr } from "./types";

function inst(u: "NIFTY" | "BANKNIFTY", score: number | null, w: number): InstrumentPcr {
  return {
    underlying: u, rawOiPcr: 1, rawChangeOiPcr: 1,
    normalizedOiPcr: score, normalizedChangeOiPcr: score,
    instrumentScore: score, weight: w, configuredWeight: w,
    strikeCount: 21, atm: null, expiry: null, provider: "MOCK",
    timestamp: new Date().toISOString(), snapshotId: "x", missing: [],
  };
}

describe("pcr-math", () => {
  it("aggregates OI and positive change OI", () => {
    const s = [
      makeStrike(100, { oi: 500, changeOi: 20 }, { oi: 800, changeOi: -30 }),
      makeStrike(105, { oi: 300, changeOi: -10 }, { oi: 700, changeOi: 40 }),
    ];
    const a = aggregateStrikes(s);
    expect(a.callOi).toBe(800);
    expect(a.putOi).toBe(1500);
    expect(a.callChangeOiPositive).toBe(20);
    expect(a.putChangeOiPositive).toBe(40);
  });

  it("safe division rejects zero / negative", () => {
    expect(safeRatio(10, 0)).toBeNull();
    expect(safeRatio(-1, 5)).toBeNull();
    expect(safeRatio(10, 5)).toBe(2);
  });

  it("normalization: PCR = 1 → 0 exactly, clamps at extremes", () => {
    expect(normalizePcr(1)).toBe(0);
    expect(normalizePcr(0)).toBeNull();
    expect(normalizePcr(-1)).toBeNull();
    const hi = normalizePcr(100);
    const lo = normalizePcr(0.01);
    expect(hi).not.toBeNull();
    expect(lo).not.toBeNull();
    expect(hi! <= 100).toBe(true);
    expect(lo! >= -100).toBe(true);
    // Symmetry
    expect(Math.abs((normalizePcr(2) ?? 0) + (normalizePcr(0.5) ?? 0))).toBeLessThan(1e-9);
  });

  it("instrument score weights OI 0.55 / change 0.45", () => {
    expect(instrumentScore(100, 0)).toBeCloseTo(55, 6);
    expect(instrumentScore(0, 100)).toBeCloseTo(45, 6);
    expect(instrumentScore(null, 20)).toBeNull();
  });

  it("weight validation and renormalization", () => {
    expect(validateWeights(DEFAULT_COMBINED_PCR_WEIGHTS).ok).toBe(true);
    expect(validateWeights({ NIFTY: 0.5, BANKNIFTY: 0.4 }).ok).toBe(false);
    const eff = renormalizeWeights([
      { weight: 0.6, score: 50 },
      { weight: 0.4, score: null },
    ]);
    expect(eff[0]).toBeCloseTo(1, 6);
    expect(eff[1]).toBeNull();
  });

  it("combined score with missing instrument does not treat as zero", () => {
    const both = combinedScore([inst("NIFTY", 40, 0.6), inst("BANKNIFTY", -40, 0.4)]);
    // 0.6*40 + 0.4*-40 = 8
    expect(both).toBeCloseTo(8, 6);
    const nifOnly = combinedScore([inst("NIFTY", 40, 0.6), inst("BANKNIFTY", null, 0.4)]);
    expect(nifOnly).toBeCloseTo(40, 6);
    const none = combinedScore([inst("NIFTY", null, 0.6), inst("BANKNIFTY", null, 0.4)]);
    expect(none).toBeNull();
  });
});