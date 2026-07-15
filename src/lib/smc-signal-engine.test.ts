// Phase 21.4 · Stage 2 — SMC Signal Engine tests.
//
// Deterministic, network-free. Verifies scoring, mandatory rules, optional
// filters, conflict resolution, cooldown, config overrides, prefix
// invariance (no lookahead) and adapter wiring.

import { describe, expect, it } from "vitest";
import { analyzeSmc, type SmcEngineResult } from "./smc-engine";
import {
  DEFAULT_SMC_SIGNAL_CONFIG,
  SMC_SIGNAL_ENGINE_READY,
  SMC_SIGNAL_ENGINE_VERSION,
  analyzeSmcSignals,
  analyzeSmcWithSignals,
  type SmcSignalConfig,
  type SmcSignalDebug,
} from "./smc-signal-engine";
import { smcStrategyAdapter } from "./backtest/strategy";
import type { Candle } from "./smc-types";

function candle(t: number, o: number, h: number, l: number, c: number, v = 1000): Candle {
  return { t, o, h, l, c, v };
}

// ── Fixtures ─────────────────────────────────────────────────────────────
// A candle series that produces a full bearish SMC setup around index 11:
//   pivot high → equal-high sweep at idx 8 (buy-side) → bearish CHOCH →
//   bearish displacement → bearish FVG. Enough structure for a SELL.
function bearishSetup(): Candle[] {
  const raw: [number, number, number, number, number, number][] = [
    [0, 100, 101, 99, 100.5, 1000],
    [1, 100.5, 102, 100, 101.5, 1000],
    [2, 101.5, 104, 101, 103.5, 1000], // pivot high (label HH)
    [3, 103.5, 104, 101, 101.5, 1000],
    [4, 101.5, 103, 101, 102.5, 1000],
    [5, 102.5, 106, 102, 105.5, 1000],
    [6, 105.5, 108, 105, 107.5, 5000], // bull displacement / BOS
    [7, 107.5, 109, 107, 108.5, 1000],
    [8, 108.5, 113, 108, 108.0, 1000], // sweep buy-side above prior high
    [9, 108.0, 108.5, 105, 105.5, 1000],
    [10, 105.5, 106, 100, 100.5, 5000], // bear displacement, break of structure
    [11, 100.5, 101, 96, 96.5, 5000], // bearish CHOCH candle
    [12, 96.5, 97, 93, 93.5, 1000],
    [13, 93.5, 94, 90, 90.5, 1000],
    [14, 90.5, 91, 87, 87.5, 1000],
  ];
  return raw.map(([t, o, h, l, c, v]) => candle(t, o, h, l, c, v));
}

// Flat noise — no structure, no sweep, no CHOCH: forces INVALID / WAIT.
function flatNoise(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 20; i++) {
    const p = 100 + (i % 2) * 0.1;
    out.push(candle(i, p, p + 0.2, p - 0.2, p + 0.05, 1000));
  }
  return out;
}

function runFull(candles: Candle[], cfg?: Partial<SmcSignalConfig>) {
  const engine = analyzeSmc(candles, { lookback: 1 });
  const sig = analyzeSmcSignals(candles, engine, cfg);
  return { engine, sig };
}

function firstOf(signals: SmcSignalDebug[], state: string) {
  return signals.find((s) => s.signal === state) ?? null;
}

// ── Basic states ─────────────────────────────────────────────────────────

describe("SMC Signal Engine · basic states", () => {
  it("returns one debug row per candle with the correct meta", () => {
    const cs = bearishSetup();
    const { sig } = runFull(cs);
    expect(sig.version).toBe(SMC_SIGNAL_ENGINE_VERSION);
    expect(sig.signals.length).toBe(cs.length);
    expect(sig.meta.candleCount).toBe(cs.length);
    expect(sig.meta.dataLeakageChecked).toBe(true);
  });

  it("emits a SELL when the bearish stack completes", () => {
    const cs = bearishSetup();
    const { sig } = runFull(cs, { minScore: 60, cooldownBars: 0 });
    const sell = firstOf(sig.signals, "SELL");
    expect(sell).not.toBeNull();
    expect(sell!.structureDirection).toBe("bear");
    expect(sell!.triggeredRules).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^CHOCH:bear/),
        "displacement:bear",
      ]),
    );
    expect(sell!.score).toBeGreaterThanOrEqual(60);
  });

  it("emits WAIT before mandatory rules complete", () => {
    const cs = bearishSetup();
    const { sig } = runFull(cs);
    const early = sig.signals.slice(0, 6);
    for (const s of early) {
      expect(["WAIT", "INVALID"]).toContain(s.signal);
    }
  });

  it("emits INVALID when no liquidity sweep exists in flat data", () => {
    const cs = flatNoise();
    const { sig } = runFull(cs, { minScore: 0 });
    const invalid = firstOf(sig.signals, "INVALID");
    expect(invalid).not.toBeNull();
    expect(invalid!.reasons.join(",")).toContain("no_liquidity_sweep_in_window");
  });

  it("emits WAIT (not SELL/BUY) when score is below minScore", () => {
    const cs = bearishSetup();
    const { sig } = runFull(cs, { minScore: 999, cooldownBars: 0 });
    for (const s of sig.signals) {
      expect(s.signal).not.toBe("BUY");
      expect(s.signal).not.toBe("SELL");
    }
    const bar = sig.signals.find((s) =>
      s.reasons.some((r) => r.startsWith("score_below_min")),
    );
    expect(bar).toBeTruthy();
  });
});

