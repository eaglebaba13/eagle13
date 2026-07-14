// Pure helpers for the Intraday Market Replay Engine.
//
// This module contains NO business logic from the production Astro / Signal /
// Level engines. It only:
//   • defines shared replay types (Candle, Timeframe, ReplayConfig)
//   • guards causality (no future-candle access)
//   • resolves trade outcome across an ordered slice of intraday candles
//   • computes deterministic Run IDs and simple session stats
//
// Everything is a pure function — no I/O, no Date.now, no globals — so replay
// results are fully reproducible.

import { hashConfig } from "./backtest-engine";

export const REPLAY_ENGINE_VERSION = "1.0.0";
export const REPLAY_FORMULA_VERSION = "astro-levels@1";

export type Timeframe = "1m" | "3m" | "5m" | "15m" | "30m" | "60m";
export const TIMEFRAMES: Timeframe[] = ["1m", "3m", "5m", "15m", "30m", "60m"];

// Provider support matrix — Yahoo's public chart endpoint.
// The route uses this to disable unsupported timeframes at pick time.
export const YAHOO_TIMEFRAME_LIMITS: Record<Timeframe, { maxAgeDays: number; native: boolean }> = {
  "1m": { maxAgeDays: 7, native: true },
  "3m": { maxAgeDays: 7, native: false }, // aggregated from 1m
  "5m": { maxAgeDays: 60, native: true },
  "15m": { maxAgeDays: 730, native: true },
  "30m": { maxAgeDays: 730, native: true },
  "60m": { maxAgeDays: 730, native: true },
};

