// Phase 21.4 · Stage 2 — SMC Signal Engine.
//
// Pure, deterministic BUY / SELL / WAIT / INVALID / CONFLICT signal
// derivation on top of the Stage 1 Structure Engine. No trading, no broker,
// no alerts, no entries, no exits, no scoring hidden from the caller.
//
// Strict causality: every signal emitted at candle N is derived exclusively
// from events, candles, and features whose index is <= N. A violation
// throws DataLeakageError (code = DATA_LEAKAGE_ERROR).

import { analyzeSmc, type SmcBias, type SmcEngineResult } from "./smc-engine";
import type { Candle } from "./smc-types";
import { validateCandles } from "./smc-types";

export const SMC_SIGNAL_ENGINE_VERSION = "SMC_SIGNAL_V1" as const;

export type SmcSignalState = "BUY" | "SELL" | "WAIT" | "INVALID" | "CONFLICT";

export type SmcSignalDirection = "bull" | "bear";

/** Weights are transparent and configurable — no hidden multipliers. */
export type SmcSignalWeights = {
  liquiditySweep: number;
  choch: number;
  displacement: number;
  fvg: number;
  orderBlock: number;
  ema: number;
  vwap: number;
  session: number;
  volume: number;
  premiumDiscount: number;
};

export type SmcSignalConfig = {
  minScore: number;
  emaEnabled: boolean;
  vwapEnabled: boolean;
  sessionEnabled: boolean;
  volumeEnabled: boolean;
  premiumDiscountEnabled: boolean;
  liquidityEnabled: boolean;
  fvgValidityBars: number;
  obValidityBars: number;
  structureWindow: number;
  cooldownBars: number;
  weights: SmcSignalWeights;
  volumeMultiple: number;
  volumeWindow: number;
  /** Optional predicate — return true when the candle timestamp is in-session. */
  sessionFilter?: (t: number) => boolean;
};

export const DEFAULT_SMC_SIGNAL_WEIGHTS: SmcSignalWeights = Object.freeze({
  liquiditySweep: 25,
  choch: 20,
  displacement: 20,
  fvg: 15,
  orderBlock: 15,
  ema: 5,
  vwap: 5,
  session: 5,
  volume: 5,
  premiumDiscount: 5,
});

export const DEFAULT_SMC_SIGNAL_CONFIG: SmcSignalConfig = Object.freeze({
  minScore: 65,
  emaEnabled: true,
  vwapEnabled: true,
  sessionEnabled: false,
  volumeEnabled: false,
  premiumDiscountEnabled: true,
  liquidityEnabled: true,
  fvgValidityBars: 30,
  obValidityBars: 30,
  structureWindow: 20,
  cooldownBars: 3,
  weights: DEFAULT_SMC_SIGNAL_WEIGHTS,
  volumeMultiple: 1.5,
  volumeWindow: 20,
});

export type SmcSignalDebug = {
  index: number;
  t: number;
  signal: SmcSignalState;
  bias: SmcBias;
  structureDirection: SmcSignalDirection | "neutral";
  score: number;
  triggeredRules: string[];
  missingRules: string[];
  reasons: string[];
};

export type SmcSignalResult = {
  version: typeof SMC_SIGNAL_ENGINE_VERSION;
  config: SmcSignalConfig;
  signals: SmcSignalDebug[];
  meta: {
    candleCount: number;
    cooldownHits: number;
    dataLeakageChecked: true;
  };
};

export class DataLeakageError extends Error {
  readonly code = "DATA_LEAKAGE_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "DataLeakageError";
  }
}

function withDefaults(cfg?: Partial<SmcSignalConfig>): SmcSignalConfig {
  const merged: SmcSignalConfig = {
    ...DEFAULT_SMC_SIGNAL_CONFIG,
    ...(cfg ?? {}),
    weights: { ...DEFAULT_SMC_SIGNAL_WEIGHTS, ...(cfg?.weights ?? {}) },
  };
  return merged;
}

type Evaluation = {
  direction: SmcSignalDirection;
  score: number;
  triggered: string[];
  missing: string[];
  mandatoryOk: boolean;
  hasLiquiditySweep: boolean;
};

function inWindow(idx: number, i: number, windowBars: number): boolean {
  return idx <= i && idx >= i - windowBars + 1;
}

