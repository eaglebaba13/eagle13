// Pure, deterministic helpers for the Historical Backtest Engine.
import {
  DEFAULT_ASTRO_FORMULA_VERSION,
  type AstroFormulaVersion,
} from "./engine-version";
//
// This module contains NO business logic from the live signal engine — the
// Astro formulas, cycles, level board and `computeSignal` remain untouched in
// `astro-levels.ts` / `astro-engine.server.ts`. What lives here is strictly:
//
//   • target / stop selection from an already-computed level board
//   • deterministic outcome resolution given a daily OHLC candle
//   • OHLC quality validation (no future-data leakage, malformed candles)
//   • deterministic Run ID hashing for reproducibility
//   • statistical aggregation helpers (expectancy, stddev, sharpe, sortino…)
//
// Everything below is a pure function — no I/O, no globals, no Date.now() —
// which is what makes the backtest engine auditable and reproducible.

export const BACKTEST_ENGINE_VERSION = "1.0.0";
// Bumped only when the production Astro / Signal formulas change. Kept as a
// separate token so a change to this file alone never invalidates a run hash.
export const BACKTEST_FORMULA_VERSION = "astro-levels@1";

export type ExecutionPolicy =
  | "conservative"       // both-touched → LOSS (default, worst-case)
  | "optimistic"         // both-touched → WIN  (best-case)
  | "exclude_ambiguous"; // both-touched → excluded from win-rate stats

export type InvalidSetupPolicy =
  | "fabricate"          // legacy: fall back to ±0.5% band (preserves current output)
  | "strict";            // no level → INVALID_SETUP (excluded from stats)

export type CostModel = {
  slippagePct: number;     // % of entry, applied to entry and exit (per side)
  brokerageFlat: number;   // flat currency cost per round-trip
  brokeragePct: number;    // % of notional, per round-trip
  taxesPct: number;        // % of notional, per round-trip
};

export const ZERO_COSTS: CostModel = {
  slippagePct: 0, brokerageFlat: 0, brokeragePct: 0, taxesPct: 0,
};

export type SignalDir = "BUY" | "SELL" | "WAIT";
export type LevelPoint = { value: number; isResistance: boolean };

/* ----------------------------- utilities ----------------------------- */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deterministic djb2-style hash → 8-char hex. Same input, same output, forever. */
export function hashConfig(input: unknown): string {
  const s = JSON.stringify(input, Object.keys(input as object).sort());
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function computeRunId(cfg: {
  symbol: string;
  from: string;
  to: string;
  policy: ExecutionPolicy;
  invalidSetupPolicy: InvalidSetupPolicy;
  costs: CostModel;
  dataSource: string;
  timezone: string;
  astroFormulaVersion?: AstroFormulaVersion;
}): string {
  const astroFormulaVersion =
    cfg.astroFormulaVersion ?? DEFAULT_ASTRO_FORMULA_VERSION;
  return [
    cfg.symbol,
    cfg.from,
    cfg.to,
    cfg.policy,
    cfg.invalidSetupPolicy,
    BACKTEST_ENGINE_VERSION,
    BACKTEST_FORMULA_VERSION,
    astroFormulaVersion,
    hashConfig({ ...cfg, astroFormulaVersion }),
  ].join(":");
}

/* ------------------------ OHLC quality ------------------------ */

export type OhlcCandle = { date: string; open: number; high: number; low: number; close: number };

export type CandleValidation = { valid: boolean; reason?: string };

/** True when a candle passes basic invariants (finite, high>=low, o/c within [low,high]). */
export function validateCandle(c: OhlcCandle): CandleValidation {
  const { open, high, low, close } = c;
  if (![open, high, low, close].every((n) => Number.isFinite(n))) {
    return { valid: false, reason: "non-finite OHLC" };
  }
  if (high < low) return { valid: false, reason: "high < low" };
  if (open > high || open < low) return { valid: false, reason: "open outside [low,high]" };
  if (close > high || close < low) return { valid: false, reason: "close outside [low,high]" };
  return { valid: true };
}

/** Approx expected trading sessions for a yyyy-mm-dd range (weekdays only). */
export function expectedTradingSessions(fromIso: string, toIso: string, includeWeekends = false): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const to = new Date(toIso + "T00:00:00Z").getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  let n = 0;
  for (let t = from; t <= to; t += 86400_000) {
    const dow = new Date(t).getUTCDay();
    if (includeWeekends || (dow !== 0 && dow !== 6)) n++;
  }
  return n;
}

