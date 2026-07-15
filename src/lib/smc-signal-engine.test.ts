// Phase 21.4 · Stage 2 — SMC Signal Engine tests.
//
// Deterministic, network-free. Verifies scoring, mandatory rules, optional
// filters, conflict resolution, cooldown, config overrides, prefix
// invariance (no lookahead) and adapter wiring. Most tests use synthetic
// SmcEngineResult inputs so the signal-engine logic is tested in isolation
// from the Stage 1 detectors.

import { describe, expect, it } from "vitest";
import { analyzeSmc, type SmcBias, type SmcEngineResult } from "./smc-engine";
import {
  DEFAULT_SMC_SIGNAL_CONFIG,
  SMC_SIGNAL_ENGINE_READY,
  SMC_SIGNAL_ENGINE_VERSION,
  analyzeSmcSignals,
  analyzeSmcWithSignals,
  type SmcSignalConfig,
} from "./smc-signal-engine";
import { smcStrategyAdapter } from "./backtest/strategy";
import type { Candle } from "./smc-types";

// ── Candle + engine builders ─────────────────────────────────────────────

function candle(t: number, price: number, v = 1000): Candle {
  return { t, o: price, h: price + 0.5, l: price - 0.5, c: price, v };
}

function candles(n: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) out.push(candle(i * 60_000, 100 + i * 0.1));
  return out;
}

function biasArray(cs: Candle[], bias: SmcBias) {
  return cs.map((c, i) => ({ index: i, t: c.t, bias, fast: 0, slow: 0 }));
}
function vwapArray(cs: Candle[], bias: SmcBias) {
  return cs.map((c, i) => ({ index: i, t: c.t, bias, vwap: c.c }));
}

type EngineOverrides = Partial<SmcEngineResult>;

function makeEngine(cs: Candle[], overrides: EngineOverrides = {}): SmcEngineResult {
  return {
    swings: [],
    structureEvents: [],
    finalBias: "neutral",
    fvgs: [],
    liquidityLevels: [],
    liquidityEvents: [],
    orderBlocks: [],
    displacementCandles: [],
    premiumDiscount: null,
    emaBias: biasArray(cs, "neutral"),
    vwapBias: vwapArray(cs, "neutral"),
    meta: {
      lookback: 1,
      emaFast: 13,
      emaSlow: 50,
      displacementMultiple: 1.5,
      displacementWindow: 10,
      candleCount: cs.length,
    },
    ...overrides,
  };
}

function bullishStackAt(cs: Candle[], i: number): EngineOverrides {
  return {
    liquidityEvents: [
      { type: "sweep", side: "sell", index: i - 3, t: cs[i - 3].t, level: cs[i - 3].l, reclaim: true },
    ],
    structureEvents: [
      {
        type: "CHoCH",
        direction: "bull",
        index: i - 2,
        t: cs[i - 2].t,
        brokenSwing: { index: 0, t: 0, price: 100, kind: "high" },
        price: cs[i - 2].c,
      },
    ],
    displacementCandles: [
      { index: i - 1, t: cs[i - 1].t, direction: "bull", range: 5, ratio: 3 },
    ],
    fvgs: [
      {
        direction: "bullish",
        index: i - 1,
        t: cs[i - 1].t,
        top: cs[i - 1].h,
        bottom: cs[i - 1].l,
        size: 1,
        status: "unfilled",
        fillPct: 0,
        filledIndex: null,
      },
    ],
    orderBlocks: [
      {
        direction: "bullish",
        index: i - 3,
        t: cs[i - 3].t,
        top: cs[i - 3].h,
        bottom: cs[i - 3].l,
        impulseIndex: i - 2,
        status: "active",
        retests: 0,
        age: 3,
        strength: 0.5,
      },
    ],
    emaBias: biasArray(cs, "bullish"),
    vwapBias: vwapArray(cs, "bullish"),
    premiumDiscount: {
      highIndex: 0,
      lowIndex: 0,
      high: 110,
      low: 100,
      equilibrium: 105,
      currentZone: "discount",
    },
  };
}

