import { describe, it, expect } from "vitest";
import {
  round2,
  clamp,
  computeEma,
  biasFromPct,
  sectorBreadth,
  vixStrategy,
  pcrFocusFromOI,
  pcrFocusFromRatio,
} from "./strategy-math";

describe("round2 / clamp", () => {
  it("rounds to 2 decimals", () => {
    expect(round2(1.23456)).toBe(1.23);
    expect(round2(1.005)).toBe(1.0);
  });
  it("clamps into range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("computeEma", () => {
  it("returns null when fewer closes than the period", () => {
    expect(computeEma([1, 2, 3], 5)).toBeNull();
  });
  it("equals the SMA when length == period", () => {
    expect(computeEma([10, 20, 30], 3)).toBe(20);
  });
  it("weights recent closes more heavily (rising series)", () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const ema = computeEma(closes, 13)!;
    const sma = closes.slice(0, 13).reduce((a, b) => a + b, 0) / 13;
    expect(ema).toBeGreaterThan(sma);
    expect(ema).toBeLessThanOrEqual(24);
  });
  it("is deterministic", () => {
    const closes = [100, 101, 99, 102, 98, 103];
    expect(computeEma(closes, 3)).toBe(computeEma(closes, 3));
  });
});

describe("biasFromPct", () => {
  it("uses the ±0.15 threshold", () => {
    expect(biasFromPct(0.16)).toBe("Bullish");
    expect(biasFromPct(0.15)).toBe("Neutral");
    expect(biasFromPct(-0.15)).toBe("Neutral");
    expect(biasFromPct(-0.16)).toBe("Bearish");
    expect(biasFromPct(0)).toBe("Neutral");
  });
});

describe("sectorBreadth", () => {
  it("splits 50 members and always sums to 50", () => {
    for (const pct of [-10, -3, 0, 3, 10]) {
      const b = sectorBreadth(pct);
      expect(b.advance + b.decline).toBe(50);
      expect(b.advance).toBeGreaterThanOrEqual(0);
      expect(b.decline).toBeGreaterThanOrEqual(0);
    }
  });
  it("gives more advances on positive moves", () => {
    expect(sectorBreadth(5).advance).toBeGreaterThan(sectorBreadth(-5).advance);
  });
  it("respects the 0.05..0.95 fraction clamp", () => {
    expect(sectorBreadth(100).advance).toBeLessThanOrEqual(48); // 0.95 * 50 rounded
    expect(sectorBreadth(-100).advance).toBeGreaterThanOrEqual(2);
  });
});

describe("vixStrategy (India VIX bands)", () => {
  it("returns ITM below 15", () => {
    const s = vixStrategy(12, 1.2);
    expect(s.band).toBe("ITM");
    expect(s.tone).toBe("green");
    expect(s.changePct).toBe(1.2);
  });
  it("returns ATM within 15..20 inclusive", () => {
    expect(vixStrategy(15, 0).band).toBe("ATM");
    expect(vixStrategy(20, 0).band).toBe("ATM");
    expect(vixStrategy(17, 0).tone).toBe("yellow");
  });
  it("returns OTM above 20", () => {
    const s = vixStrategy(25, -2);
    expect(s.band).toBe("OTM");
    expect(s.tone).toBe("red");
  });
});

describe("pcrFocus decisions", () => {
  it("uses change-in-OI ratio for the live chain", () => {
    expect(pcrFocusFromOI(100, 200)).toBe("CALL"); // put writing dominates
    expect(pcrFocusFromOI(200, 100)).toBe("PUT");
    expect(pcrFocusFromOI(100, 100)).toBe("NEUTRAL");
  });
  it("uses the PCR ratio for the derived proxy", () => {
    expect(pcrFocusFromRatio(1.2)).toBe("CALL");
    expect(pcrFocusFromRatio(0.8)).toBe("PUT");
    expect(pcrFocusFromRatio(1.0)).toBe("NEUTRAL");
  });
});