// ── Score engine ─────────────────────────────────────────────────────────

describe("SMC Signal Engine · score engine", () => {
  it("weights are transparent and additive", () => {
    const cs = bearishSetup();
    const engine = analyzeSmc(cs, { lookback: 1 });
    const weightsA = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
    }).signals.find((s) => s.signal === "SELL")!.score;
    const weightsB = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      weights: { ...DEFAULT_SMC_SIGNAL_CONFIG.weights, choch: 100 },
    }).signals.find((s) => s.signal === "SELL")!.score;
    expect(weightsB - weightsA).toBe(100 - DEFAULT_SMC_SIGNAL_CONFIG.weights.choch);
  });

  it("optional EMA/VWAP toggles change the emitted score", () => {
    const cs = bearishSetup();
    const engine = analyzeSmc(cs, { lookback: 1 });
    const withEma = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      emaEnabled: true,
      vwapEnabled: false,
    }).signals.find((s) => s.signal === "SELL")!;
    const withoutEma = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      emaEnabled: false,
      vwapEnabled: false,
    }).signals.find((s) => s.signal === "SELL")!;
    expect(withEma.score).toBeGreaterThanOrEqual(withoutEma.score);
  });
});

// ── Optional filters ─────────────────────────────────────────────────────

describe("SMC Signal Engine · optional filters", () => {
  it("premium/discount adds score only when aligned", () => {
    const cs = bearishSetup();
    const engine = analyzeSmc(cs, { lookback: 1 });
    const sig = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      premiumDiscountEnabled: true,
    });
    const sell = sig.signals.find((s) => s.signal === "SELL")!;
    // Bear setup runs while price crashes → zone should be discount, not premium.
    // So premiumDiscount confirmation should NOT trigger for bear.
    expect(sell.triggeredRules.some((r) => r.startsWith("zone:premium"))).toBe(false);
  });

  it("session filter contributes only when it returns true", () => {
    const cs = bearishSetup();
    const engine = analyzeSmc(cs, { lookback: 1 });
    const withSession = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      sessionEnabled: true,
      sessionFilter: () => true,
    }).signals.find((s) => s.signal === "SELL")!;
    const withoutSession = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      sessionEnabled: false,
    }).signals.find((s) => s.signal === "SELL")!;
    expect(withSession.score - withoutSession.score).toBe(
      DEFAULT_SMC_SIGNAL_CONFIG.weights.session,
    );
    expect(withSession.triggeredRules).toContain("session");
  });

  it("volume filter respects the multiple and window", () => {
    const cs = bearishSetup();
    const engine = analyzeSmc(cs, { lookback: 1 });
    const sig = analyzeSmcSignals(cs, engine, {
      minScore: 0,
      cooldownBars: 0,
      volumeEnabled: true,
      volumeMultiple: 1.5,
      volumeWindow: 5,
    });
    // Some SELL bar has volume 5000 vs rolling avg ~1000-2000 → volume rule fires.
    const sell = sig.signals.find(
      (s) => s.signal === "SELL" && s.triggeredRules.includes("volume"),
    );
    expect(sell).toBeTruthy();
  });
});

// ── Conflict + cooldown ──────────────────────────────────────────────────

describe("SMC Signal Engine · conflict + cooldown", () => {
  it("cooldown suppresses signals for the configured window after a fire", () => {
    const cs = bearishSetup();
    const { sig } = runFull(cs, { minScore: 60, cooldownBars: 5 });
    const fireIdx = sig.signals.findIndex(
      (s) => s.signal === "BUY" || s.signal === "SELL",
    );
    expect(fireIdx).toBeGreaterThanOrEqual(0);
    for (let i = fireIdx + 1; i <= fireIdx + 5 && i < sig.signals.length; i++) {
      expect(["WAIT", "INVALID"]).toContain(sig.signals[i].signal);
      if (sig.signals[i].signal === "WAIT") {
        expect(sig.signals[i].reasons).toContain("cooldown");
      }
    }
  });

  it("emits CONFLICT when both directions satisfy mandatory rules", () => {
    // Simulate by injecting a synthetic engine where both dir mandatory pass.
    const cs = bearishSetup();
    const engine = analyzeSmc(cs, { lookback: 1 });
    const idx = cs.length - 1;
    const synthetic: SmcEngineResult = {
      ...engine,
      liquidityEvents: [
        { type: "sweep", side: "sell", index: idx - 2, t: cs[idx - 2].t, level: 100, reclaim: false },
        { type: "sweep", side: "buy", index: idx - 2, t: cs[idx - 2].t, level: 110, reclaim: false },
      ],
      structureEvents: [
        {
          type: "CHoCH",
          direction: "bull",
          index: idx - 1,
          t: cs[idx - 1].t,
          brokenSwing: { index: 0, t: 0, price: 100, kind: "high" },
          price: 100,
        },
        {
          type: "CHoCH",
          direction: "bear",
          index: idx - 1,
          t: cs[idx - 1].t,
          brokenSwing: { index: 0, t: 0, price: 100, kind: "low" },
          price: 100,
        },
      ],
      displacementCandles: [
        { index: idx - 1, t: cs[idx - 1].t, direction: "bull", range: 5, ratio: 3 },
        { index: idx - 1, t: cs[idx - 1].t, direction: "bear", range: 5, ratio: 3 },
      ],
      fvgs: [
        { direction: "bullish", index: idx - 2, t: cs[idx - 2].t, top: 100, bottom: 95, size: 5, status: "unfilled", fillPct: 0, filledIndex: null },
        { direction: "bearish", index: idx - 2, t: cs[idx - 2].t, top: 120, bottom: 115, size: 5, status: "unfilled", fillPct: 0, filledIndex: null },
      ],
    };
    const sig = analyzeSmcSignals(cs, synthetic, { minScore: 0, cooldownBars: 0 });
    const conflict = sig.signals.find((s) => s.signal === "CONFLICT");
    expect(conflict).toBeTruthy();
    expect(conflict!.reasons).toContain("both_directions_satisfy_mandatory_rules");
  });
});