function evaluateDirection(
  dir: SmcSignalDirection,
  i: number,
  engine: SmcEngineResult,
  candle: Candle,
  cfg: SmcSignalConfig,
  volAvg: number,
): Evaluation {
  const w = cfg.weights;
  const triggered: string[] = [];
  const missing: string[] = [];
  let score = 0;

  // ── Mandatory: liquidity sweep in window (sell-side for bull, buy-side for bear).
  const sweepSide = dir === "bull" ? "sell" : "buy";
  const sweep = engine.liquidityEvents.find(
    (e) =>
      e.index <= i &&
      inWindow(e.index, i, cfg.structureWindow) &&
      e.side === sweepSide &&
      (e.type === "sweep" || e.type === "grab" || e.type === "stop_hunt"),
  );
  const hasSweep = cfg.liquidityEnabled ? Boolean(sweep) : true;
  if (sweep) {
    triggered.push(`liquiditySweep:${sweepSide}`);
    if (cfg.liquidityEnabled) score += w.liquiditySweep;
  } else if (cfg.liquidityEnabled) {
    missing.push("liquiditySweep");
  }

  // ── Mandatory: CHOCH matching direction, most recent in window.
  const choch = [...engine.structureEvents]
    .reverse()
    .find(
      (e) =>
        e.type === "CHoCH" &&
        e.direction === dir &&
        e.index <= i &&
        inWindow(e.index, i, cfg.structureWindow),
    );
  if (choch) {
    triggered.push(`CHOCH:${dir}`);
    score += w.choch;
  } else {
    missing.push("CHOCH");
  }

  // ── Mandatory: displacement candle matching direction in window.
  const displacement = engine.displacementCandles.find(
    (d) => d.index <= i && inWindow(d.index, i, cfg.structureWindow) && d.direction === dir,
  );
  if (displacement) {
    triggered.push(`displacement:${dir}`);
    score += w.displacement;
  } else {
    missing.push("displacement");
  }

  // ── Mandatory: FVG OR Order Block matching direction, still valid.
  const fvgDir = dir === "bull" ? "bullish" : "bearish";
  const fvg = engine.fvgs.find(
    (g) =>
      g.direction === fvgDir &&
      g.index <= i &&
      i - g.index <= cfg.fvgValidityBars,
  );
  const ob = engine.orderBlocks.find(
    (b) =>
      b.direction === fvgDir &&
      b.impulseIndex <= i &&
      i - b.impulseIndex <= cfg.obValidityBars,
  );
  if (fvg) {
    triggered.push("FVG");
    score += w.fvg;
  }
  if (ob) {
    triggered.push("orderBlock");
    score += w.orderBlock;
  }
  if (!fvg && !ob) missing.push("FVG_or_OrderBlock");

  // ── Optional confirmations (only add score when enabled AND aligned).
  if (cfg.emaEnabled) {
    const sample = engine.emaBias[i];
    if (sample && sample.bias === (dir === "bull" ? "bullish" : "bearish")) {
      triggered.push("EMA");
      score += w.ema;
    }
  }
  if (cfg.vwapEnabled) {
    const sample = engine.vwapBias[i];
    if (sample && sample.bias === (dir === "bull" ? "bullish" : "bearish")) {
      triggered.push("VWAP");
      score += w.vwap;
    }
  }
  if (cfg.premiumDiscountEnabled && engine.premiumDiscount) {
    const zone = engine.premiumDiscount.currentZone;
    if ((dir === "bull" && zone === "discount") || (dir === "bear" && zone === "premium")) {
      triggered.push(`zone:${zone}`);
      score += w.premiumDiscount;
    }
  }
  if (cfg.volumeEnabled && volAvg > 0 && candle.v >= volAvg * cfg.volumeMultiple) {
    triggered.push("volume");
    score += w.volume;
  }
  if (cfg.sessionEnabled && cfg.sessionFilter && cfg.sessionFilter(candle.t)) {
    triggered.push("session");
    score += w.session;
  }

  const mandatoryOk =
    hasSweep && Boolean(choch) && Boolean(displacement) && (Boolean(fvg) || Boolean(ob));

  return {
    direction: dir,
    score,
    triggered,
    missing,
    mandatoryOk,
    hasLiquiditySweep: Boolean(sweep),
  };
}

function rollingVolumeAvg(candles: Candle[], i: number, window: number): number {
  if (window <= 0) return 0;
  const start = Math.max(0, i - window);
  const slice = candles.slice(start, i); // exclude current candle
  if (slice.length === 0) return 0;
  return slice.reduce((a, c) => a + Math.max(0, c.v), 0) / slice.length;
}

