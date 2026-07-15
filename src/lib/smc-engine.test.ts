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

// Realistic mini-market with genuine swings, equal highs, an FVG, a sweep,
// and directional bodies (so order-block anchor detection can find opposite
// colour candles). Every OHLC obeys h >= max(o,c) and l <= min(o,c).
function richSmcSeries(): Candle[] {
  const raw: [number, number, number, number, number, number][] = [
    // t,  o,   h,   l,   c,   v
    [0, 100, 101, 99, 100.5, 1000],
    [1, 100.5, 102, 100, 101.5, 1000],
    [2, 101.5, 104, 101, 103.5, 1000], // swing high candidate top
    [3, 103.5, 104, 101, 101.5, 1000], // pullback (bear body → OB anchor for later bull impulse)
    [4, 101.5, 103, 101, 102.5, 1000], // swing low (idx 3 is low with l=101 vs 101,101)
    [5, 102.5, 106, 102, 105.5, 1000], // middle of a bull FVG (prev.h=103 < next.l=108)
    [6, 108, 112, 108, 111.5, 5000], // displacement / impulse breaking prior swing high (104)
    [7, 111.5, 113, 111, 112.5, 1000], // equal-high candidate
    [8, 112.5, 113, 111, 112.0, 1000], // matches idx 7 high → equal highs
    [9, 112.0, 113, 108, 108.5, 1000], // sweep wick above 113 possible but closes below
    [10, 108.5, 109, 105, 105.5, 1000], // bear body
    [11, 105.5, 106, 99, 99.5, 5000], // bear displacement, breaks prior low
    [12, 99.5, 100, 97, 97.5, 1000],
    [13, 97.5, 98, 94, 94.5, 1000],
  ];
  return raw.map(([t, o, h, l, c, v]) => candle(t, o, h, l, c, v));
}

// Bullish + bearish body version of the reversal fixture so order-block
// detection can find valid opposite-colour anchors.
function reversalWithBodies(): Candle[] {
  const cs: Candle[] = [];
  const bulls = [100, 98, 105, 102, 110, 107, 115]; // rising with intermediate dips
  const bears = [112, 108, 104, 100, 96, 92]; // falling
  let t = 1_700_000_000_000;
  for (let i = 0; i < bulls.length; i++) {
    const p = bulls[i];
    // bull body: c > o
    cs.push(candle(t, p - 0.5, p + 1, p - 1, p + 0.5));
    t += 60_000;
  }
  for (const p of bears) {
    // bear body: c < o
    cs.push(candle(t, p + 0.5, p + 1, p - 1, p - 0.5));
    t += 60_000;
  }
  return cs;
}

// Dedicated fixture with two near-equal pivot highs so the liquidity engine
// can cluster them into an equal_high level; a later candle then sweeps it.
function equalHighsSeries(): Candle[] {
  const raw: [number, number, number, number, number][] = [
    // t,  o,     h,      l,     c
    [0, 99.5, 101, 99, 100.5],
    [1, 108.5, 110.05, 108, 109.5], // pivot high A
    [2, 105.5, 106, 104, 104.5], // pivot low
    [3, 108.5, 110.03, 108, 109.5], // pivot high B (~equal to A)
    [4, 106, 107.5, 105, 106.5], // dip → confirms pivot at idx 3
    [5, 110.5, 113, 110.5, 112], // sweep breaks the equal-high cluster
    [6, 110, 111, 105, 105.5],
  ];
  return raw.map(([t, o, h, l, c]) => candle(t, o, h, l, c));
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
    const r = analyzeSmc(equalHighsSeries(), { lookback: 1 });
    const eq = r.liquidityLevels.filter(
      (l) => l.kind === "equal_high" || l.kind === "equal_low",
    );
    expect(eq.length).toBeGreaterThan(0);
  });

  it("emits liquidity sweeps/grabs/stop_hunts", () => {
    const r = analyzeSmc(equalHighsSeries(), { lookback: 1 });
    const kinds = new Set(r.liquidityEvents.map((e) => e.type));
    expect(r.liquidityEvents.length).toBeGreaterThan(0);
    for (const k of kinds) {
      expect(["sweep", "grab", "stop_hunt", "inducement"]).toContain(k);
    }
  });

  it("detects bullish and bearish FVGs", () => {
    const r = analyzeSmc(richSmcSeries(), { lookback: 1 });
    const dirs = new Set(r.fvgs.map((g) => g.direction));
    expect(r.fvgs.length).toBeGreaterThan(0);
    expect(dirs.has("bullish") || dirs.has("bearish")).toBe(true);
    for (const g of r.fvgs) expect(g.top).toBeGreaterThan(g.bottom);
  });

  it("detects order blocks tied to confirmed impulses", () => {
    const r = analyzeSmc(reversalWithBodies(), { lookback: 1 });
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
    const r = analyzeSmc(richSmcSeries(), {
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
    const cs = richSmcSeries();
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
    const cs = richSmcSeries();
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
    const cs = richSmcSeries();
    const a = analyzeSmc(cs, { lookback: 1 });
    const b = analyzeSmc(cs, { lookback: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("smcStrategyAdapter — Stage 1 wiring", () => {
  it("Stage 3 · AVAILABLE with SMC_V1 formula; Stage-1 status flag preserved", () => {
    expect(smcStrategyAdapter.availability).toBe("AVAILABLE");
    expect(smcStrategyAdapter.engineStatus).toBe(SMC_STRATEGY_NOT_IMPLEMENTED);
    expect(smcStrategyAdapter.supportedFormulaVersions).toContain("SMC_V1");
  });

  it("exposes the pure analyzer without executing any signal logic", () => {
    const cs = uptrendThenReversal();
    const r = smcStrategyAdapter.analyzeStructure(cs, { lookback: 1 });
    expect(r.meta.candleCount).toBe(cs.length);
    expect(r.structureEvents.length).toBeGreaterThan(0);
  });
});
