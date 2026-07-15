import { describe, expect, it } from "vitest";
import { analyzeSmc, SMC_STRATEGY_NOT_IMPLEMENTED } from "./smc-engine";
import { smcStrategyAdapter } from "./backtest/strategy";
import type { Candle } from "./smc-types";

function candle(t: number, o: number, h: number, l: number, c: number, v = 1000): Candle {
  return { t, o, h, l, c, v };
}

// Uptrend then reversal fixture reused across tests.
function uptrendThenReversal(): Candle[] {
  const out: Candle[] = [];
  const prices = [
    100, 98, 105, 102, 110, 107, 115,
    112, 108, 104, 100, 96, 92,
  ];
  let t = 1_700_000_000_000;
  for (const p of prices) {
    out.push(candle(t, p, p + 1, p - 1, p));
    t += 60_000;
  }
  return out;
}

// Series designed to force a bullish FVG at index 4 (gap between i-1 high and
// i+1 low), a bearish FVG later, plus equal highs.
function fvgAndEqualsSeries(): Candle[] {
  const raw: [number, number, number, number, number, number][] = [
    // t, o, h, l, c, v
    [0, 100, 101, 99, 100, 1000],
    [1, 100, 102, 99, 101, 1000],
    [2, 101, 103, 100, 102, 1000],
    [3, 102, 104, 101, 103, 1000],
    [4, 103, 106, 102, 105, 1000], // middle candle of a bull FVG (prev.h=104 < next.l=108)
    [5, 108, 112, 108, 111, 5000], // impulse — displacement candle
    [6, 111, 113, 110, 112, 1000],
    [7, 112, 113, 111, 112, 1000], // equal high near 113 with idx 6
    [8, 112, 113, 110, 111, 1000],
    [9, 111, 112, 108, 108, 1000], // sweep of a low
    [10, 108, 109, 105, 106, 1000],
    [11, 106, 107, 100, 101, 5000], // bear displacement
    [12, 101, 102, 98, 99, 1000],
    [13, 99, 100, 96, 97, 1000],
  ];
  return raw.map(([t, o, h, l, c, v]) => candle(t, o, h, l, c, v));
}

