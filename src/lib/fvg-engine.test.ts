import { describe, expect, it } from "vitest";
import { detectFvgs } from "./fvg-engine";
import type { Candle } from "./smc-types";

function c(t: number, o: number, h: number, l: number, cl: number, v = 1000): Candle {
  return { t, o, h, l, c: cl, v };
}

describe("detectFvgs", () => {
  it("detects a bullish FVG between prev.high and next.low", () => {
    const cs: Candle[] = [
      c(1, 100, 102, 99, 101),
      c(2, 101, 110, 101, 109), // impulsive middle candle
      c(3, 109, 112, 105, 111), // next.low (105) > prev.high (102) → gap (102,105)
      c(4, 111, 113, 110, 112),
    ];
    const gaps = detectFvgs(cs);
    expect(gaps.length).toBe(1);
    expect(gaps[0].direction).toBe("bullish");
    expect(gaps[0].top).toBeCloseTo(105);
    expect(gaps[0].bottom).toBeCloseTo(102);
    expect(gaps[0].size).toBeCloseTo(3);
  });

  it("detects a bearish FVG when prev.low > next.high", () => {
    const cs: Candle[] = [
      c(1, 110, 112, 108, 109),
      c(2, 109, 109, 100, 101),
      c(3, 101, 106, 100, 102), // next.high (106) < prev.low (108) → gap (106,108)
      c(4, 102, 104, 100, 101),
    ];
    const gaps = detectFvgs(cs);
    expect(gaps.length).toBe(1);
    expect(gaps[0].direction).toBe("bearish");
    expect(gaps[0].top).toBeCloseTo(108);
    expect(gaps[0].bottom).toBeCloseTo(106);
  });

  it("marks a gap as filled once price fully retraces through it", () => {
    const cs: Candle[] = [
      c(1, 100, 102, 99, 101),
      c(2, 101, 110, 101, 109),
      c(3, 109, 112, 105, 111),
      c(4, 111, 112, 108, 109),
      c(5, 109, 110, 100, 101), // low 100 fully fills the (102,105) gap from above
    ];
    const gaps = detectFvgs(cs);
    expect(gaps[0].status).toBe("filled");
    expect(gaps[0].fillPct).toBeCloseTo(1);
    expect(gaps[0].filledIndex).toBe(4);
  });

  it("tracks partial fills without marking as filled", () => {
    const cs: Candle[] = [
      c(1, 100, 102, 99, 101),
      c(2, 101, 110, 101, 109),
      c(3, 109, 112, 105, 111),
      c(4, 111, 112, 104, 106), // dips into gap but stays above 102
    ];
    const gaps = detectFvgs(cs);
    expect(["partial", "mitigated"]).toContain(gaps[0].status);
    expect(gaps[0].fillPct).toBeGreaterThan(0);
    expect(gaps[0].fillPct).toBeLessThan(1);
  });

  it("returns nothing when there is no imbalance", () => {
    const cs: Candle[] = [
      c(1, 100, 101, 99, 100),
      c(2, 100, 101, 99, 100),
      c(3, 100, 101, 99, 100),
    ];
    expect(detectFvgs(cs)).toEqual([]);
  });

  it("no future leakage: prefix detection is a prefix of full detection", () => {
    const cs: Candle[] = [
      c(1, 100, 102, 99, 101),
      c(2, 101, 110, 101, 109),
      c(3, 109, 112, 105, 111),
      c(4, 111, 112, 108, 109),
      c(5, 109, 110, 100, 101),
    ];
    const full = detectFvgs(cs);
    const prefix = detectFvgs(cs.slice(0, 4));
    expect(prefix[0].index).toBe(full[0].index);
  });
});