/* ------------------------ target / stop ------------------------ */

/**
 * Pick the nearest opposing (target) and same-side (stop) levels for a given
 * signal, given the level board and entry price. Returns `null` when a valid
 * level does not exist on the correct side — the caller decides whether to
 * fabricate a fallback or mark the trade INVALID_SETUP.
 *
 * This is a pure re-expression of the target/stop selection previously inlined
 * in `backtest.functions.ts::replayDay` — semantics are identical.
 */
export function pickTargetStop(
  board: LevelPoint[],
  entry: number,
  signal: SignalDir,
): { target: number | null; stop: number | null } {
  if (signal === "WAIT") return { target: null, stop: null };
  const resistancesAbove = board.filter((b) => b.isResistance && b.value > entry).sort((a, b) => a.value - b.value);
  const supportsBelow = board.filter((b) => !b.isResistance && b.value < entry).sort((a, b) => b.value - a.value);
  if (signal === "BUY") {
    return {
      target: resistancesAbove[0]?.value ?? null,
      stop: supportsBelow[0]?.value ?? null,
    };
  }
  return {
    target: supportsBelow[0]?.value ?? null,
    stop: resistancesAbove[0]?.value ?? null,
  };
}

/* ------------------------ outcome resolution ------------------------ */

export type OutcomeInput = {
  signal: SignalDir;
  entry: number;
  target: number | null;
  stop: number | null;
  high: number;
  low: number;
  close: number;
  policy: ExecutionPolicy;
  costs?: CostModel;
};

export type OutcomeResult = {
  result: "WIN" | "LOSS" | "FLAT" | "SKIP" | "AMBIGUOUS" | "INVALID_SETUP";
  exit: number;
  targetHit: boolean;
  stopHit: boolean;
  ambiguous: boolean;
  grossPnl: number;
  netPnl: number;
  pnlPct: number;
  costs: number;
};

/**
 * Deterministic outcome for a single simulated trade against a daily candle.
 * Rules:
 *   • signal === "WAIT" or missing target/stop → SKIP / INVALID_SETUP
 *   • gap through the target at open → WIN at open (favourable gap)
 *   • gap through the stop at open   → LOSS at open (adverse gap)
 *   • both target and stop touched intraday → policy-dependent
 *   • else exit at close → FLAT
 *
 * The policy default in the caller must remain "conservative" so historical
 * results with zero costs remain byte-identical to the previous engine.
 */
export function resolveOutcome(i: OutcomeInput): OutcomeResult {
  const costs = i.costs ?? ZERO_COSTS;
  const base = {
    ambiguous: false,
    targetHit: false,
    stopHit: false,
    grossPnl: 0,
    netPnl: 0,
    pnlPct: 0,
    costs: 0,
  };
  if (i.signal === "WAIT") return { ...base, result: "SKIP", exit: i.close };
  if (i.target == null || i.stop == null) {
    return { ...base, result: "INVALID_SETUP", exit: i.close };
  }

  const dir: 1 | -1 = i.signal === "BUY" ? 1 : -1;
  const targetHit = dir === 1 ? i.high >= i.target : i.low <= i.target;
  const stopHit   = dir === 1 ? i.low <= i.stop    : i.high >= i.stop;

  let exit = i.close;
  let result: OutcomeResult["result"] = "FLAT";
  let ambiguous = false;

  if (targetHit && stopHit) {
    ambiguous = true;
    if (i.policy === "conservative") { exit = i.stop; result = "LOSS"; }
    else if (i.policy === "optimistic") { exit = i.target; result = "WIN"; }
    else { exit = i.stop; result = "AMBIGUOUS"; }
  } else if (targetHit) {
    exit = i.target;
    result = "WIN";
  } else if (stopHit) {
    exit = i.stop;
    result = "LOSS";
  }

  const grossPnl = round2((exit - i.entry) * dir);
  const notional = Math.abs(i.entry) + Math.abs(exit);
  const slip = notional * (costs.slippagePct / 100);
  const brok = costs.brokerageFlat + notional * (costs.brokeragePct / 100);
  const tax = notional * (costs.taxesPct / 100);
  const totalCosts = round2(slip + brok + tax);
  const netPnl = round2(grossPnl - totalCosts);
  const pnlPct = round2(((exit - i.entry) / i.entry) * 100 * dir);

  return {
    result,
    exit: round2(exit),
    targetHit,
    stopHit,
    ambiguous,
    grossPnl,
    netPnl,
    pnlPct,
    costs: totalCosts,
  };
}

