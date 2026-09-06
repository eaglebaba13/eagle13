// Exponential Moving Average — pure, deterministic, provider-neutral.
// Multiplier: 2 / (period + 1). Seed: SMA of first `period` values.

import type { IndicatorCandle, IndicatorDefinition, IndicatorResult } from "./types";
import { roundTo, isFiniteNumber } from "./types";

export const EMA_ID = "EMA";

export const emaDefinition: IndicatorDefinition = {
  id: EMA_ID,
  name: "Exponential Moving Average",
  description: "Weighted moving average giving more weight to recent prices.",
  params: [
    { key: "period", label: "Period", type: "int", default: 20, min: 1, max: 500 },
  ],
  outputs: [
    { key: "ema", label: "EMA", type: "line" },
  ],
  warmUpPeriod: (params) => params.period ?? 20,
  calculate: (candles, params) => calculateEma(candles, params),
};

export function calculateEma(
  candles: readonly IndicatorCandle[],
  params: Record<string, number>,
): IndicatorResult {
  const period = Math.max(1, Math.floor(params.period ?? 20));
  const multiplier = 2 / (period + 1);
  const points: IndicatorResult["points"] = [];
  let ema: number | null = null;
  let seedSum = 0;
  let seedCount = 0;

  for (let i = 0; i < candles.length; i++) {
    const close = candles[i].close;

    if (i < period - 1) {
      seedSum += close;
      seedCount++;
      points.push({ time: candles[i].time, values: { ema: null } });
      continue;
    }

    if (i === period - 1) {
      // Seed EMA with SMA of first `period` values
      seedSum += close;
      ema = seedSum / period;
      points.push({ time: candles[i].time, values: { ema: roundTo(ema, 4) } });
      continue;
    }

    // EMA = close * multiplier + prevEMA * (1 - multiplier)
    ema = close * multiplier + ema! * (1 - multiplier);
    points.push({ time: candles[i].time, values: { ema: roundTo(ema, 4) } });
  }

  return {
    id: EMA_ID,
    params: { period },
    points,
    warmUpComplete: candles.length >= period,
    computedAt: Date.now(),
  };
}