export type Candle = {
  ts: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type EntryMode = "signal_close" | "next_open";
export type AmbiguousPolicy = "conservative" | "optimistic" | "mark_ambiguous";

export type ReplayCosts = {
  slippagePct: number;
  brokerageFlat: number;
  brokeragePct: number;
};

export const ZERO_REPLAY_COSTS: ReplayCosts = {
  slippagePct: 0,
  brokerageFlat: 0,
  brokeragePct: 0,
};

export type ReplayConfig = {
  symbol: string;
  date: string; // yyyy-mm-dd session date
  timeframe: Timeframe;
  provider: string;
  entryMode: EntryMode;
  policy: AmbiguousPolicy;
  costs: ReplayCosts;
};

export function computeReplayRunId(cfg: ReplayConfig): string {
  return [
    cfg.symbol,
    cfg.date,
    cfg.timeframe,
    cfg.provider,
    cfg.entryMode,
    cfg.policy,
    REPLAY_ENGINE_VERSION,
    REPLAY_FORMULA_VERSION,
    hashConfig({ ...cfg }),
  ].join(":");
}

/* --------------------------- causality --------------------------- */

/** Return the candles visible at replay index N. Never leaks future candles. */
export function visibleCandles(candles: Candle[], upToIndex: number): Candle[] {
  if (upToIndex < 0) return [];
  return candles.slice(0, Math.min(upToIndex + 1, candles.length));
}

/** Throws if the caller tries to peek at a candle strictly after `upToIndex`. */
export function assertNoFutureAccess(index: number, upToIndex: number): void {
  if (index > upToIndex) {
    throw new Error(`REPLAY_CAUSALITY_ERROR: index ${index} > current ${upToIndex}`);
  }
}

/* --------------------------- trade resolution --------------------------- */

export type TradeStatus =
  | "PENDING"
  | "ACTIVE"
  | "TARGET_HIT"
  | "STOP_HIT"
  | "EXITED"
  | "INVALID_SETUP";

export type TradeResolve = {
  status: TradeStatus;
  entry: number | null;
  entryIndex: number | null;
  exit: number | null;
  exitIndex: number | null;
  mfe: number; // max favourable excursion
  mae: number; // max adverse excursion
  ambiguous: boolean;
  grossPnl: number;
  netPnl: number;
  pnlPct: number;
  costs: number;
};

export type TradeParams = {
  signal: "BUY" | "SELL";
  signalIndex: number;
  entryMode: EntryMode;
  entryOverride?: number | null; // manual entry price
  target: number | null;
  stop: number | null;
  candles: Candle[];
  currentIndex: number;
  policy: AmbiguousPolicy;
  costs?: ReplayCosts;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Deterministic replay trade resolution walking candle-by-candle.
 * Only reads candles up to `currentIndex` (asserted via visibleCandles).
 */
export function resolveTrade(p: TradeParams): TradeResolve {
  const costs = p.costs ?? ZERO_REPLAY_COSTS;
  const base: TradeResolve = {
    status: "PENDING",
    entry: null,
    entryIndex: null,
    exit: null,
    exitIndex: null,
    mfe: 0,
    mae: 0,
    ambiguous: false,
    grossPnl: 0,
    netPnl: 0,
    pnlPct: 0,
    costs: 0,
  };
  if (p.target == null || p.stop == null) {
    return { ...base, status: "INVALID_SETUP" };
  }
  const view = visibleCandles(p.candles, p.currentIndex);
  if (view.length === 0) return base;

  // Determine entry candle / price.
  let entryIndex: number;
  let entry: number;
  const signalCandle = view[p.signalIndex];
  if (!signalCandle) return base;
  if (p.entryOverride != null) {
    entry = p.entryOverride;
    entryIndex = p.signalIndex;
  } else if (p.entryMode === "signal_close") {
    entry = signalCandle.close;
    entryIndex = p.signalIndex;
  } else {
    // next_open: need candle after signal
    const nextIdx = p.signalIndex + 1;
    if (nextIdx > p.currentIndex || nextIdx >= p.candles.length) {
      return { ...base, entryIndex: null, status: "PENDING" };
    }
    entry = view[nextIdx].open;
    entryIndex = nextIdx;
  }

  // Apply slippage on entry (adverse direction).
  const dir: 1 | -1 = p.signal === "BUY" ? 1 : -1;
  const entryAdj = entry * (1 + (dir * costs.slippagePct) / 100);

  // Walk candles from entryIndex through currentIndex tracking MFE / MAE.
  let mfe = 0,
    mae = 0;
  let exit: number | null = null;
  let exitIndex: number | null = null;
  let ambiguous = false;
  let status: TradeStatus = "ACTIVE";

  for (let i = entryIndex; i <= p.currentIndex && i < p.candles.length; i++) {
    const c = view[i];
    const highExc = (c.high - entryAdj) * dir;
    const lowExc = (c.low - entryAdj) * dir;
    if (highExc > mfe) mfe = highExc;
    if (lowExc < mae) mae = lowExc;

    const targetHit = dir === 1 ? c.high >= p.target : c.low <= p.target;
    const stopHit = dir === 1 ? c.low <= p.stop : c.high >= p.stop;

    if (i === entryIndex) {
      // On the entry candle we cannot know intra-bar order. Apply the same
      // both-touched policy as the backtest engine.
      if (targetHit && stopHit) {
        ambiguous = true;
        if (p.policy === "conservative") {
          exit = p.stop;
          status = "STOP_HIT";
        } else if (p.policy === "optimistic") {
          exit = p.target;
          status = "TARGET_HIT";
        } else {
          exit = p.stop;
          status = "STOP_HIT";
        }
        exitIndex = i;
        break;
      }
      if (targetHit) {
        exit = p.target;
        exitIndex = i;
        status = "TARGET_HIT";
        break;
      }
      if (stopHit) {
        exit = p.stop;
        exitIndex = i;
        status = "STOP_HIT";
        break;
      }
      continue;
    }

    if (targetHit && stopHit) {
      ambiguous = true;
      if (p.policy === "conservative") {
        exit = p.stop;
        status = "STOP_HIT";
      } else if (p.policy === "optimistic") {
        exit = p.target;
        status = "TARGET_HIT";
      } else {
        exit = p.stop;
        status = "STOP_HIT";
      }
      exitIndex = i;
      break;
    }
    if (targetHit) {
      exit = p.target;
      exitIndex = i;
      status = "TARGET_HIT";
      break;
    }
    if (stopHit) {
      exit = p.stop;
      exitIndex = i;
      status = "STOP_HIT";
      break;
    }
  }

  // If we exhausted visible candles without hitting T/S, keep ACTIVE and
  // mark exit at the last close for the running PnL (but do not close).
  const runningExit = exit ?? view[Math.min(p.currentIndex, view.length - 1)].close;
  const grossPnl = round2((runningExit - entryAdj) * dir);
  const notional = Math.abs(entryAdj) + Math.abs(runningExit);
  const slipExit = notional * (costs.slippagePct / 100);
  const brok = costs.brokerageFlat + notional * (costs.brokeragePct / 100);
  const totalCosts = round2(slipExit + brok);
  const netPnl = round2(grossPnl - totalCosts);
  const pnlPct = round2(((runningExit - entryAdj) / entryAdj) * 100 * dir);

  return {
    status,
    entry: round2(entryAdj),
    entryIndex,
    exit: exit != null ? round2(exit) : null,
    exitIndex,
    mfe: round2(mfe),
    mae: round2(mae),
    ambiguous,
    grossPnl,
    netPnl,
    pnlPct,
    costs: totalCosts,
  };
}

/* --------------------------- session summary --------------------------- */

export type ClosedTrade = {
  signal: "BUY" | "SELL";
  entry: number;
  exit: number;
  pnl: number;
  status: TradeStatus;
  ambiguous: boolean;
};

export type SessionStats = {
  totalSignals: number;
  buy: number;
  sell: number;
  wait: number;
  wins: number;
  losses: number;
  ambiguous: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  best: number;
  worst: number;
  maxDrawdown: number;
};

export function summarizeSession(
  trades: ClosedTrade[],
  signals: { buy: number; sell: number; wait: number },
): SessionStats {
  let wins = 0,
    losses = 0,
    ambiguous = 0;
  let sumProfit = 0,
    sumLoss = 0,
    cum = 0,
    peak = 0,
    maxDD = 0;
  let best = 0,
    worst = 0;
  for (const t of trades) {
    if (t.ambiguous) ambiguous++;
    if (t.pnl > 0) {
      wins++;
      sumProfit += t.pnl;
    } else if (t.pnl < 0) {
      losses++;
      sumLoss += Math.abs(t.pnl);
    }
    cum = round2(cum + t.pnl);
    if (cum > peak) peak = cum;
    if (peak - cum > maxDD) maxDD = round2(peak - cum);
    if (t.pnl > best) best = t.pnl;
    if (t.pnl < worst) worst = t.pnl;
  }
  const decided = wins + losses;
  const winRate = decided > 0 ? round2((wins / decided) * 100) : 0;
  const pf = sumLoss > 0 ? round2(sumProfit / sumLoss) : sumProfit > 0 ? 999 : 0;
  return {
    totalSignals: signals.buy + signals.sell + signals.wait,
    buy: signals.buy,
    sell: signals.sell,
    wait: signals.wait,
    wins,
    losses,
    ambiguous,
    winRate,
    netPnl: cum,
    profitFactor: pf,
    best: round2(best),
    worst: round2(worst),
    maxDrawdown: maxDD,
  };
}
