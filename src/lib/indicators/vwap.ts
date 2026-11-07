// VWAP — Volume-Weighted Average Price. Pure, deterministic, provider-neutral.
// Cumulative (typical_price × volume) / cumulative(volume).
// Typical price = (high + low + close) / 3.
// Resets on session boundary (new trading day in IST or Globex session for Gold).

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

export function istDateKey(epochMs: number): number {
  // IST = UTC + 5:30
  const istMs = epochMs + 5.5 * 60 * 60 * 1000;
  return Math.floor(istMs / 86_400_000);
}

export function goldSessionKey(epochMs: number): number {
  // COMEX Gold Globex session starts at 18:00 New York (UTC-5/UTC-4) = 03:30 or 04:30 IST
  // We use UTC+6.5 as the session day key partition
  const goldMs = epochMs + 6.5 * 60 * 60 * 1000;
  return Math.floor(goldMs / 86_400_000);
}

export interface VWAPPoint {
  readonly time: number;
  readonly typicalPrice: number;
  readonly volume: number;
  readonly cumulativeTPV: number;
  readonly cumulativeVolume: number;
  readonly vwap: number;
  readonly variance: number;
  readonly stdDev: number;
  readonly upperBand2SD: number;
  readonly lowerBand2SD: number;
}

export interface VWAPComputeOptions {
  readonly isGold?: boolean;
  readonly fallbackVolume?: number; // default 1 if volume is zero or null
}

/**
 * Computes institutional intraday VWAP with volume-weighted variance and 2.0 SD bands.
 * Used for dynamic support/resistance evaluation and mean-reversion target detection.
 */
export function computeIntradayVWAP(
  candles: readonly IndicatorCandle[],
  options: VWAPComputeOptions = {},
): readonly VWAPPoint[] {
  const points: VWAPPoint[] = [];
  let cumPV = 0;
  let cumV = 0;
  let cumPV2 = 0;
  let lastSessionKey: number | null = null;
  const isGold = options.isGold ?? false;
  const fallbackVol = options.fallbackVolume ?? 1;

  for (const candle of candles) {
    const sessionKey = isGold ? goldSessionKey(candle.time) : istDateKey(candle.time);

    // Reset on session boundary
    if (lastSessionKey !== null && sessionKey !== lastSessionKey) {
      cumPV = 0;
      cumV = 0;
      cumPV2 = 0;
    }
    lastSessionKey = sessionKey;

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const rawVol = candle.volume;
    const hasValidVol = isFiniteNumber(rawVol) && rawVol > 0;
    const vol = hasValidVol ? rawVol : (cumV > 0 ? 0 : fallbackVol);

    if (vol > 0) {
      cumPV += typicalPrice * vol;
      cumV += vol;
      cumPV2 += typicalPrice * typicalPrice * vol;
    }

    const vwap = cumV > 0 ? cumPV / cumV : typicalPrice;
    const meanOfSquares = cumV > 0 ? cumPV2 / cumV : typicalPrice * typicalPrice;
    const variance = Math.max(0, meanOfSquares - vwap * vwap);
    const stdDev = Math.sqrt(variance);

    points.push({
      time: candle.time,
      typicalPrice: roundTo(typicalPrice, 4),
      volume: hasValidVol ? rawVol : 0,
      cumulativeTPV: roundTo(cumPV, 4),
      cumulativeVolume: roundTo(cumV, 4),
      vwap: roundTo(vwap, 4),
      variance: roundTo(variance, 6),
      stdDev: roundTo(stdDev, 4),
      upperBand2SD: roundTo(vwap + 2 * stdDev, 4),
      lowerBand2SD: roundTo(vwap - 2 * stdDev, 4),
    });
  }

  return points;
}

export function calculateVwap(
  candles: readonly IndicatorCandle[],
  _params: Record<string, number>,
): IndicatorResult {
  // Private builder; the returned IndicatorResult and its points remain readonly.
  const points: Array<IndicatorResult["points"][number]> = [];
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
