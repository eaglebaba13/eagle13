// Phase 21.4 · Stage 3 — SMC Historical Formula Adapter.
//
// Pure, deterministic wrapper over the Stage-2 SMC Signal Engine. Consumes
// OHLCV candles + pre-computed signals via `cfg.extras` and emits trades
// through the shared HistoricalFormulaAdapter contract. No network, no
// broker, no alerts. Astro / Legacy / Absolute engines are untouched.

import { INTRADAY_FORMULA_VERSIONS } from "../../engine-version";
import { applyCosts, ZERO_COSTS, type CostModel } from "../cost-model";
import type { Candle } from "../../smc-types";
import type {
  SmcSignalDebug,
  SmcSignalResult,
} from "../../smc-signal-engine";
import type { SmcEngineResult } from "../../smc-engine";
import type {
  AdapterConfig,
  HistoricalFormulaAdapter,
} from "../adapter";
import type { HistoricalTrade } from "../result";

export const SMC_HISTORICAL_ENGINE_VERSION = "SMC_ENGINE_V1" as const;
export const SMC_HISTORICAL_EXECUTION_VERSION = "SMC_EXECUTION_V1" as const;

export type SmcEntryMode = "next_open" | "signal_close";
export type SmcStopMode = "swing" | "atr" | "order_block" | "liquidity";
export type SmcTargetMode = "fixed_rr" | "opposing_liquidity" | "nearest_structure";
export type SmcPositionMode = "long" | "short" | "both";

export type SmcExecutionConfig = {
  entryMode: SmcEntryMode;
  stopMode: SmcStopMode;
  targetMode: SmcTargetMode;
  rr: number;
  positionMode: SmcPositionMode;
  /** ATR window when stopMode === "atr". */
  atrPeriod: number;
  /** ATR multiple when stopMode === "atr". */
  atrMultiple: number;
  /** Points-per-1.0 price move (index PnL uses 1). */
  pointValue: number;
  /** Contract lot size. */
  lotSize: number;
  /** Quantity in lots. */
  quantity: number;
  /** Maximum bars a position can stay open; null → hold to end of series. */
  maxHoldBars: number | null;
};

export const DEFAULT_SMC_EXECUTION: SmcExecutionConfig = Object.freeze({
  entryMode: "next_open",
  stopMode: "swing",
  targetMode: "fixed_rr",
  rr: 2,
  positionMode: "both",
  atrPeriod: 14,
  atrMultiple: 1.5,
  pointValue: 1,
  lotSize: 1,
  quantity: 1,
  maxHoldBars: null,
});

export type SmcExtras = {
  candles: readonly Candle[];
  signals: readonly SmcSignalDebug[] | SmcSignalResult;
  /** Optional engine result for stop/target derivation (swing, OB, liquidity). */
  engine?: SmcEngineResult;
  execution?: Partial<SmcExecutionConfig>;
};

function readExtras(cfg: AdapterConfig): {
  candles: readonly Candle[];
  signals: readonly SmcSignalDebug[];
  engine: SmcEngineResult | undefined;
  exec: SmcExecutionConfig;
} {
  const ex = cfg.extras as SmcExtras | undefined;
  if (!ex || !Array.isArray(ex.candles) || !ex.signals) {
    throw new Error("smc-historical adapter requires cfg.extras.candles and cfg.extras.signals");
  }
  const signals = Array.isArray(ex.signals)
    ? (ex.signals as readonly SmcSignalDebug[])
    : (ex.signals as SmcSignalResult).signals;
  return {
    candles: ex.candles,
    signals,
    engine: ex.engine,
    exec: { ...DEFAULT_SMC_EXECUTION, ...(ex.execution ?? {}) },
  };
}

