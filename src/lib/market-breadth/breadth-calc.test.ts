import { describe, it, expect } from "vitest";
import { computeBreadth } from "./breadth-calc";
import type { SymbolTick } from "./types";

function tick(symbol: string, direction: SymbolTick["direction"]): SymbolTick {
  return { symbol, direction, changePercent: null };
}

describe("computeBreadth", () => {
  it("computes advances/declines/A-D ratio from actual coverage", () => {
    const expected = ["A", "B", "C", "D"];
    const s = computeBreadth({
      universe: "BROAD_NSE",
      provider: "MOCK",
      timestamp: new Date().toISOString(),
      expectedSymbols: expected,
      ticks: [tick("A", "ADVANCE"), tick("B", "ADVANCE"), tick("C", "DECLINE"), tick("D", "UNCHANGED")],
      snapshotId: "s1",
      freshnessMs: 1000,
    });
    expect(s.advances).toBe(2);
    expect(s.declines).toBe(1);
    expect(s.unchanged).toBe(1);
    expect(s.unavailable).toBe(0);
    expect(s.advanceDeclineRatio).toBe(2);
    expect(s.netBreadth).toBe(1);
    expect(s.constituentCoverage).toBe(1);
    expect(s.dataQuality).toBe("OK");
  });

  it("marks PARTIAL and reports coverage when constituents missing (never fabricated)", () => {
    const expected = ["A", "B", "C", "D"];
    const s = computeBreadth({
      universe: "NIFTY50",
      provider: "MOCK",
      timestamp: new Date().toISOString(),
      expectedSymbols: expected,
      ticks: [tick("A", "ADVANCE"), tick("B", "DECLINE")],
      snapshotId: "s2",
      freshnessMs: 1000,
    });
    expect(s.unavailable).toBe(2);
    expect(s.constituentCoverage).toBeCloseTo(0.5, 3);
    expect(s.dataQuality).toBe("PARTIAL");
    expect(s.warnings.some((w) => /partial coverage/i.test(w))).toBe(true);
  });

  it("FAILED when zero coverage", () => {
    const s = computeBreadth({
      universe: "NIFTY50",
      provider: "MOCK",
      timestamp: new Date().toISOString(),
      expectedSymbols: ["A", "B"],
      ticks: [tick("A", "UNAVAILABLE"), tick("B", "UNAVAILABLE")],
      snapshotId: "s3",
      freshnessMs: 1000,
    });
    expect(s.dataQuality).toBe("FAILED");
    expect(s.constituentCoverage).toBe(0);
  });

  it("computes weighted breadth from registry weights", () => {
    const weights = new Map([["A", 0.5], ["B", 0.3], ["C", 0.2]]);
    const s = computeBreadth({
      universe: "NIFTY_TOP_WEIGHTED",
      provider: "MOCK",
      timestamp: new Date().toISOString(),
      expectedSymbols: ["A", "B", "C"],
      weights,
      ticks: [tick("A", "ADVANCE"), tick("B", "DECLINE"), tick("C", "ADVANCE")],
      registryVersion: "reg@2025",
      snapshotId: "s4",
      freshnessMs: 1000,
    });
    expect(s.weightedAdvance).toBeCloseTo(0.7, 6);
    expect(s.weightedDecline).toBeCloseTo(0.3, 6);
    expect(s.weightedBreadth).toBeCloseTo(0.4, 6);
    expect(s.totalWeight).toBeCloseTo(1, 6);
    expect(s.registryVersion).toBe("reg@2025");
  });

  it("STALE when freshness exceeds threshold", () => {
    const s = computeBreadth({
      universe: "BROAD_NSE",
      provider: "MOCK",
      timestamp: new Date().toISOString(),
      expectedSymbols: ["A"],
      ticks: [tick("A", "ADVANCE")],
      freshnessMs: 10 * 60 * 1000,
      staleThresholdMs: 5 * 60 * 1000,
      snapshotId: "s5",
    });
    expect(s.freshness).toBe("STALE");
    expect(s.dataQuality).toBe("STALE");
  });

  it("A/D ratio is null when denominator is zero (no infinity leak)", () => {
    const s = computeBreadth({
      universe: "BROAD_NSE",
      provider: "MOCK",
      timestamp: new Date().toISOString(),
      expectedSymbols: ["A"],
      ticks: [tick("A", "ADVANCE")],
      freshnessMs: 1000,
      snapshotId: "s6",
    });
    expect(s.advanceDeclineRatio).toBe(null);
  });
});
