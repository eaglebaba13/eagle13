// Phase 21.2 · Stage 4 — deterministic level-touch detection.
//
// Pure. Given ranked Astro levels + an ordered array of 5-minute candles for
// the current session, produce the first-touch metadata per level. Spec §2.
//
// Touch rule (§2 + §5):
//   A candle "touches" a level when the level value falls within the candle's
//   [low, high] range, extended by policy.maximumEntryDeviation on either
//   side. Anything outside that tolerance band is a near-miss and NOT a
//   touch.

import type { RankedLevel } from "./gann-level-ranking";
import {
  getInstrumentPolicy,
  type InstrumentSymbol,
} from "./gann-intraday-policy";

export type TimedCandle5m = {
  /** ISO-8601 IST timestamp of the candle open, e.g. 2026-07-15T09:15:00+05:30. */
  timeIst: string;
  /** Epoch millis of the candle open. */
  openTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type LevelTouch = {
  level: RankedLevel;
  /** Index into the candle array where the first touch occurred; null = never. */
  firstTouchIndex: number | null;
  firstTouchTimeIst: string | null;
  /** Distance from level value to nearest candle bound (0 when inside). */
  distanceAtTouch: number | null;
  /** True when the candle's raw [low,high] contained the level (not near-miss). */
  containedTouch: boolean;
};

function candleTouches(
  c: TimedCandle5m,
  value: number,
  tolerance: number,
): { touched: boolean; contained: boolean; distance: number } {
  const contained = c.low <= value && value <= c.high;
  if (contained) return { touched: true, contained: true, distance: 0 };
  const distance = value > c.high ? value - c.high : c.low - value;
  return {
    touched: distance <= tolerance,
    contained: false,
    distance,
  };
}

/** Deterministic first-touch resolution for every ranked level. */
export function detectTouches(
  instrument: InstrumentSymbol,
  levels: RankedLevel[],
  candles: TimedCandle5m[],
): LevelTouch[] {
  const policy = getInstrumentPolicy(instrument);
  const tol = policy.maximumEntryDeviation;
  return levels.map((level) => {
    for (let i = 0; i < candles.length; i++) {
      const t = candleTouches(candles[i], level.value, tol);
      if (t.touched) {
        return {
          level,
          firstTouchIndex: i,
          firstTouchTimeIst: candles[i].timeIst,
          distanceAtTouch: t.distance,
          containedTouch: t.contained,
        };
      }
    }
    return {
      level,
      firstTouchIndex: null,
      firstTouchTimeIst: null,
      distanceAtTouch: null,
      containedTouch: false,
    };
  });
}