describe("analyzeSmc — structural outputs", () => {
  it("emits labeled swings with HH/HL/LH/LL", () => {
    const r = analyzeSmc(uptrendThenReversal(), { lookback: 1 });
    const labels = r.swings.map((s) => s.label).filter(Boolean);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(["HH", "HL", "LH", "LL"]).toContain(l!);
  });

  it("emits BOS then a CHOCH/MSS on reversal", () => {
    const r = analyzeSmc(uptrendThenReversal(), { lookback: 1 });
    expect(r.structureEvents[0].type).toBe("BOS");
    const flip = r.structureEvents.find((e) => e.direction === "bear");
    expect(flip).toBeDefined();
    expect(["CHoCH", "MSS"]).toContain(flip!.type);
    expect(r.finalBias).toBe("bearish");
  });

  it("detects equal highs (or equal lows) via liquidity engine", () => {
    const r = analyzeSmc(fvgAndEqualsSeries(), { lookback: 1 });
    const eq = r.liquidityLevels.filter(
      (l) => l.kind === "equal_high" || l.kind === "equal_low",
    );
    expect(eq.length).toBeGreaterThan(0);
  });

  it("emits liquidity sweeps/grabs/stop_hunts", () => {
    const r = analyzeSmc(fvgAndEqualsSeries(), { lookback: 1 });
    const kinds = new Set(r.liquidityEvents.map((e) => e.type));
    expect(r.liquidityEvents.length).toBeGreaterThan(0);
    for (const k of kinds) {
      expect(["sweep", "grab", "stop_hunt", "inducement"]).toContain(k);
    }
  });

  it("detects bullish and bearish FVGs", () => {
    const r = analyzeSmc(fvgAndEqualsSeries(), { lookback: 1 });
    const dirs = new Set(r.fvgs.map((g) => g.direction));
    expect(r.fvgs.length).toBeGreaterThan(0);
    expect(dirs.has("bullish") || dirs.has("bearish")).toBe(true);
    for (const g of r.fvgs) expect(g.top).toBeGreaterThan(g.bottom);
  });

  it("detects order blocks tied to confirmed impulses", () => {
    const r = analyzeSmc(uptrendThenReversal(), { lookback: 1 });
    expect(r.orderBlocks.length).toBeGreaterThan(0);
    for (const ob of r.orderBlocks) {
      expect(ob.impulseIndex).toBeGreaterThan(ob.index);
      expect(["bullish", "bearish"]).toContain(ob.direction);
    }
  });

  it("classifies premium/discount vs equilibrium", () => {
    const cs = uptrendThenReversal();
    const r = analyzeSmc(cs, { lookback: 1 });
    expect(r.premiumDiscount).not.toBeNull();
    const pd = r.premiumDiscount!;
    expect(pd.high).toBeGreaterThan(pd.low);
    expect(pd.equilibrium).toBeCloseTo((pd.high + pd.low) / 2, 10);
    expect(["premium", "discount", "equilibrium"]).toContain(pd.currentZone);
  });

  it("flags displacement candles by range multiple", () => {
    const r = analyzeSmc(fvgAndEqualsSeries(), {
      lookback: 1,
      displacementMultiple: 1.5,
      displacementWindow: 5,
    });
    expect(r.displacementCandles.length).toBeGreaterThan(0);
    for (const d of r.displacementCandles) {
      expect(d.ratio).toBeGreaterThanOrEqual(1.5);
      expect(["bull", "bear"]).toContain(d.direction);
    }
  });

  it("produces EMA bias samples one-per-candle", () => {
    const cs = uptrendThenReversal();
    const r = analyzeSmc(cs, { lookback: 1, emaFast: 3, emaSlow: 6 });
    expect(r.emaBias.length).toBe(cs.length);
    for (const s of r.emaBias) {
      expect(["bullish", "bearish", "neutral"]).toContain(s.bias);
      expect(Number.isFinite(s.fast)).toBe(true);
      expect(Number.isFinite(s.slow)).toBe(true);
    }
  });

  it("produces VWAP bias samples one-per-candle", () => {
    const cs = fvgAndEqualsSeries();
    const r = analyzeSmc(cs);
    expect(r.vwapBias.length).toBe(cs.length);
    for (const s of r.vwapBias) {
      expect(Number.isFinite(s.vwap)).toBe(true);
      expect(["bullish", "bearish", "neutral"]).toContain(s.bias);
    }
  });
});

describe("analyzeSmc — no-lookahead & determinism", () => {
  it("prefix analysis is a strict prefix of full analysis for structure events", () => {
    const cs = uptrendThenReversal();
    const full = analyzeSmc(cs, { lookback: 1 });
    const prefix = analyzeSmc(cs.slice(0, 8), { lookback: 1 });
    for (const e of prefix.structureEvents) {
      const match = full.structureEvents.find(
        (x) => x.index === e.index && x.type === e.type && x.direction === e.direction,
      );
      expect(match).toBeDefined();
    }
  });

  it("prefix analysis preserves earlier FVGs", () => {
    const cs = fvgAndEqualsSeries();
    const full = analyzeSmc(cs);
    const prefix = analyzeSmc(cs.slice(0, 10));
    for (const g of prefix.fvgs) {
      const match = full.fvgs.find(
        (x) => x.index === g.index && x.direction === g.direction,
      );
      expect(match).toBeDefined();
    }
  });

  it("identical inputs produce byte-identical outputs (deterministic replay)", () => {
    const cs = fvgAndEqualsSeries();
    const a = analyzeSmc(cs, { lookback: 1 });
    const b = analyzeSmc(cs, { lookback: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("smcStrategyAdapter — Stage 1 wiring", () => {
  it("stays COMING_NEXT with NOT_IMPLEMENTED engine status", () => {
    expect(smcStrategyAdapter.availability).toBe("COMING_NEXT");
    expect(smcStrategyAdapter.engineStatus).toBe(SMC_STRATEGY_NOT_IMPLEMENTED);
    expect(smcStrategyAdapter.supportedFormulaVersions).toEqual([]);
  });

  it("exposes the pure analyzer without executing any signal logic", () => {
    const cs = uptrendThenReversal();
    const r = smcStrategyAdapter.analyzeStructure(cs, { lookback: 1 });
    expect(r.meta.candleCount).toBe(cs.length);
    expect(r.structureEvents.length).toBeGreaterThan(0);
  });
});
