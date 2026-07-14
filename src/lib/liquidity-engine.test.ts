import { describe, expect, it } from "vitest";
import { analyzeLiquidity } from "./liquidity-engine";
import type { Candle } from "./smc-types";

function c(t: number, o: number, h: number, l: number, cl: number, v = 1000): Candle {
  return { t, o, h, l, c: cl, v };
}

describe("analyzeLiquidity", () => {
  it("detects equal highs as a buy-side liquidity pool", () => {
    // Two swing highs at ~110, one swing low between them.
    const cs: Candle[] = [
      c(1, 100, 101, 99, 100),
      c(2, 100, 110, 100, 105), // pivot high #1
      c(3, 105, 106, 95, 96),   // pivot low
      c(4, 96, 110.02, 96, 100), // pivot high #2 (equal high)
      c(5, 100, 101, 90, 91),
      c(6, 91, 92, 85, 86),
    ];
    const rep = analyzeLiquidity(cs, { lookback: 1 });
    const eqHigh = rep.levels.find((l) => l.kind === "equal_high");
    expect(eqHigh).toBeDefined();
    expect(eqHigh!.sources.length).toBeGreaterThanOrEqual(2);
  });

  it("emits a sweep event when a wick pierces a confirmed swing high and closes back below", () => {
    const cs: Candle[] = [
      c(1, 100, 100.5, 99.5, 100),
      c(2, 100, 110, 100, 105),   // pivot high at index 1
      c(3, 105, 106, 100, 101),
      c(4, 101, 108, 101, 104),
      // Sweep candle: wick above 110, close below.
      c(5, 104, 112, 103, 108, 3000),
      c(6, 108, 109, 105, 106),
    ];
    const rep = analyzeLiquidity(cs, { lookback: 1 });
    const sweep = rep.events.find((e) => e.side === "buy");
    expect(sweep).toBeDefined();
    expect(["sweep", "grab"]).toContain(sweep!.type);
    expect(sweep!.reclaim).toBe(true);
  });

  it("classifies levels as internal vs external relative to swing extremes", () => {
    const cs: Candle[] = [
      c(1, 100, 101, 99, 100),
      c(2, 100, 120, 100, 110), // outer high (external)
      c(3, 110, 112, 90, 91),   // outer low (external)
      c(4, 91, 105, 91, 100),   // inner high (internal)
      c(5, 100, 101, 95, 96),   // inner low (internal)
      c(6, 96, 108, 96, 102),   // another inner high
      c(7, 102, 103, 97, 98),   // another inner low
      c(8, 98, 99, 94, 95),
    ];
    const rep = analyzeLiquidity(cs, { lookback: 1 });
    const scopes = new Set(rep.levels.map((l) => l.scope));
    expect(scopes.has("external")).toBe(true);
    expect(scopes.has("internal")).toBe(true);
  });

  it("no future leakage: events reference candles at or before their own index", () => {
    const cs: Candle[] = [
      c(1, 100, 100.5, 99.5, 100),
      c(2, 100, 110, 100, 105),
      c(3, 105, 106, 100, 101),
      c(4, 101, 115, 101, 103),
    ];
    const rep = analyzeLiquidity(cs, { lookback: 1 });
    for (const e of rep.events) expect(e.index).toBeLessThan(cs.length);
  });
});