/* ------------------------ statistics ------------------------ */

export type TradeStat = { result: string; pnl: number; pnlPct: number };

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? round2((s[m - 1] + s[m]) / 2) : round2(s[m]);
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return round2(Math.sqrt(variance));
}

export type StatBundle = {
  sampleSize: number;
  sampleWarning: "INSUFFICIENT" | "LIMITED" | "MEANINGFUL";
  expectancy: number;
  median: number;
  stddev: number;
  sharpeLike: number;
  sortinoLike: number;
  payoffRatio: number;
  recoveryFactor: number;
  exposurePct: number;
};

export function sampleWarning(n: number): StatBundle["sampleWarning"] {
  if (n < 30) return "INSUFFICIENT";
  if (n < 100) return "LIMITED";
  return "MEANINGFUL";
}

/** Compute stat bundle from decided trades (WIN|LOSS|FLAT), total sessions, drawdown. */
export function buildStats(
  decided: TradeStat[],
  allTrades: number,
  netProfit: number,
  maxDrawdown: number,
): StatBundle {
  const pnls = decided.map((t) => t.pnl);
  const wins = decided.filter((t) => t.pnl > 0).map((t) => t.pnl);
  const losses = decided.filter((t) => t.pnl < 0).map((t) => Math.abs(t.pnl));
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const winRate = pnls.length ? wins.length / pnls.length : 0;
  const expectancy = round2(winRate * avgWin - (1 - winRate) * avgLoss);
  const sd = stddev(pnls);
  const meanPnl = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
  const downside = stddev(pnls.filter((p) => p < 0));
  const payoff = avgLoss > 0 ? round2(avgWin / avgLoss) : avgWin > 0 ? 999 : 0;
  const recovery = maxDrawdown > 0 ? round2(netProfit / maxDrawdown) : netProfit > 0 ? 999 : 0;
  return {
    sampleSize: pnls.length,
    sampleWarning: sampleWarning(pnls.length),
    expectancy,
    median: median(pnls),
    stddev: sd,
    sharpeLike: sd > 0 ? round2(meanPnl / sd) : 0,
    sortinoLike: downside > 0 ? round2(meanPnl / downside) : 0,
    payoffRatio: payoff,
    recoveryFactor: recovery,
    exposurePct: allTrades > 0 ? round2((pnls.length / allTrades) * 100) : 0,
  };
}

/* ------------------------ causality assertion ------------------------ */

/**
 * Runtime assertion that the inputs passed to the live signal engine were
 * available BEFORE the simulated entry moment. This is defensive belt-and-
 * suspenders — the engine already only passes prev-day close and 09:00 IST
 * astro state; this helper lets tests prove it.
 */
export function assertCausal(input: {
  signalTs: number;         // ms epoch when signal was produced
  entryTs: number;          // ms epoch of simulated entry
  exitTs: number;           // ms epoch of exit
  dataAvailableTs: number;  // ms epoch of most recent input datum used
}): { ok: true } | { ok: false; reason: string } {
  if (input.dataAvailableTs > input.signalTs) {
    return { ok: false, reason: "DATA_LEAKAGE_ERROR: input newer than signal" };
  }
  if (input.signalTs > input.entryTs) {
    return { ok: false, reason: "DATA_LEAKAGE_ERROR: signal after entry" };
  }
  if (input.entryTs > input.exitTs) {
    return { ok: false, reason: "DATA_LEAKAGE_ERROR: entry after exit" };
  }
  return { ok: true };
}