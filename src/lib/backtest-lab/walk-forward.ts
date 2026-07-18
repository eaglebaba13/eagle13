// Phase 3G — Chronological walk-forward splits.
// No random shuffling. Leakage guard: validation bars must be strictly
// later than training bars.

import type { HistoricalCandle, StrategyDefinition, WalkForwardSummary, WalkForwardSplitSummary } from "./types";
import { simulate } from "./trade-engine";
import { computeMetrics } from "./performance";

export interface WalkForwardOptions {
  readonly mode: "EXPANDING" | "ROLLING";
  readonly splits: number;
  readonly trainRatio?: number; // 0..1, default 0.6
}

export function runWalkForward(
  def: StrategyDefinition,
  candles: readonly HistoricalCandle[],
  opts: WalkForwardOptions,
): WalkForwardSummary {
  const n = candles.length;
  const splits = Math.max(1, Math.min(20, opts.splits | 0));
  const trainRatio = opts.trainRatio ?? 0.6;
  const chunk = Math.floor(n / (splits + 1));
  const results: WalkForwardSplitSummary[] = [];
  const allValidationTrades: ReturnType<typeof simulate>["trades"] = [];
  let leakage = false;

  for (let s = 0; s < splits; s++) {
    const validationEnd = Math.min(n, chunk * (s + 2));
    const trainEnd = opts.mode === "EXPANDING"
      ? Math.floor(validationEnd * trainRatio)
      : Math.floor(chunk * (s + 1) * trainRatio) + chunk * s;
    const trainStart = opts.mode === "EXPANDING" ? 0 : Math.max(0, trainEnd - chunk);
    const validationStart = trainEnd;
    if (validationStart <= trainStart) { leakage = true; continue; }
    const validationCandles = candles.slice(validationStart, validationEnd);
    const trainCandles = candles.slice(trainStart, trainEnd);
    // Chronological leakage guard.
    const lastTrainTs = trainCandles.length ? Date.parse(trainCandles[trainCandles.length - 1].ts) : 0;
    const firstValTs = validationCandles.length ? Date.parse(validationCandles[0].ts) : 0;
    if (lastTrainTs > firstValTs) { leakage = true; continue; }

    const validation = simulate(def, validationCandles);
    allValidationTrades.push(...validation.trades);
    results.push({
      splitIndex: s,
      train: {
        from: trainCandles[0]?.ts ?? def.from,
        to: trainCandles[trainCandles.length - 1]?.ts ?? def.to,
        trades: 0,
      },
      validation: {
        from: validationCandles[0]?.ts ?? def.from,
        to: validationCandles[validationCandles.length - 1]?.ts ?? def.to,
        trades: validation.trades.length,
        metrics: computeMetrics(validation.trades, def.capital),
      },
    });
  }

  return {
    mode: opts.mode,
    splits: results,
    aggregate: computeMetrics(allValidationTrades, def.capital),
    leakageDetected: leakage,
  };
}