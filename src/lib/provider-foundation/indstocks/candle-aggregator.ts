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

export type AggregationIntervalMs =
  | 60_000
  | 180_000
  | 300_000
  | 900_000
  | 1_800_000
  | 3_600_000
  | 14_400_000
  | 86_400_000
  | 604_800_000;

export const SUPPORTED_INTERVALS: readonly AggregationIntervalMs[] = [
  60_000, // 1m
  180_000, // 3m
  300_000, // 5m
  900_000, // 15m
  1_800_000, // 30m
  3_600_000, // 1h
  14_400_000, // 4h
  86_400_000, // 1d
  604_800_000, // 1w
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
export function bucketTimestamp(epochMs: number, intervalMs: number, instrument?: string): number {
  const indiaSession = instrument != null && isIndianSessionInstrument(instrument);
  if (indiaSession) {
    const day = Math.floor((epochMs + 19_800_000) / 86_400_000) * 86_400_000 - 19_800_000;
    if (intervalMs === 86_400_000) return day;
    if (intervalMs === 604_800_000) {
      const weekday = new Date(day + 19_800_000).getUTCDay();
      return day - ((weekday + 6) % 7) * 86_400_000;
    }
    const open = day + (9 * 60 + 15) * 60_000;
    return open + Math.floor((epochMs - open) / intervalMs) * intervalMs;
  }
  return Math.floor(epochMs / intervalMs) * intervalMs;
}

export function isIndianSessionInstrument(instrument: string): boolean {
  return !/USDT|BTC|ETH|SOL|XRP|GC1!|SI1!|CL1!|NG1!|XAU|XAG|GOLD|SILVER/i.test(instrument);
}

/** Exclude midnight/EOD anchors from regular Indian intraday charts; daily/weekly and 24/7 assets retain their timestamps. */
export function isRegularSessionCandle(epochMs: number, intervalMs: number, instrument: string): boolean {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return false;
  if (intervalMs >= 86_400_000 || !isIndianSessionInstrument(instrument)) return true;
  const ist = new Date(epochMs + 19_800_000);
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minute >= 9 * 60 + 15 && minute < 15 * 60 + 30;
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

  const bucketMs = bucketTimestamp(tickMs, state.intervalMs, state.instrument);

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
      completed: [...state.completed, state.current].slice(-2000),
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

/** REST supplies the full bar open/range; an SSE connection may start halfway through it. */
export function stitchCandlePoints(
  historical: readonly MergedCandlePoint[],
  updates: readonly MergedCandlePoint[],
): MergedCandlePoint[] {
  const byTime = new Map<number, MergedCandlePoint>();
  for (const candle of [...historical, ...updates]) {
    if (!Number.isFinite(candle.x) || candle.x <= 0 ||
        !candle.y.every((n) => Number.isFinite(n) && n > 0) ||
        candle.y[1] < Math.max(candle.y[0], candle.y[3]) || candle.y[2] > Math.min(candle.y[0], candle.y[3])) continue;
    const existing = byTime.get(candle.x);
    byTime.set(candle.x, existing ? {
      x: candle.x,
      y: [existing.y[0], Math.max(existing.y[1], candle.y[1]), Math.min(existing.y[2], candle.y[2]), candle.y[3]],
      // Never add REST volume to an overlapping partial SSE volume.
      volume: existing.volume == null ? candle.volume : candle.volume == null ? existing.volume : Math.max(existing.volume, candle.volume),
    } : candle);
  }
  return [...byTime.values()].sort((a, b) => a.x - b.x);
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
