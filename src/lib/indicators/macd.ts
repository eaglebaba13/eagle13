// MACD — pure, deterministic, provider-neutral.
// MACD line = EMA(fast) - EMA(slow)
// Signal line = EMA(MACD line, signal period)
// Histogram = MACD - Signal

import type { IndicatorCandle, IndicatorDefinition, IndicatorResult } from "./types";
import { roundTo, isFiniteNumber } from "./types";

export const MACD_ID = "MACD";

export const macdDefinition: IndicatorDefinition = {
  id: MACD_ID,
  name: "MACD",
  description: "Moving Average Convergence Divergence. Trend-following momentum indicator.",
  params: [
    { key: "fast", label: "Fast Period", type: "int", default: 12, min: 1, max: 200 },
    { key: "slow", label: "Slow Period", type: "int", default: 26, min: 1, max: 200 },
    { key: "signal", label: "Signal Period", type: "int", default: 9, min: 1, max: 100 },
  ],
  outputs: [
    { key: "macd", label: "MACD", type: "line" },
    { key: "signal", label: "Signal", type: "line" },
    { key: "histogram", label: "Histogram", type: "histogram" },
  ],
  warmUpPeriod: (params) => {
    const slow = params.slow ?? 26;
    const signal = params.signal ?? 9;
    return slow + signal - 1;
  },
  calculate: (candles, params) => calculateMacd(candles, params),
};

function emaSeries(values: readonly number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  let ema: number | null = null;
  let seedSum = 0;

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      seedSum += values[i];
      result.push(null);
      continue;
    }
    if (i === period - 1) {
      seedSum += values[i];
      ema = seedSum / period;
      result.push(ema);
      continue;
    }
    ema = values[i] * multiplier + ema! * (1 - multiplier);
    result.push(ema);
  }
  return result;
}

export function calculateMacd(
  candles: readonly IndicatorCandle[],
  params: Record<string, number>,
): IndicatorResult {
  const fast = Math.max(1, Math.floor(params.fast ?? 12));
  const slow = Math.max(fast + 1, Math.floor(params.slow ?? 26));
  const signalPeriod = Math.max(1, Math.floor(params.signal ?? 9));
  const closes = candles.map((c) => c.close);

  // Compute fast and slow EMA series
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);

  // MACD line = fast EMA - slow EMA
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (fastEma[i] != null && slowEma[i] != null) {
      macdLine.push(fastEma[i]! - slowEma[i]!);
    } else {
      macdLine.push(null);
    }
  }

  // Signal line = EMA of MACD line
  const validMacd = macdLine.filter((v): v is number => v != null);
  const signalEma = emaSeries(validMacd, signalPeriod);

  // Map signal back to full array (only valid MACD values have signal)
  const signalLine: (number | null)[] = new Array(candles.length).fill(null);
  let validIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (macdLine[i] != null) {
      if (validIdx < signalEma.length) {
        signalLine[i] = signalEma[validIdx];
      }
      validIdx++;
    }
  }

  // Build points
  const points: IndicatorResult["points"] = [];
  for (let i = 0; i < candles.length; i++) {
    const m = macdLine[i] != null ? roundTo(macdLine[i]!, 4) : null;
    const s = signalLine[i] != null ? roundTo(signalLine[i]!, 4) : null;
    const h = m != null && s != null ? roundTo(m - s, 4) : null;
    points.push({ time: candles[i].time, values: { macd: m, signal: s, histogram: h } });
  }

  return {
    id: MACD_ID,
    params: { fast, slow, signal: signalPeriod },
    points,
    warmUpComplete: candles.length >= slow + signalPeriod - 1,
    computedAt: Date.now(),
  };
}
