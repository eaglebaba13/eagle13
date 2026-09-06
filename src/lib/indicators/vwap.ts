// VWAP — Volume-Weighted Average Price. Pure, deterministic, provider-neutral.
// Cumulative (typical_price × volume) / cumulative(volume).
// Typical price = (high + low + close) / 3.
// Resets on session boundary (new trading day in IST).

import type { IndicatorCandle, IndicatorDefinition, IndicatorResult } from "./types";
import { roundTo, isFiniteNumber } from "./types";

export const VWAP_ID = "VWAP";

export const vwapDefinition: IndicatorDefinition = {
  id: VWAP_ID,
  name: "Volume Weighted Average Price",
  description: "Cumulative VWAP using typical price. Resets on session boundary.",
  params: [],
  outputs: [{ key: "vwap", label: "VWAP", type: "line" }],
  warmUpPeriod: () => 1,
  calculate: (candles, params) => calculateVwap(candles, params),
};

function istDateKey(epochMs: number): number {
  // IST = UTC + 5:30
  const istMs = epochMs + 5.5 * 60 * 60 * 1000;
  return Math.floor(istMs / 86_400_000);
}

export function calculateVwap(
  candles: readonly IndicatorCandle[],
  _params: Record<string, number>,
): IndicatorResult {
  const points: IndicatorResult["points"] = [];
  let cumPV = 0;
  let cumV = 0;
  let lastDayKey: number | null = null;

  for (const candle of candles) {
    const dayKey = istDateKey(candle.time);

    // Reset on new session
    if (lastDayKey !== null && dayKey !== lastDayKey) {
      cumPV = 0;
      cumV = 0;
    }
    lastDayKey = dayKey;

    const vol = candle.volume;
    if (!isFiniteNumber(vol) || vol <= 0) {
      // No volume — cannot compute VWAP, carry forward or null
      points.push({
        time: candle.time,
        values: { vwap: cumV > 0 ? roundTo(cumPV / cumV, 4) : null },
      });
      continue;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumPV += typicalPrice * vol;
    cumV += vol;

    points.push({ time: candle.time, values: { vwap: roundTo(cumPV / cumV, 4) } });
  }

  return {
    id: VWAP_ID,
    params: {},
    points,
    warmUpComplete: candles.length >= 1,
    computedAt: Date.now(),
  };
}