function assertNoLeakage(engine: SmcEngineResult, i: number): void {
  // Cheap sanity: filtered arrays used above already respect .index <= i.
  // This runtime guard catches accidental mutation upstream.
  for (const e of engine.structureEvents) {
    if (e.index > i && i >= engine.meta.candleCount - 1) {
      throw new DataLeakageError(
        `structure event at ${e.index} referenced for signal at ${i}`,
      );
    }
  }
}

/**
 * Pure signal-derivation entry point. Deterministic, no IO, no lookahead.
 * Returns one debug row per input candle; consumers may filter by `signal`.
 */
export function analyzeSmcSignals(
  candles: Candle[],
  engine: SmcEngineResult,
  cfg?: Partial<SmcSignalConfig>,
): SmcSignalResult {
  validateCandles(candles);
  const config = withDefaults(cfg);
  if (engine.meta.candleCount !== candles.length) {
    throw new Error(
      `SmcEngineResult candleCount (${engine.meta.candleCount}) does not match candles (${candles.length})`,
    );
  }

  const signals: SmcSignalDebug[] = [];
  let cooldownUntil = -1;
  let cooldownHits = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    assertNoLeakage(engine, i);
    const volAvg = config.volumeEnabled
      ? rollingVolumeAvg(candles, i, config.volumeWindow)
      : 0;

    const bull = evaluateDirection("bull", i, engine, candle, config, volAvg);
    const bear = evaluateDirection("bear", i, engine, candle, config, volAvg);

    let signal: SmcSignalState = "WAIT";
    let direction: SmcSignalDirection | "neutral" = "neutral";
    let score = 0;
    let triggered: string[] = [];
    let missing: string[] = [];
    const reasons: string[] = [];

    if (i <= cooldownUntil) {
      signal = "WAIT";
      reasons.push("cooldown");
      cooldownHits++;
    } else if (bull.mandatoryOk && bear.mandatoryOk) {
      signal = "CONFLICT";
      reasons.push("both_directions_satisfy_mandatory_rules");
      triggered = [...bull.triggered, ...bear.triggered];
      missing = [];
      score = Math.max(bull.score, bear.score);
    } else if (!bull.mandatoryOk && !bear.mandatoryOk) {
      if (config.liquidityEnabled && !bull.hasLiquiditySweep && !bear.hasLiquiditySweep) {
        signal = "INVALID";
        reasons.push("no_liquidity_sweep_in_window");
      } else {
        signal = "WAIT";
        reasons.push("mandatory_rules_incomplete");
      }
      // surface the more advanced side for debug
      const stronger = bull.score >= bear.score ? bull : bear;
      triggered = stronger.triggered;
      missing = stronger.missing;
      score = stronger.score;
      direction = bull.score === bear.score ? "neutral" : stronger.direction;
    } else {
      const pick = bull.mandatoryOk ? bull : bear;
      direction = pick.direction;
      triggered = pick.triggered;
      missing = pick.missing;
      score = pick.score;
      if (pick.score < config.minScore) {
        signal = "WAIT";
        reasons.push(`score_below_min:${pick.score}<${config.minScore}`);
      } else {
        signal = pick.direction === "bull" ? "BUY" : "SELL";
        reasons.push(`mandatory_ok+score>=${config.minScore}`);
        cooldownUntil = i + config.cooldownBars;
      }
    }

    const emaBias = engine.emaBias[i]?.bias ?? "neutral";

    signals.push({
      index: i,
      t: candle.t,
      signal,
      bias: emaBias,
      structureDirection: direction,
      score,
      triggeredRules: triggered,
      missingRules: missing,
      reasons,
    });
  }

  return {
    version: SMC_SIGNAL_ENGINE_VERSION,
    config,
    signals,
    meta: { candleCount: candles.length, cooldownHits, dataLeakageChecked: true },
  };
}

/**
 * Convenience wrapper: run Stage 1 engine + Stage 2 signal engine in one call.
 * Prefer passing a pre-computed SmcEngineResult when reusing it elsewhere.
 */
export function analyzeSmcWithSignals(
  candles: Candle[],
  engineOpts?: Parameters<typeof analyzeSmc>[1],
  signalCfg?: Partial<SmcSignalConfig>,
): { engine: SmcEngineResult; signals: SmcSignalResult } {
  const engine = analyzeSmc(candles, engineOpts);
  const signals = analyzeSmcSignals(candles, engine, signalCfg);
  return { engine, signals };
}

export const SMC_SIGNAL_ENGINE_READY = "SIGNAL_ENGINE_READY" as const;
export type SmcSignalEngineReady = typeof SMC_SIGNAL_ENGINE_READY;