function bearishStackAt(cs: Candle[], i: number): EngineOverrides {
  return {
    liquidityEvents: [
      { type: "sweep", side: "buy", index: i - 3, t: cs[i - 3].t, level: cs[i - 3].h, reclaim: true },
    ],
    structureEvents: [
      {
        type: "CHoCH",
        direction: "bear",
        index: i - 2,
        t: cs[i - 2].t,
        brokenSwing: { index: 0, t: 0, price: 100, kind: "low" },
        price: cs[i - 2].c,
      },
    ],
    displacementCandles: [
      { index: i - 1, t: cs[i - 1].t, direction: "bear", range: 5, ratio: 3 },
    ],
    fvgs: [
      {
        direction: "bearish",
        index: i - 1,
        t: cs[i - 1].t,
        top: cs[i - 1].h,
        bottom: cs[i - 1].l,
        size: 1,
        status: "unfilled",
        fillPct: 0,
        filledIndex: null,
      },
    ],
    emaBias: biasArray(cs, "bearish"),
    vwapBias: vwapArray(cs, "bearish"),
    premiumDiscount: {
      highIndex: 0,
      lowIndex: 0,
      high: 110,
      low: 100,
      equilibrium: 105,
      currentZone: "premium",
    },
  };
}

// ── Basic states ─────────────────────────────────────────────────────────

describe("SMC Signal Engine · basic states", () => {
  it("emits one debug row per candle with correct meta", () => {
    const cs = candles(15);
    const engine = makeEngine(cs);
    const sig = analyzeSmcSignals(cs, engine);
    expect(sig.version).toBe(SMC_SIGNAL_ENGINE_VERSION);
    expect(sig.signals.length).toBe(cs.length);
    expect(sig.meta.candleCount).toBe(cs.length);
    expect(sig.meta.dataLeakageChecked).toBe(true);
  });

  it("emits BUY when all bull mandatories align", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const sig = analyzeSmcSignals(cs, engine, { minScore: 60, cooldownBars: 0 });
    const buy = sig.signals.find((s) => s.signal === "BUY");
    expect(buy).toBeTruthy();
    expect(buy!.structureDirection).toBe("bull");
    expect(buy!.triggeredRules).toEqual(
      expect.arrayContaining(["CHOCH:bull", "displacement:bull", "FVG"]),
    );
  });

  it("emits SELL when all bear mandatories align", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, bearishStackAt(cs, 10));
    const sig = analyzeSmcSignals(cs, engine, { minScore: 60, cooldownBars: 0 });
    const sell = sig.signals.find((s) => s.signal === "SELL");
    expect(sell).toBeTruthy();
    expect(sell!.structureDirection).toBe("bear");
  });

  it("emits INVALID when no liquidity sweep exists anywhere", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, {
      structureEvents: [
        {
          type: "CHoCH",
          direction: "bull",
          index: 8,
          t: cs[8].t,
          brokenSwing: { index: 0, t: 0, price: 100, kind: "high" },
          price: 100,
        },
      ],
    });
    const sig = analyzeSmcSignals(cs, engine, { minScore: 0 });
    const invalid = sig.signals.find((s) => s.signal === "INVALID");
    expect(invalid).toBeTruthy();
    expect(invalid!.reasons.join(",")).toContain("no_liquidity_sweep_in_window");
  });

  it("emits WAIT when score is below minScore", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const sig = analyzeSmcSignals(cs, engine, {
      minScore: 999,
      cooldownBars: 0,
    });
    for (const s of sig.signals) {
      expect(s.signal).not.toBe("BUY");
      expect(s.signal).not.toBe("SELL");
    }
    const under = sig.signals.find((s) =>
      s.reasons.some((r) => r.startsWith("score_below_min")),
    );
    expect(under).toBeTruthy();
  });
});

// ── Score engine ─────────────────────────────────────────────────────────

describe("SMC Signal Engine · score engine", () => {
  it("weights are transparent and additive", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const baseline = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
    }).signals.find((s) => s.signal === "BUY")!.score;
    const bumped = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      weights: { ...DEFAULT_SMC_SIGNAL_CONFIG.weights, choch: 100 },
    }).signals.find((s) => s.signal === "BUY")!.score;
    expect(bumped - baseline).toBe(100 - DEFAULT_SMC_SIGNAL_CONFIG.weights.choch);
  });

  it("disabling EMA drops the EMA weight from the score", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const withEma = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      emaEnabled: true,
      vwapEnabled: false,
      premiumDiscountEnabled: false,
    }).signals.find((s) => s.signal === "BUY")!;
    const withoutEma = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      emaEnabled: false,
      vwapEnabled: false,
      premiumDiscountEnabled: false,
    }).signals.find((s) => s.signal === "BUY")!;
    expect(withEma.score - withoutEma.score).toBe(
      DEFAULT_SMC_SIGNAL_CONFIG.weights.ema,
    );
  });
});

// ── Optional filters ─────────────────────────────────────────────────────

