// Provider-neutral candle aggregation from MarketTick stream.
// Converts normalized ticks into OHLC candles using deterministic time bucketing.
// Supports multiple intervals. Designed for 1m+ aggregation.

import type { MarketTick } from "./indstocks-ws-types";

export interface LiveCandle {
  readonly bucketMs: number; // bucket start timestamp (epoch ms)
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null;
  readonly provider: string;
  readonly instrument: string;
  readonly openTimestamp: string; // ISO of first tick
  readonly lastTimestamp: string; // ISO of last tick
  readonly tickCount: number;
}

export type AggregationIntervalMs = 60_000 | 180_000 | 300_000 | 900_000 | 3_600_000 | 86_400_000;

export const SUPPORTED_INTERVALS: readonly AggregationIntervalMs[] = [
  60_000, // 1m
  180_000, // 3m
  300_000, // 5m
  900_000, // 15m
  3_600_000, // 1h
  86_400_000, // 1d
];

export interface CandleAggregatorState {
  readonly current: LiveCandle | null;
  readonly completed: readonly LiveCandle[];
  readonly instrument: string;
  readonly intervalMs: AggregationIntervalMs;
}

/**
 * Deterministic time bucket: floor(timestamp / intervalMs) * intervalMs
 */
export function bucketTimestamp(epochMs: number, intervalMs: AggregationIntervalMs): number {
  return Math.floor(epochMs / intervalMs) * intervalMs;
}

function createCandleFromTick(
  tick: MarketTick,
  bucketMs: number,
  intervalMs: AggregationIntervalMs,
): LiveCandle {
  const tickMs = Date.parse(tick.timestamp);
  return {
    bucketMs,
    open: tick.ltp,
    high: tick.ltp,
    low: tick.ltp,
    close: tick.ltp,
    volume: tick.volume,
    provider: tick.provider,
    instrument: tick.instrument,
    openTimestamp: tick.timestamp,
    lastTimestamp: tick.timestamp,
    tickCount: 1,
  };
}

function updateCandle(candle: LiveCandle, tick: MarketTick): LiveCandle {
  return {
    ...candle,
    high: Math.max(candle.high, tick.ltp),
    low: Math.min(candle.low, tick.ltp),
    close: tick.ltp,
    volume:
      candle.volume != null && tick.volume != null
        ? candle.volume + tick.volume
        : (candle.volume ?? tick.volume),
    lastTimestamp: tick.timestamp,
    tickCount: candle.tickCount + 1,
  };
}

/**
 * Process a single tick through the aggregator.
 * Returns the updated state. If a candle was completed, it's moved to `completed`.
 */
export function aggregateTick(
  state: CandleAggregatorState,
  tick: MarketTick,
): CandleAggregatorState {
  const tickMs = Date.parse(tick.timestamp);
  if (!Number.isFinite(tickMs)) return state; // invalid timestamp — skip

  const bucketMs = bucketTimestamp(tickMs, state.intervalMs);

  if (!state.current) {
    // First tick — create initial candle
    return {
      ...state,
      current: createCandleFromTick(tick, bucketMs, state.intervalMs),
    };
  }

  if (bucketMs === state.current.bucketMs) {
    // Same bucket — update current candle
    return {
      ...state,
      current: updateCandle(state.current, tick),
    };
  }

  if (bucketMs > state.current.bucketMs) {
    // New bucket — finalize current, start new
    return {
      ...state,
      current: createCandleFromTick(tick, bucketMs, state.intervalMs),
      completed: [...state.completed, state.current],
    };
  }

  // Out-of-order tick (bucket < current) — ignore to protect candle integrity
  return state;
}

/**
 * Create an empty aggregator state for a given instrument and interval.
 */
export function createAggregatorState(
  instrument: string,
  intervalMs: AggregationIntervalMs = 60_000,
): CandleAggregatorState {
  return {
    current: null,
    completed: [],
    instrument,
    intervalMs,
  };
}

/**
 * Merge historical candles (from REST) with live aggregated candles.
 * Historical candles use the existing HistoricalCandle format (ISO time).
 * Live candles use epoch ms bucketing.
 * Returns a unified array sorted by timestamp.
 * Volume is preserved for indicator calculations (e.g. VWAP).
 */
export interface MergedCandlePoint {
  readonly x: number;
  readonly y: readonly [number, number, number, number];
  readonly volume: number | null;
}

export function mergeHistoricalAndLive(
  historical: readonly {
    readonly time: string;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume: number | null;
  }[],
  completed: readonly LiveCandle[],
  current: LiveCandle | null,
): MergedCandlePoint[] {
  const all: MergedCandlePoint[] = [];

  for (const c of historical) {
    const ms = Date.parse(c.time);
    if (Number.isFinite(ms)) {
      all.push({ x: ms, y: [c.open, c.high, c.low, c.close], volume: c.volume });
    }
  }

  for (const c of completed) {
    all.push({ x: c.bucketMs, y: [c.open, c.high, c.low, c.close], volume: c.volume });
  }

  if (current) {
    all.push({
      x: current.bucketMs,
      y: [current.open, current.high, current.low, current.close],
      volume: current.volume,
    });
  }

  // Deduplicate by x (timestamp), last wins
  const byX = new Map<number, MergedCandlePoint>();
  for (const point of all) {
    byX.set(point.x, point);
  }

  return [...byX.values()].sort((a, b) => a.x - b.x);
}