function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** True Range–based ATR at bar `i` using only bars <= i. */
function atr(candles: readonly Candle[], i: number, period: number): number {
  if (i <= 0 || period <= 0) return 0;
  const start = Math.max(1, i - period + 1);
  let sum = 0;
  let count = 0;
  for (let k = start; k <= i; k++) {
    const c = candles[k];
    const p = candles[k - 1];
    const tr = Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
    sum += tr;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/** Nearest swing high/low that formed on or before bar `i`. */
function nearestSwing(
  engine: SmcEngineResult | undefined,
  i: number,
  kind: "high" | "low",
): number | null {
  if (!engine) return null;
  for (let k = engine.swings.length - 1; k >= 0; k--) {
    const s = engine.swings[k];
    if (s.index <= i && s.kind === kind) return s.price;
  }
  return null;
}

function orderBlockStop(
  engine: SmcEngineResult | undefined,
  i: number,
  dir: "bull" | "bear",
): number | null {
  if (!engine) return null;
  const want = dir === "bull" ? "bullish" : "bearish";
  // Most recent OB matching direction, formed by bar i.
  for (let k = engine.orderBlocks.length - 1; k >= 0; k--) {
    const ob = engine.orderBlocks[k];
    if (ob.impulseIndex <= i && ob.direction === want) {
      return dir === "bull" ? ob.bottom : ob.top;
    }
  }
  return null;
}

function liquidityStop(
  engine: SmcEngineResult | undefined,
  entry: number,
  dir: "bull" | "bear",
): number | null {
  if (!engine) return null;
  const want = dir === "bull" ? "sell_side" : "buy_side";
  // Nearest liquidity level on the losing side of the trade.
  let best: number | null = null;
  let bestDist = Infinity;
  for (const l of engine.liquidityLevels) {
    const priceOk = dir === "bull" ? l.price < entry : l.price > entry;
    if (l.kind !== want && l.kind !== (dir === "bull" ? "equal_low" : "equal_high"))
      continue;
    if (!priceOk) continue;
    const d = Math.abs(entry - l.price);
    if (d < bestDist) {
      bestDist = d;
      best = l.price;
    }
  }
  return best;
}

function opposingLiquidityTarget(
  engine: SmcEngineResult | undefined,
  entry: number,
  dir: "bull" | "bear",
): number | null {
  if (!engine) return null;
  const want = dir === "bull" ? "buy_side" : "sell_side";
  let best: number | null = null;
  let bestDist = Infinity;
  for (const l of engine.liquidityLevels) {
    const priceOk = dir === "bull" ? l.price > entry : l.price < entry;
    if (l.kind !== want && l.kind !== (dir === "bull" ? "equal_high" : "equal_low"))
      continue;
    if (!priceOk) continue;
    const d = Math.abs(entry - l.price);
    if (d < bestDist) {
      bestDist = d;
      best = l.price;
    }
  }
  return best;
}

function nearestStructureTarget(
  engine: SmcEngineResult | undefined,
  entry: number,
  dir: "bull" | "bear",
): number | null {
  const want = dir === "bull" ? "high" : "low";
  return nearestSwing(engine, engine ? engine.swings.length - 1 : -1, want) ??
    (want === "high"
      ? entry * 1.01
      : entry * 0.99);
}

function deriveStop(
  entry: number,
  signalIdx: number,
  dir: "bull" | "bear",
  candles: readonly Candle[],
  engine: SmcEngineResult | undefined,
  exec: SmcExecutionConfig,
): number | null {
  switch (exec.stopMode) {
    case "swing": {
      const swing = nearestSwing(engine, signalIdx, dir === "bull" ? "low" : "high");
      if (swing != null) return swing;
      // Fallback — use the signal candle's own low/high.
      const c = candles[signalIdx];
      return dir === "bull" ? c.l : c.h;
    }
    case "atr": {
      const a = atr(candles, signalIdx, exec.atrPeriod);
      if (a <= 0) return null;
      return dir === "bull" ? entry - a * exec.atrMultiple : entry + a * exec.atrMultiple;
    }
    case "order_block": {
      const ob = orderBlockStop(engine, signalIdx, dir);
      if (ob != null) return ob;
      const c = candles[signalIdx];
      return dir === "bull" ? c.l : c.h;
    }
    case "liquidity": {
      const liq = liquidityStop(engine, entry, dir);
      if (liq != null) return liq;
      const c = candles[signalIdx];
      return dir === "bull" ? c.l : c.h;
    }
    default:
      return null;
  }
}

function deriveTarget(
  entry: number,
  stop: number,
  dir: "bull" | "bear",
  engine: SmcEngineResult | undefined,
  exec: SmcExecutionConfig,
): number | null {
  switch (exec.targetMode) {
    case "fixed_rr": {
      const risk = Math.abs(entry - stop);
      if (risk <= 0) return null;
      return dir === "bull" ? entry + risk * exec.rr : entry - risk * exec.rr;
    }
    case "opposing_liquidity":
      return opposingLiquidityTarget(engine, entry, dir);
    case "nearest_structure":
      return nearestStructureTarget(engine, entry, dir);
    default:
      return null;
  }
}

type OpenPosition = {
  signalIdx: number;
  entryIdx: number;
  entry: number;
  stop: number;
  target: number;
  dir: "bull" | "bear";
  side: "BUY" | "SELL";
  signal: SmcSignalDebug;
};

function closePosition(
  pos: OpenPosition,
  exitIdx: number,
  exitPrice: number,
  outcome: HistoricalTrade["outcome"],
  candles: readonly Candle[],
  exec: SmcExecutionConfig,
  costs: CostModel,
  source: string,
  mfe: number,
  mae: number,
): HistoricalTrade {
  const dirMul = pos.dir === "bull" ? 1 : -1;
  const notionalMul = exec.pointValue * exec.lotSize * exec.quantity;
  const gross = (exitPrice - pos.entry) * dirMul * notionalMul;
  const { netPnl, costs: totalCosts } = applyCosts(gross, pos.entry, exitPrice, costs);
  const entryT = candles[pos.entryIdx].t;
  const exitT = candles[exitIdx].t;
  return {
    id: `SMC_V1-${pos.entryIdx}-${pos.signalIdx}`,
    date: isoDate(entryT),
    side: pos.side,
    entry: round2(pos.entry),
    stop: round2(pos.stop),
    target: round2(pos.target),
    exit: round2(exitPrice),
    outcome,
    pnl: round2(netPnl),
    mfe: round2(mfe),
    mae: round2(mae),
    holdingTime: Math.max(0, Math.round((exitT - entryT) / 60000)),
    formulaVersion: INTRADAY_FORMULA_VERSIONS.SMC_V1,
    source,
    ambiguous: false,
    reasons: pos.signal.reasons,
    metadata: {
      strategy: "SMC",
      smcVersion: "SMC_V1",
      signalScore: pos.signal.score,
      bias: pos.signal.bias,
      structureDirection: pos.signal.structureDirection,
      triggeredRules: pos.signal.triggeredRules,
      missingRules: pos.signal.missingRules,
      holdingBars: exitIdx - pos.entryIdx,
      grossPnl: round2(gross),
      costs: totalCosts,
      entryMode: exec.entryMode,
      stopMode: exec.stopMode,
      targetMode: exec.targetMode,
      rr: exec.rr,
    },
  } satisfies HistoricalTrade;
}

function inRange(dateIso: string, from: string, to: string): boolean {
  return dateIso >= from && dateIso <= to;
}

export const smcHistoricalAdapter: HistoricalFormulaAdapter = {
  id: INTRADAY_FORMULA_VERSIONS.SMC_V1,
  label: "SMC Historical v1",
  dataGranularity: "5m",
  causality: "intraday-5m",
  supportedInstruments: ["NIFTY50", "BANKNIFTY", "GOLD", "SILVER", "BTC"],
  methodology:
    "SMC Historical v1 — deterministic BUY/SELL derivation from the Stage-2 SMC Signal Engine with configurable entry (next-open / signal-close), stop (swing/ATR/OB/liquidity), target (fixed-RR/opposing-liquidity/nearest-structure) and one active position.",
  disclaimers: [
    "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
    "SMC historical results depend on 5-minute candle resolution; intraday event ordering within a bar is resolved conservatively (stop before target when both are touched).",
  ],
  versions: {
    engineVersion: SMC_HISTORICAL_ENGINE_VERSION,
    executionVersion: SMC_HISTORICAL_EXECUTION_VERSION,
    cubeVersion: "n/a",
    policyVersion: "SMC_POLICY_V1",
  },
  validateConfig(cfg) {
    const { candles, signals } = readExtras(cfg);
    if (candles.length > 0 && signals.length !== candles.length) {
      throw new Error(
        `smc-historical: signals length (${signals.length}) must equal candles length (${candles.length})`,
      );
    }
  },
  planSessions(cfg) {
    // SMC iterates the full range in one pass to preserve position continuity
    // across day boundaries. We surface a single synthetic "session" keyed by
    // `cfg.from` so the shared runner still calls `evaluateSession` exactly
    // once and never touches formula-specific state.
    return { dates: [cfg.from], causality: "intraday-5m" };
  },
  async evaluateSession(cfg, _date) {
    const { candles, signals, engine, exec } = readExtras(cfg);
    if (candles.length === 0) return { trades: [] };
    const costs: CostModel = (cfg.costs as CostModel) ?? ZERO_COSTS;
    const source = cfg.source ?? "n/a";
    const trades: HistoricalTrade[] = [];
    let open: OpenPosition | null = null;
    let mfe = 0;
    let mae = 0;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      // Update MFE/MAE while position is open.
      if (open) {
        const dirMul = open.dir === "bull" ? 1 : -1;
        const bestMove = (open.dir === "bull" ? c.h - open.entry : open.entry - c.l);
        const worstMove = (open.dir === "bull" ? c.l - open.entry : open.entry - c.h);
        if (bestMove > mfe) mfe = bestMove;
        if (worstMove < mae) mae = worstMove;

        // Stop-first resolution when both stop & target are inside the bar.
        const stopHit = open.dir === "bull" ? c.l <= open.stop : c.h >= open.stop;
        const targetHit = open.dir === "bull" ? c.h >= open.target : c.l <= open.target;
        const bars = i - open.entryIdx;
        const maxHoldExceeded =
          exec.maxHoldBars != null && bars >= exec.maxHoldBars;

        if (stopHit && targetHit) {
          trades.push(closePosition(open, i, open.stop, "LOSS", candles, exec, costs, source, mfe, mae));
          open = null; mfe = 0; mae = 0;
        } else if (stopHit) {
          trades.push(closePosition(open, i, open.stop, "LOSS", candles, exec, costs, source, mfe, mae));
          open = null; mfe = 0; mae = 0;
        } else if (targetHit) {
          trades.push(closePosition(open, i, open.target, "WIN", candles, exec, costs, source, mfe, mae));
          open = null; mfe = 0; mae = 0;
        } else if (maxHoldExceeded) {
          trades.push(closePosition(open, i, c.c, "FLAT", candles, exec, costs, source, mfe, mae));
          open = null; mfe = 0; mae = 0;
        }
        // suppress unused-variable warning for dirMul in strict TS
        void dirMul;
      }

      // Look for a new signal only when no position is open.
      if (!open && i < signals.length) {
        const sig = signals[i];
        if (sig.signal !== "BUY" && sig.signal !== "SELL") continue;
        const side: "BUY" | "SELL" = sig.signal;
        const allowed =
          exec.positionMode === "both" ||
          (exec.positionMode === "long" && side === "BUY") ||
          (exec.positionMode === "short" && side === "SELL");
        if (!allowed) continue;
        const dir: "bull" | "bear" = side === "BUY" ? "bull" : "bear";

        const entryIdx = exec.entryMode === "next_open" ? i + 1 : i;
        if (entryIdx >= candles.length) continue;
        const entry = exec.entryMode === "next_open"
          ? candles[entryIdx].o
          : candles[i].c;

        const stop = deriveStop(entry, i, dir, candles, engine, exec);
        if (stop == null || (dir === "bull" ? stop >= entry : stop <= entry)) continue;
        const target = deriveTarget(entry, stop, dir, engine, exec);
        if (target == null || (dir === "bull" ? target <= entry : target >= entry)) continue;
        if (!inRange(isoDate(candles[entryIdx].t), cfg.from, cfg.to)) continue;

        open = {
          signalIdx: i,
          entryIdx,
          entry,
          stop,
          target,
          dir,
          side,
          signal: sig,
        };
        mfe = 0;
        mae = 0;
      }
    }

    // Force-close any still-open position at last candle close (FLAT).
    if (open) {
      const last = candles.length - 1;
      trades.push(
        closePosition(open, last, candles[last].c, "FLAT", candles, exec, costs, source, mfe, mae),
      );
    }

    return {
      trades,
      diagnostics: {
        signalCount: signals.length,
        candleCount: candles.length,
      },
    };
  },
  buildMetadata(_cfg, trades) {
    let wins = 0, losses = 0, flats = 0, totalScore = 0;
    for (const t of trades) {
      if (t.outcome === "WIN") wins++;
      else if (t.outcome === "LOSS") losses++;
      else if (t.outcome === "FLAT") flats++;
      const s = (t.metadata as { signalScore?: number }).signalScore;
      if (typeof s === "number") totalScore += s;
    }
    return {
      strategy: "SMC",
      smcVersion: "SMC_V1",
      wins,
      losses,
      flats,
      averageScore: trades.length > 0 ? Math.round((totalScore / trades.length) * 100) / 100 : 0,
    };
  },
};
