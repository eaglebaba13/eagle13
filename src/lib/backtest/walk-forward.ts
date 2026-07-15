// Phase 21.5 · Stage 1 — Walk-forward + out-of-sample orchestrator.
// Pure. Owns no market math. Splits a date range into training/validation
// windows and delegates each run to a caller-provided runner. Never mutates
// existing formula adapters, engines, exports, or run-ids.

import type { HistoricalBacktestResult, HistoricalTrade } from "./result";

export type SplitMode =
  | "70_30"
  | "60_40"
  | "80_20"
  | "ROLLING"
  | "EXPANDING";

export type WalkForwardWindow = {
  index: number;
  training: { from: string; to: string };
  validation: { from: string; to: string };
};

export type WalkForwardConfig = {
  from: string;
  to: string;
  mode: SplitMode;
  /** Rolling/expanding window size in days. Ignored for fixed 70/30 modes. */
  windowDays?: number;
  /** Step between rolling/expanding windows in days. */
  stepDays?: number;
};

// ---------------------------------------------------------------------------
// Date helpers (UTC-day arithmetic — timezone-agnostic).

function parseDay(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) throw new Error(`Invalid date: ${iso}`);
  return t;
}
function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  return isoOf(parseDay(iso) + days * 86400_000);
}
function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / 86400_000) + 1;
}

// ---------------------------------------------------------------------------
// Split planners.

function fixedSplit(cfg: WalkForwardConfig, trainPct: number): WalkForwardWindow[] {
  const total = daysBetween(cfg.from, cfg.to);
  if (total < 2) return [];
  const trainDays = Math.max(1, Math.floor(total * trainPct));
  if (trainDays >= total) return [];
  const trainTo = addDays(cfg.from, trainDays - 1);
  const valFrom = addDays(cfg.from, trainDays);
  return [
    {
      index: 0,
      training: { from: cfg.from, to: trainTo },
      validation: { from: valFrom, to: cfg.to },
    },
  ];
}

function rollingSplit(cfg: WalkForwardConfig): WalkForwardWindow[] {
  const total = daysBetween(cfg.from, cfg.to);
  const win = Math.max(2, cfg.windowDays ?? Math.max(10, Math.floor(total * 0.4)));
  const step = Math.max(1, cfg.stepDays ?? Math.max(1, Math.floor(win * 0.5)));
  const valPart = Math.max(1, Math.floor(win * 0.3));
  const trainPart = win - valPart;
  if (trainPart < 1 || total < win) return [];
  const out: WalkForwardWindow[] = [];
  let start = parseDay(cfg.from);
  const end = parseDay(cfg.to);
  let idx = 0;
  while (start + (win - 1) * 86400_000 <= end) {
    const trainFrom = isoOf(start);
    const trainTo = isoOf(start + (trainPart - 1) * 86400_000);
    const valFrom = isoOf(start + trainPart * 86400_000);
    const valTo = isoOf(start + (win - 1) * 86400_000);
    out.push({
      index: idx++,
      training: { from: trainFrom, to: trainTo },
      validation: { from: valFrom, to: valTo },
    });
    start += step * 86400_000;
  }
  return out;
}

function expandingSplit(cfg: WalkForwardConfig): WalkForwardWindow[] {
  const total = daysBetween(cfg.from, cfg.to);
  const seed = Math.max(2, cfg.windowDays ?? Math.max(10, Math.floor(total * 0.3)));
  const step = Math.max(1, cfg.stepDays ?? Math.max(1, Math.floor(seed * 0.3)));
  const valDays = Math.max(1, step);
  if (total < seed + valDays) return [];
  const out: WalkForwardWindow[] = [];
  let trainDays = seed;
  let idx = 0;
  while (trainDays + valDays <= total) {
    const trainFrom = cfg.from;
    const trainTo = addDays(cfg.from, trainDays - 1);
    const valFrom = addDays(cfg.from, trainDays);
    const valTo = addDays(cfg.from, trainDays + valDays - 1);
    out.push({
      index: idx++,
      training: { from: trainFrom, to: trainTo },
      validation: { from: valFrom, to: valTo },
    });
    trainDays += step;
  }
  return out;
}

export function planWalkForwardWindows(cfg: WalkForwardConfig): WalkForwardWindow[] {
  switch (cfg.mode) {
    case "70_30":
      return fixedSplit(cfg, 0.7);
    case "60_40":
      return fixedSplit(cfg, 0.6);
    case "80_20":
      return fixedSplit(cfg, 0.8);
    case "ROLLING":
      return rollingSplit(cfg);
    case "EXPANDING":
      return expandingSplit(cfg);
  }
}

