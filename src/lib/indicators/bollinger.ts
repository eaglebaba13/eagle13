// Bollinger Bands — pure, deterministic, provider-neutral.
// Middle = SMA(period)
// Upper = Middle + (stdDev multiplier * standard deviation)
// Lower = Middle - (stdDev multiplier * standard deviation)

import type { IndicatorCandle, IndicatorDefinition, IndicatorResult } from "./types";
import { roundTo, isFiniteNumber } from "./types";

export const BOLLINGER_ID = "BOLLINGER";

export const bollingerDefinition: IndicatorDefinition = {
  id: BOLLINGER_ID,
  name: "Bollinger Bands",
  description: "Volatility bands placed above and below a moving average.",
  params: [
    { key: "period", label: "Period", type: "int", default: 20, min: 2, max: 200 },
    { key: "multiplier", label: "Std Dev Multiplier", type: "float", default: 2, min: 0.1, max: 5 },
  ],
  outputs: [
    { key: "upper", label: "Upper", type: "line" },
    { key: "middle", label: "Middle", type: "line" },
    { key: "lower", label: "Lower", type: "line" },
  ],
  warmUpPeriod: (params) => params.period ?? 20,
  calculate: (candles, params) => calculateBollinger(candles, params),
};

export function calculateBollinger(
  candles: readonly IndicatorCandle[],
  params: Record<string, number>,
): IndicatorResult {
  const period = Math.max(2, Math.floor(params.period ?? 20));
  const mult = params.multiplier ?? 2;
  const points: IndicatorResult["points"] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      points.push({ time: candles[i].time, values: { upper: null, middle: null, lower: null } });
      continue;
    }

    // SMA
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    const middle = sum / period;

    // Standard deviation (population)
    let sqDiffSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sqDiffSum += (candles[j].close - middle) ** 2;
    }
    const stdDev = Math.sqrt(sqDiffSum / period);

    points.push({
      time: candles[i].time,
      values: {
        upper: roundTo(middle + mult * stdDev, 4),
        middle: roundTo(middle, 4),
        lower: roundTo(middle - mult * stdDev, 4),
      },
    });
  }

  return {
    id: BOLLINGER_ID,
    params: { period, multiplier: mult },
    points,
    warmUpComplete: candles.length >= period,
    computedAt: Date.now(),
  };
}
