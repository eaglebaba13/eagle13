import { describe, expect, it } from "vitest";
import { detectOrderBlocks } from "./order-block-engine";
import type { Candle } from "./smc-types";

function c(t: number, o: number, h: number, l: number, cl: number, v = 1000): Candle {
  return { t, o, h, l, c: cl, v };
}

// Series designed to produce a bullish order block: an early swing high, a
// down candle (the OB anchor), then an impulsive up move that closes through
// the swing high (BOS).
function bullishOBSeries(): Candle[] {
  return [
    c(1, 100, 101, 99, 100),
    c(2, 100, 110, 100, 105),   // pivot high
    c(3, 105, 106, 100, 101),
    c(4, 101, 102, 96, 97),     // bearish anchor (last down candle before impulse)
    c(5, 97, 115, 97, 114),     // impulsive bullish BOS (closes above 110)
    c(6, 114, 116, 112, 115),
    c(7, 115, 117, 98, 99),     // wick returns into anchor range → mitigation
    c(8, 99, 100, 95, 96),      // close below anchor low → invalidation
  ];
}

describe("detectOrderBlocks", () => {
  it("finds a bullish order block anchored at the last bearish candle before a BOS", () => {
    const cs = bullishOBSeries();
    const blocks = detectOrderBlocks(cs, { lookback: 1 });
    const bull = blocks.find((b) => b.direction === "bullish");
    expect(bull).toBeDefined();
    expect(bull!.index).toBe(3); // the bearish candle before the impulse
    expect(bull!.top).toBe(102);
    expect(bull!.bottom).toBe(96);
  });

  it("tracks mitigation and invalidation as price returns and then closes through", () => {
    const cs = bullishOBSeries();
    const blocks = detectOrderBlocks(cs, { lookback: 1 });
    const bull = blocks.find((b) => b.direction === "bullish")!;
    expect(["mitigated", "breaker", "invalidated"]).toContain(bull.status);
    expect(bull.retests).toBeGreaterThan(0);
  });

  it("has age >= 0 and strength within [0,1]", () => {
    const blocks = detectOrderBlocks(bullishOBSeries(), { lookback: 1 });
    for (const b of blocks) {
      expect(b.age).toBeGreaterThanOrEqual(0);
      expect(b.strength).toBeGreaterThanOrEqual(0);
      expect(b.strength).toBeLessThanOrEqual(1);
    }
  });

  it("no future leakage: prefix detection is a subset of full detection", () => {
    const cs = bullishOBSeries();
    const full = detectOrderBlocks(cs, { lookback: 1 });
    const prefix = detectOrderBlocks(cs.slice(0, 6), { lookback: 1 });
    for (const b of prefix) {
      expect(full.some((x) => x.index === b.index && x.direction === b.direction)).toBe(true);
    }
  });
});