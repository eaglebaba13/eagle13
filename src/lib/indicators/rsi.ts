// Relative Strength Index — pure, deterministic, provider-neutral.
// Wilder's smoothing method. Range: 0–100.
// Returns null for warm-up period (need `period + 1` candles for first RSI).

import type { IndicatorCandle, IndicatorDefinition, IndicatorResult } from "./types";
import { roundTo, isFiniteNumber } from "./types";

export const RSI_ID = "RSI";

export const rsiDefinition: IndicatorDefinition = {
  id: RSI_ID,
  name: "Relative Strength Index",
  description: "Momentum oscillator measuring speed and magnitude of price changes. Range 0-100.",
  params: [
    { key: "period", label: "Period", type: "int", default: 14, min: 1, max: 200 },
  ],
  outputs: [
    { key: "rsi", label: "RSI", type: "line" },
  ],
  warmUpPeriod: (params) => (params.period ?? 14) + 1,
  calculate: (candles, params) => calculateRsi(candles, params),
};

export function calculateRsi(
  candles: readonly IndicatorCandle[],
  params: Record<string, number>,
): IndicatorResult {
  const period = Math.max(1, Math.floor(params.period ?? 14));
  const points: IndicatorResult["points"] = [];

  if (candles.length < period + 1) {
    // Not enough data for even one RSI value
    for (const c of candles) {
      points.push({ time: c.time, values: { rsi: null } });
    }
    return {
      id: RSI_ID,
      params: { period },
      points,
      warmUpComplete: false,
      computedAt: Date.now(),
    };
  }

  // Initial average gain/loss from first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss -= change; // make positive
  }
  avgGain /= period;
  avgLoss /= period;

  // Warm-up candles get null
  for (let i = 0; i < period; i++) {
    points.push({ time: candles[i].time, values: { rsi: null } });
  }

  // First RSI at index `period`
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0);
  points.push({ time: candles[period].time, values: { rsi: roundTo(rsi0, 4) } });

  // Subsequent RSI values using Wilder's smoothing
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    points.push({ time: candles[i].time, values: { rsi: roundTo(rsi, 4) } });
  }

  return {
    id: RSI_ID,
    params: { period },
    points,
    warmUpComplete: candles.length >= period + 1,
    computedAt: Date.now(),
  };
}