describe("SMC Signal Engine · optional filters", () => {
  it("VWAP alignment adds only when direction matches", () => {
    const cs = candles(15);
    const bull = bullishStackAt(cs, 10);
    // Flip VWAP bearish → should NOT credit for bull.
    const engine = makeEngine(cs, { ...bull, vwapBias: vwapArray(cs, "bearish") });
    const sig = analyzeSmcSignals(cs, engine, { minScore: 0, cooldownBars: 0 });
    const buy = sig.signals.find((s) => s.signal === "BUY")!;
    expect(buy.triggeredRules).not.toContain("VWAP");
  });

  it("premium/discount adds only when zone aligns", () => {
    const cs = candles(15);
    // Bull setup but zone = premium → should NOT credit.
    const engine = makeEngine(cs, {
      ...bullishStackAt(cs, 10),
      premiumDiscount: {
        highIndex: 0,
        lowIndex: 0,
        high: 110,
        low: 100,
        equilibrium: 105,
        currentZone: "premium",
      },
    });
    const sig = analyzeSmcSignals(cs, engine, { minScore: 0, cooldownBars: 0 });
    const buy = sig.signals.find((s) => s.signal === "BUY")!;
    expect(buy.triggeredRules.some((r) => r.startsWith("zone:"))).toBe(false);
  });

  it("session filter contributes only when it returns true", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const on = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      sessionEnabled: true,
      sessionFilter: () => true,
    }).signals.find((s) => s.signal === "BUY")!;
    const off = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      sessionEnabled: false,
    }).signals.find((s) => s.signal === "BUY")!;
    expect(on.score - off.score).toBe(DEFAULT_SMC_SIGNAL_CONFIG.weights.session);
    expect(on.triggeredRules).toContain("session");
  });

  it("volume filter respects the multiple and rolling window", () => {
    const cs = candles(15);
    // Boost the volume of candle at the signal bar so it exceeds the rolling avg.
    cs[10] = { ...cs[10], v: 10_000 };
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const sig = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      volumeEnabled: true,
      volumeMultiple: 2,
      volumeWindow: 5,
    });
    const buy = sig.signals.find(
      (s) => s.signal === "BUY" && s.triggeredRules.includes("volume"),
    );
    expect(buy).toBeTruthy();
  });

  it("FVG or Order Block satisfies the last mandatory (either alone is enough)", () => {
    const cs = candles(15);
    // Remove OB, keep FVG → still BUY.
    const bullNoOb: EngineOverrides = {
      ...bullishStackAt(cs, 10),
      orderBlocks: [],
    };
    const sig1 = analyzeSmcSignals(cs, makeEngine(cs, bullNoOb), {
      minScore: 40,
      cooldownBars: 0,
    });
    expect(sig1.signals.some((s) => s.signal === "BUY")).toBe(true);
    // Remove FVG, keep OB → still BUY.
    const bullNoFvg: EngineOverrides = {
      ...bullishStackAt(cs, 10),
      fvgs: [],
    };
    const sig2 = analyzeSmcSignals(cs, makeEngine(cs, bullNoFvg), {
      minScore: 40,
      cooldownBars: 0,
    });
    expect(sig2.signals.some((s) => s.signal === "BUY")).toBe(true);
  });
});

// ── Conflict + cooldown ──────────────────────────────────────────────────

describe("SMC Signal Engine · conflict + cooldown", () => {
  it("cooldown suppresses signals for the configured bars after a fire", () => {
    const cs = candles(20);
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const sig = analyzeSmcSignals(cs, engine, { minScore: 60, cooldownBars: 4 });
    const fireIdx = sig.signals.findIndex((s) => s.signal === "BUY");
    expect(fireIdx).toBeGreaterThanOrEqual(0);
    for (let i = fireIdx + 1; i <= fireIdx + 4 && i < sig.signals.length; i++) {
      expect(sig.signals[i].signal).toBe("WAIT");
      expect(sig.signals[i].reasons).toContain("cooldown");
    }
    expect(sig.meta.cooldownHits).toBeGreaterThan(0);
  });

  it("emits CONFLICT when both directions satisfy mandatory rules", () => {
    const cs = candles(15);
    const bull = bullishStackAt(cs, 10);
    const bear = bearishStackAt(cs, 10);
    const engine = makeEngine(cs, {
      liquidityEvents: [...(bull.liquidityEvents ?? []), ...(bear.liquidityEvents ?? [])],
      structureEvents: [...(bull.structureEvents ?? []), ...(bear.structureEvents ?? [])],
      displacementCandles: [
        ...(bull.displacementCandles ?? []),
        ...(bear.displacementCandles ?? []),
      ],
      fvgs: [...(bull.fvgs ?? []), ...(bear.fvgs ?? [])],
    });
    const sig = analyzeSmcSignals(cs, engine, { minScore: 0, cooldownBars: 0 });
    const conflict = sig.signals.find((s) => s.signal === "CONFLICT");
    expect(conflict).toBeTruthy();
    expect(conflict!.reasons).toContain("both_directions_satisfy_mandatory_rules");
  });
});