/** Assert no leakage: validation.from > training.to for every window. */
export function assertNoLeakage(windows: readonly WalkForwardWindow[]): void {
  for (const w of windows) {
    if (parseDay(w.validation.from) <= parseDay(w.training.to)) {
      throw new Error(
        `Walk-forward leakage: window ${w.index} validation.from ${w.validation.from} <= training.to ${w.training.to}`,
      );
    }
    if (parseDay(w.training.from) > parseDay(w.training.to)) {
      throw new Error(`Walk-forward invalid training window ${w.index}`);
    }
    if (parseDay(w.validation.from) > parseDay(w.validation.to)) {
      throw new Error(`Walk-forward invalid validation window ${w.index}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Out-of-sample metrics + degradation.

export type WindowMetrics = {
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  profitFactor: number;
  netPnl: number;
  expectancy: number;
  drawdown: number;
  drawdownPct: number;
  avgTrade: number;
  returnPct: number;
  recovery: number;
  longCount: number;
  shortCount: number;
};

function round(n: number, p = 2): number {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

export function computeWindowMetrics(
  result: HistoricalBacktestResult,
): WindowMetrics {
  const trades = result.trades;
  let wins = 0;
  let losses = 0;
  let netPnl = 0;
  let grossGain = 0;
  let grossLoss = 0;
  let longCount = 0;
  let shortCount = 0;
  for (const t of trades) {
    netPnl += t.pnl;
    if (t.outcome === "WIN") wins += 1;
    else if (t.outcome === "LOSS") losses += 1;
    if (t.pnl > 0) grossGain += t.pnl;
    else if (t.pnl < 0) grossLoss += -t.pnl;
    if (t.side === "BUY") longCount += 1;
    else if (t.side === "SELL") shortCount += 1;
  }
  const n = trades.length;
  const winRate = n > 0 ? (wins / n) * 100 : 0;
  const profitFactor =
    grossLoss > 0 ? grossGain / grossLoss : grossGain > 0 ? Infinity : 0;
  const expectancy = n > 0 ? netPnl / n : 0;
  const avgTrade = expectancy;
  const drawdown = result.drawdown?.max ?? 0;
  const drawdownPct = result.drawdown?.maxPct ?? 0;
  const recovery = drawdown > 0 ? netPnl / drawdown : netPnl > 0 ? Infinity : 0;
  return {
    tradeCount: n,
    winCount: wins,
    lossCount: losses,
    winRate: round(winRate),
    profitFactor: Number.isFinite(profitFactor) ? round(profitFactor) : Infinity,
    netPnl: round(netPnl),
    expectancy: round(expectancy),
    drawdown: round(drawdown),
    drawdownPct: round(drawdownPct),
    avgTrade: round(avgTrade),
    returnPct: round(netPnl), // returnPct proxied to netPnl until an equity base is passed in
    recovery: Number.isFinite(recovery) ? round(recovery) : Infinity,
    longCount,
    shortCount,
  };
}

export type DegradationReport = {
  winRate: number;
  profitFactor: number;
  expectancy: number;
  netPnl: number;
  drawdown: number;
  recovery: number;
  avgTrade: number;
  tradeCount: number;
};

function pctDelta(base: number, next: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(next)) return 0;
  if (base === 0) return next === 0 ? 0 : next > 0 ? Infinity : -Infinity;
  return round(((next - base) / Math.abs(base)) * 100);
}

export function computeDegradation(
  training: WindowMetrics,
  validation: WindowMetrics,
): DegradationReport {
  return {
    winRate: pctDelta(training.winRate, validation.winRate),
    profitFactor: pctDelta(training.profitFactor, validation.profitFactor),
    expectancy: pctDelta(training.expectancy, validation.expectancy),
    netPnl: pctDelta(training.netPnl, validation.netPnl),
    drawdown: pctDelta(training.drawdown, validation.drawdown),
    recovery: pctDelta(training.recovery, validation.recovery),
    avgTrade: pctDelta(training.avgTrade, validation.avgTrade),
    tradeCount: pctDelta(training.tradeCount, validation.tradeCount),
  };
}

// ---------------------------------------------------------------------------
// Orchestrator.

export type WalkForwardRunner = (
  window: { from: string; to: string },
  phase: "training" | "validation",
  windowIndex: number,
) => Promise<HistoricalBacktestResult>;

export type WalkForwardWindowResult = {
  window: WalkForwardWindow;
  training: HistoricalBacktestResult;
  validation: HistoricalBacktestResult;
  trainingMetrics: WindowMetrics;
  validationMetrics: WindowMetrics;
  degradation: DegradationReport;
};

export type WalkForwardResult = {
  config: WalkForwardConfig;
  windows: readonly WalkForwardWindowResult[];
};

export async function runWalkForward(
  cfg: WalkForwardConfig,
  run: WalkForwardRunner,
): Promise<WalkForwardResult> {
  const windows = planWalkForwardWindows(cfg);
  assertNoLeakage(windows);
  const results: WalkForwardWindowResult[] = [];
  for (const w of windows) {
    const training = await run(w.training, "training", w.index);
    const validation = await run(w.validation, "validation", w.index);
    const tm = computeWindowMetrics(training);
    const vm = computeWindowMetrics(validation);
    results.push({
      window: w,
      training,
      validation,
      trainingMetrics: tm,
      validationMetrics: vm,
      degradation: computeDegradation(tm, vm),
    });
  }
  return { config: cfg, windows: results };
}

// ---------------------------------------------------------------------------
// Utility — flatten every trade across every window for downstream analytics.
export function flattenValidationTrades(
  result: WalkForwardResult,
): readonly HistoricalTrade[] {
  return result.windows.flatMap((w) => [...w.validation.trades]);
}