// ── No-lookahead / determinism ───────────────────────────────────────────

describe("SMC Signal Engine · no-lookahead + determinism", () => {
  it("is byte-identical across repeated runs", () => {
    const cs = bearishSetup();
    const a = runFull(cs).sig;
    const b = runFull(cs).sig;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("prefix invariance: signals at bar k only depend on candles <= k", () => {
    const cs = bearishSetup();
    const full = runFull(cs, { minScore: 60, cooldownBars: 0 }).sig;
    // Compare each prefix's tail signal to the equivalent bar in the full run.
    // Only bars that have enough history for swing confirmation (i >= 2) are
    // meaningfully comparable.
    for (let k = 4; k < cs.length; k++) {
      const prefix = analyzeSmcSignals(
        cs.slice(0, k + 1),
        analyzeSmc(cs.slice(0, k + 1), { lookback: 1 }),
        { minScore: 60, cooldownBars: 0 },
      );
      const tail = prefix.signals[k];
      const fullBar = full.signals[k];
      // Signal state and structure direction must match — any drift here is
      // future-information leaking backwards.
      expect(tail.signal).toBe(fullBar.signal);
      expect(tail.structureDirection).toBe(fullBar.structureDirection);
    }
  });

  it("throws DataLeakageError if a structure event references a future index at the tail", () => {
    const cs = bearishSetup();
    const engine = analyzeSmc(cs, { lookback: 1 });
    const rogue: SmcEngineResult = {
      ...engine,
      structureEvents: [
        ...engine.structureEvents,
        {
          type: "BOS",
          direction: "bull",
          index: cs.length + 10, // future
          t: cs[cs.length - 1].t + 60_000,
          brokenSwing: { index: 0, t: 0, price: 100, kind: "high" },
          price: 100,
        },
      ],
    };
    expect(() => analyzeSmcSignals(cs, rogue)).toThrow(/DATA_LEAKAGE|future|data/i);
  });
});

// ── Config override + wrapper ────────────────────────────────────────────

describe("SMC Signal Engine · config + adapter wiring", () => {
  it("full config override cascades through weights and toggles", () => {
    const cs = bearishSetup();
    const engine = analyzeSmc(cs, { lookback: 1 });
    const custom = analyzeSmcSignals(cs, engine, {
      minScore: 10,
      cooldownBars: 0,
      liquidityEnabled: true,
      emaEnabled: false,
      vwapEnabled: false,
      premiumDiscountEnabled: false,
      volumeEnabled: false,
      sessionEnabled: false,
      weights: { ...DEFAULT_SMC_SIGNAL_CONFIG.weights, choch: 1 },
    });
    expect(custom.config.weights.choch).toBe(1);
    expect(custom.config.emaEnabled).toBe(false);
  });

  it("analyzeSmcWithSignals composes engine + signals in one call", () => {
    const cs = bearishSetup();
    const { engine, signals } = analyzeSmcWithSignals(
      cs,
      { lookback: 1 },
      { minScore: 60, cooldownBars: 0 },
    );
    expect(engine.meta.candleCount).toBe(cs.length);
    expect(signals.signals.length).toBe(cs.length);
  });

  it("strategy adapter exposes signal engine but remains COMING_NEXT / not executable", () => {
    expect(smcStrategyAdapter.availability).toBe("COMING_NEXT");
    expect(smcStrategyAdapter.signalEngineStatus).toBe(SMC_SIGNAL_ENGINE_READY);
    const cs = bearishSetup();
    const engine = smcStrategyAdapter.analyzeStructure(cs, { lookback: 1 });
    const sig = smcStrategyAdapter.analyzeSignals(cs, engine, { minScore: 60 });
    expect(sig.signals.length).toBe(cs.length);
  });
});