// ── No-lookahead / determinism ───────────────────────────────────────────

describe("SMC Signal Engine · no-lookahead + determinism", () => {
  it("byte-identical output across repeated runs", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const a = analyzeSmcSignals(cs, engine, { minScore: 60, cooldownBars: 0 });
    const b = analyzeSmcSignals(cs, engine, { minScore: 60, cooldownBars: 0 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("prefix invariance: signal at bar k only depends on events with index <= k", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const full = analyzeSmcSignals(cs, engine, { minScore: 60, cooldownBars: 0 });
    // Reconstruct a prefix engine by filtering all event arrays to index <= k.
    for (let k = 5; k < cs.length; k++) {
      const prefixCs = cs.slice(0, k + 1);
      const prefixEngine = makeEngine(prefixCs, {
        ...engine,
        liquidityEvents: engine.liquidityEvents.filter((e) => e.index <= k),
        structureEvents: engine.structureEvents.filter((e) => e.index <= k),
        displacementCandles: engine.displacementCandles.filter((e) => e.index <= k),
        fvgs: engine.fvgs.filter((g) => g.index <= k),
        orderBlocks: engine.orderBlocks.filter((b) => b.impulseIndex <= k),
        emaBias: engine.emaBias.slice(0, k + 1),
        vwapBias: engine.vwapBias.slice(0, k + 1),
        premiumDiscount: engine.premiumDiscount,
        meta: { ...engine.meta, candleCount: k + 1 },
      });
      const prefixSig = analyzeSmcSignals(prefixCs, prefixEngine, {
        minScore: 60,
        cooldownBars: 0,
      });
      expect(prefixSig.signals[k].signal).toBe(full.signals[k].signal);
      expect(prefixSig.signals[k].structureDirection).toBe(
        full.signals[k].structureDirection,
      );
    }
  });

  it("throws DataLeakageError when a structure event references a future index at the tail", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, {
      ...bullishStackAt(cs, 10),
      structureEvents: [
        {
          type: "BOS",
          direction: "bull",
          index: cs.length + 5,
          t: cs[cs.length - 1].t + 60_000,
          brokenSwing: { index: 0, t: 0, price: 100, kind: "high" },
          price: 100,
        },
      ],
    });
    expect(() => analyzeSmcSignals(cs, engine)).toThrow(
      /structure event at .* referenced for signal/,
    );
  });
});

// ── Config override + adapter wiring ─────────────────────────────────────

describe("SMC Signal Engine · config + adapter wiring", () => {
  it("config override cascades through weights and toggles", () => {
    const cs = candles(15);
    const engine = makeEngine(cs, bullishStackAt(cs, 10));
    const custom = analyzeSmcSignals(cs, engine, {
      minScore: 10,
      cooldownBars: 0,
      emaEnabled: false,
      weights: { ...DEFAULT_SMC_SIGNAL_CONFIG.weights, choch: 1 },
    });
    expect(custom.config.weights.choch).toBe(1);
    expect(custom.config.emaEnabled).toBe(false);
    // Default weights untouched:
    expect(custom.config.weights.displacement).toBe(
      DEFAULT_SMC_SIGNAL_CONFIG.weights.displacement,
    );
  });

  it("analyzeSmcWithSignals composes Stage 1 + Stage 2 in one call", () => {
    const cs = candles(10);
    const { engine, signals } = analyzeSmcWithSignals(cs, { lookback: 1 });
    expect(engine.meta.candleCount).toBe(cs.length);
    expect(signals.signals.length).toBe(cs.length);
  });

  it("strategy adapter exposes signal engine but remains COMING_NEXT / not executable", () => {
    expect(smcStrategyAdapter.availability).toBe("COMING_NEXT");
    expect(smcStrategyAdapter.signalEngineStatus).toBe(SMC_SIGNAL_ENGINE_READY);
    const cs = candles(10);
    const engine = analyzeSmc(cs, { lookback: 1 });
    const sig = smcStrategyAdapter.analyzeSignals(cs, engine, { minScore: 60 });
    expect(sig.signals.length).toBe(cs.length);
  });

  it("engine adapter continues to signal NOT_IMPLEMENTED for runUnifiedBacktest", () => {
    expect(smcStrategyAdapter.engineStatus).toBe("NOT_IMPLEMENTED");
    expect(smcStrategyAdapter.supportedFormulaVersions).toEqual([]);
  });
});

// Silence unused type imports lint if any:
export type _ = SmcSignalConfig;
