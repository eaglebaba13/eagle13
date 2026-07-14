import { describe, expect, it } from "vitest";
import { analyzeStructure, labelSwings } from "./market-structure";
import { detectSwings, validateCandles, type Candle } from "./smc-types";

function candle(t: number, o: number, h: number, l: number, c: number, v = 1000): Candle {
  return { t, o, h, l, c, v };
}

// Simple uptrend then downtrend: rises, forms lower highs after a peak.
function uptrendThenReversal(): Candle[] {
  const out: Candle[] = [];
  const prices = [
    // Rising sequence with pivots at indices 2,4,6 (highs) and 1,3,5 (lows)
    100, 98, 105, 102, 110, 107, 115, // uptrend HH/HL
    112, 108, 104, 100, 96, 92,       // reversal, breaks lows
  ];
  let t = 1_700_000_000_000;
  for (const p of prices) {
    out.push(candle(t, p, p + 1, p - 1, p));
    t += 60_000;
  }
  return out;
}

describe("detectSwings", () => {
  it("finds symmetric fractal pivots with no lookahead", () => {
    const cs = uptrendThenReversal();
    const s = detectSwings(cs, 1);
    // Every pivot index must be strictly interior (has neighbors on both sides).
    for (const p of s) {
      expect(p.index).toBeGreaterThanOrEqual(1);
      expect(p.index).toBeLessThanOrEqual(cs.length - 2);
    }
    expect(s.length).toBeGreaterThan(0);
  });

  it("throws on lookback < 1", () => {
    expect(() => detectSwings([], 0)).toThrow();
  });
});

describe("labelSwings", () => {
  it("labels HH/HL/LH/LL relative to prior same-kind swing", () => {
    const labeled = labelSwings([
      { index: 1, t: 0, price: 100, kind: "high" },
      { index: 2, t: 0, price: 90, kind: "low" },
      { index: 3, t: 0, price: 110, kind: "high" }, // HH
      { index: 4, t: 0, price: 95, kind: "low" }, // HL
      { index: 5, t: 0, price: 105, kind: "high" }, // LH
      { index: 6, t: 0, price: 85, kind: "low" }, // LL
    ]);
    expect(labeled.map((s) => s.label)).toEqual([null, null, "HH", "HL", "LH", "LL"]);
  });
});

describe("analyzeStructure", () => {
  it("detects a bullish BOS then a bearish CHoCH on reversal", () => {
    const cs = uptrendThenReversal();
    const st = analyzeStructure(cs, 1);
    expect(st.events.length).toBeGreaterThan(0);
    const first = st.events[0];
    expect(first.direction).toBe("bull");
    expect(first.type).toBe("BOS");
    const flip = st.events.find((e) => e.direction === "bear");
    expect(flip).toBeDefined();
    expect(["CHoCH", "MSS"]).toContain(flip!.type);
    expect(st.bias).toBe("bearish");
  });

  it("returns neutral bias for a flat series with no breakouts", () => {
    const flat: Candle[] = [];
    let t = 0;
    for (let i = 0; i < 8; i++) flat.push(candle(t++, 100, 100.2, 99.8, 100));
    const st = analyzeStructure(flat, 1);
    expect(st.events.length).toBe(0);
    expect(st.bias).toBe("neutral");
    expect(st.strength).toBe(0);
  });

  it("no future-candle leakage: prefix analysis is a prefix of full analysis", () => {
    const cs = uptrendThenReversal();
    const full = analyzeStructure(cs, 1);
    const prefix = analyzeStructure(cs.slice(0, 8), 1);
    for (const e of prefix.events) {
      const match = full.events.find(
        (x) => x.index === e.index && x.type === e.type && x.direction === e.direction,
      );
      expect(match).toBeDefined();
    }
  });
});

describe("validateCandles", () => {
  it("accepts well-formed series", () => {
    expect(() => validateCandles(uptrendThenReversal())).not.toThrow();
  });
  it("rejects OHLC ordering violations", () => {
    expect(() => validateCandles([candle(0, 10, 5, 8, 9)])).toThrow();
  });
  it("rejects non-monotonic timestamps", () => {
    expect(() =>
      validateCandles([candle(10, 1, 2, 0.5, 1.5), candle(9, 1, 2, 0.5, 1.5)]),
    ).toThrow();
  });
});