// Simple Moving Average — pure, deterministic, provider-neutral.

import type { IndicatorCandle, IndicatorDefinition, IndicatorResult } from "./types";
import { roundTo, isFiniteNumber } from "./types";

export const SMA_ID = "SMA";

export const smaDefinition: IndicatorDefinition = {
  id: SMA_ID,
  name: "Simple Moving Average",
  description: "Arithmetic mean of closing prices over a specified period.",
  params: [
    { key: "period", label: "Period", type: "int", default: 20, min: 1, max: 500 },
  ],
  outputs: [
    { key: "sma", label: "SMA", type: "line" },
  ],
  warmUpPeriod: (params) => params.period ?? 20,
  calculate: (candles, params) => calculateSma(candles, params),
};

export function calculateSma(
  candles: readonly IndicatorCandle[],
  params: Record<string, number>,
): IndicatorResult {
  const period = Math.max(1, Math.floor(params.period ?? 20));
  const points: IndicatorResult["points"] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      points.push({ time: candles[i].time, values: { sma: null } });
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    points.push({ time: candles[i].time, values: { sma: roundTo(sum / period, 4) } });
  }

  return {
    id: SMA_ID,
    params: { period },
    points,
    warmUpComplete: candles.length >= period,
    computedAt: Date.now(),
  };
}
