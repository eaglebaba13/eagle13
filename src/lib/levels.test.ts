import { describe, it, expect } from "vitest";
import { computeLevels, cprBias } from "./levels";
import type { OHLC } from "./market.functions";

// Deterministic OHLC sample.
const ohlc: OHLC = { open: 24000, high: 24200, low: 23900, close: 24100 } as OHLC;

describe("computeLevels — pivot / CPR", () => {
  const l = computeLevels(ohlc, 50);
  const pivot = (24200 + 23900 + 24100) / 3;

  it("computes the classic floor pivot", () => {
    expect(l.pivot).toBeCloseTo(pivot, 2);
  });
  it("orders TC above BC and reports a non-negative CPR width", () => {
    expect(l.tc).toBeGreaterThanOrEqual(l.bc);
    expect(l.cprWidth).toBeGreaterThanOrEqual(0);
    expect(l.cprWidthPct).toBeCloseTo((l.cprWidth / 24100) * 100, 2);
  });
});

describe("computeLevels — support / resistance", () => {
  const l = computeLevels(ohlc, 50);
  const pivot = (24200 + 23900 + 24100) / 3;

  it("computes R1/S1/R2/S2/R3/S3 from the standard formulas", () => {
    expect(l.r1).toBeCloseTo(2 * pivot - 23900, 2);
    expect(l.s1).toBeCloseTo(2 * pivot - 24200, 2);
    expect(l.r2).toBeCloseTo(pivot + (24200 - 23900), 2);
    expect(l.s2).toBeCloseTo(pivot - (24200 - 23900), 2);
    expect(l.r3).toBeCloseTo(24200 + 2 * (pivot - 23900), 2);
    expect(l.s3).toBeCloseTo(23900 - 2 * (24200 - pivot), 2);
  });
  it("orders resistances above supports", () => {
    expect(l.r3).toBeGreaterThan(l.r2);
    expect(l.r2).toBeGreaterThan(l.r1);
    expect(l.s1).toBeGreaterThan(l.s2);
    expect(l.s2).toBeGreaterThan(l.s3);
  });
  it("computes safe buy/sell bands around close", () => {
    expect(l.safeBuy).toBeCloseTo(24100 + 50, 2);
    expect(l.safeSell).toBeCloseTo(24100 - 50, 2);
  });
});

describe("computeLevels — Gann square-of-9", () => {
  const l = computeLevels(ohlc, 50);
  const sq = Math.sqrt(24100);

  it("computes the ±1 root Gann up/down", () => {
    expect(l.gannUp).toBeCloseTo(Math.pow(sq + 1, 2), 1);
    expect(l.gannDown).toBeCloseTo(Math.pow(sq - 1, 2), 1);
    expect(l.gannUp).toBeGreaterThan(24100);
    expect(l.gannDown).toBeLessThan(24100);
  });
  it("returns 8 rotation steps at 45° increments", () => {
    expect(l.gannCycle).toHaveLength(8);
    expect(l.gannCycle.map((g) => g.deg)).toEqual([45, 90, 135, 180, 225, 270, 315, 360]);
    for (const g of l.gannCycle) {
      expect(g.up).toBeGreaterThan(g.down);
    }
  });
});

describe("cprBias", () => {
  it("flags a narrow CPR as trending/bear tone", () => {
    const narrow = { cprWidthPct: 0.2 } as ReturnType<typeof computeLevels>;
    const b = cprBias(narrow);
    expect(b.tone).toBe("bear");
    expect(b.label).toContain("NARROW");
  });
  it("flags a wide CPR as reversal/bull tone", () => {
    const wide = { cprWidthPct: 1.2 } as ReturnType<typeof computeLevels>;
    const b = cprBias(wide);
    expect(b.tone).toBe("bull");
    expect(b.label).toContain("WIDE");
  });
});