import { describe, expect, it } from "vitest";
import {
  aggregateTick,
  createAggregatorState,
  bucketTimestamp,
  mergeHistoricalAndLive,
  type CandleAggregatorState,
  type LiveCandle,
} from "./candle-aggregator";
import type { MarketTick } from "./indstocks-ws-types";

function tick(overrides: Partial<MarketTick> = {}): MarketTick {
  return {
    instrument: "NIFTY50",
    provider: "INDSTOCKS_V1",
    timestamp: new Date().toISOString(),
    ltp: 25000,
    bid: null,
    ask: null,
    volume: 100,
    source: "LTP",
    freshness: "LIVE",
    quality: "OK",
    ...overrides,
  };
}

describe("candle-aggregator bucketTimestamp", () => {
  it("buckets 1m correctly", () => {
    // 1725000000000 ms = exact minute boundary
    expect(bucketTimestamp(1725000000000, 60_000)).toBe(1725000000000);
    expect(bucketTimestamp(1725000030000, 60_000)).toBe(1725000000000);
    expect(bucketTimestamp(1725000059999, 60_000)).toBe(1725000000000);
  });

  it("buckets 5m correctly", () => {
    expect(bucketTimestamp(1725000000000, 300_000)).toBe(1725000000000);
    expect(bucketTimestamp(1725000100000, 300_000)).toBe(1725000000000);
  });

  it("buckets 1h correctly", () => {
    // 1724997600000 is exactly on an hour boundary (divisible by 3,600,000)
    expect(bucketTimestamp(1724997600000, 3_600_000)).toBe(1724997600000);
    expect(bucketTimestamp(1724997600000 + 1800000, 3_600_000)).toBe(1724997600000);
  });
});

describe("candle-aggregator aggregateTick", () => {
  it("first tick creates candle", () => {
    const state = createAggregatorState("NIFTY50", 60_000);
    const t = tick({ ltp: 25000, timestamp: "2024-08-30T09:15:00.000Z" });
    const result = aggregateTick(state, t);
    expect(result.current).not.toBeNull();
    expect(result.current!.open).toBe(25000);
    expect(result.current!.high).toBe(25000);
    expect(result.current!.low).toBe(25000);
    expect(result.current!.close).toBe(25000);
    expect(result.current!.tickCount).toBe(1);
    expect(result.completed).toHaveLength(0);
  });

  it("second tick in same interval updates candle", () => {
    let state = createAggregatorState("NIFTY50", 60_000);
    state = aggregateTick(state, tick({ ltp: 25000, timestamp: "2024-08-30T09:15:00.000Z" }));
    state = aggregateTick(state, tick({ ltp: 25100, timestamp: "2024-08-30T09:15:30.000Z" }));
    expect(state.current!.high).toBe(25100);
    expect(state.current!.close).toBe(25100);
    expect(state.current!.tickCount).toBe(2);
  });

  it("high updates correctly", () => {
    let state = createAggregatorState("NIFTY50", 60_000);
    state = aggregateTick(state, tick({ ltp: 25000, timestamp: "2024-08-30T09:15:00.000Z" }));
    state = aggregateTick(state, tick({ ltp: 24900, timestamp: "2024-08-30T09:15:10.000Z" }));
    state = aggregateTick(state, tick({ ltp: 25200, timestamp: "2024-08-30T09:15:20.000Z" }));
    expect(state.current!.high).toBe(25200);
    expect(state.current!.low).toBe(24900);
  });

  it("low updates correctly", () => {
    let state = createAggregatorState("NIFTY50", 60_000);
    state = aggregateTick(state, tick({ ltp: 25000, timestamp: "2024-08-30T09:15:00.000Z" }));
    state = aggregateTick(state, tick({ ltp: 24800, timestamp: "2024-08-30T09:15:10.000Z" }));
    expect(state.current!.low).toBe(24800);
  });

  it("new interval finalizes previous candle and creates new", () => {
    let state = createAggregatorState("NIFTY50", 60_000);
    state = aggregateTick(state, tick({ ltp: 25000, timestamp: "2024-08-30T09:15:00.000Z" }));
    state = aggregateTick(state, tick({ ltp: 25100, timestamp: "2024-08-30T09:16:00.000Z" }));
    expect(state.completed).toHaveLength(1);
    expect(state.completed[0].close).toBe(25000);
    expect(state.current!.open).toBe(25100);
    expect(state.current!.tickCount).toBe(1);
  });

  it("out-of-order ticks are ignored", () => {
    let state = createAggregatorState("NIFTY50", 60_000);
    state = aggregateTick(state, tick({ ltp: 25100, timestamp: "2024-08-30T09:16:00.000Z" }));
    state = aggregateTick(state, tick({ ltp: 25000, timestamp: "2024-08-30T09:15:00.000Z" })); // earlier bucket
    expect(state.current!.open).toBe(25100); // not overwritten
    expect(state.completed).toHaveLength(0);
  });

  it("duplicate ticks do not create duplicate candles", () => {
    let state = createAggregatorState("NIFTY50", 60_000);
    state = aggregateTick(state, tick({ ltp: 25000, timestamp: "2024-08-30T09:15:00.000Z" }));
    state = aggregateTick(state, tick({ ltp: 25000, timestamp: "2024-08-30T09:15:00.000Z" }));
    expect(state.completed).toHaveLength(0);
    expect(state.current!.tickCount).toBe(2);
  });

  it("null volume does not produce fabricated volume", () => {
    const state = createAggregatorState("NIFTY50", 60_000);
    const result = aggregateTick(state, tick({ ltp: 25000, volume: null, timestamp: "2024-08-30T09:15:00.000Z" }));
    expect(result.current!.volume).toBeNull();
  });

  it("invalid timestamp tick is skipped", () => {
    const state = createAggregatorState("NIFTY50", 60_000);
    const result = aggregateTick(state, tick({ ltp: 25000, timestamp: "invalid" }));
    expect(result.current).toBeNull();
  });
});

describe("candle-aggregator mergeHistoricalAndLive", () => {
  it("merges historical and live candles sorted by timestamp", () => {
    const historical = [
      { time: "2024-08-30T09:10:00.000Z", open: 24900, high: 24950, low: 24850, close: 24920, volume: 1000 },
      { time: "2024-08-30T09:11:00.000Z", open: 24920, high: 25000, low: 24900, close: 24980, volume: 1200 },
    ];
    const completed: LiveCandle[] = [{
      bucketMs: Date.parse("2024-08-30T09:12:00.000Z"),
      open: 24980, high: 25100, low: 24950, close: 25050, volume: 800,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:12:00.000Z", lastTimestamp: "2024-08-30T09:12:50.000Z", tickCount: 10,
    }];
    const current: LiveCandle = {
      bucketMs: Date.parse("2024-08-30T09:13:00.000Z"),
      open: 25050, high: 25080, low: 25020, close: 25060, volume: 500,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:13:00.000Z", lastTimestamp: "2024-08-30T09:13:30.000Z", tickCount: 5,
    };

    const result = mergeHistoricalAndLive(historical, completed, current);
    expect(result).toHaveLength(4);
    // Verify sorted ascending
    for (let i = 1; i < result.length; i++) {
      expect(result[i].x).toBeGreaterThan(result[i - 1].x);
    }
  });

  it("deduplicates by timestamp (last wins)", () => {
    const historical = [
      { time: "2024-08-30T09:10:00.000Z", open: 24900, high: 24950, low: 24850, close: 24920, volume: 1000 },
    ];
    const completed: LiveCandle[] = [{
      bucketMs: Date.parse("2024-08-30T09:10:00.000Z"), // same timestamp
      open: 25000, high: 25100, low: 24900, close: 25050, volume: 800,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:10:00.000Z", lastTimestamp: "2024-08-30T09:10:50.000Z", tickCount: 10,
    }];
    const result = mergeHistoricalAndLive(historical, completed, null);
    expect(result).toHaveLength(1);
    // Live candle should overwrite historical
    expect(result[0].y[0]).toBe(25000); // open from live
  });

  it("no overlap returns all candles", () => {
    const historical = [
      { time: "2024-08-30T09:08:00.000Z", open: 24800, high: 24850, low: 24750, close: 24820, volume: 900 },
      { time: "2024-08-30T09:09:00.000Z", open: 24820, high: 24900, low: 24800, close: 24880, volume: 1100 },
    ];
    const completed: LiveCandle[] = [{
      bucketMs: Date.parse("2024-08-30T09:10:00.000Z"),
      open: 24880, high: 24950, low: 24850, close: 24920, volume: 700,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:10:00.000Z", lastTimestamp: "2024-08-30T09:10:50.000Z", tickCount: 8,
    }];
    const result = mergeHistoricalAndLive(historical, completed, null);
    expect(result).toHaveLength(3);
  });

  it("multiple overlapping candles — live wins", () => {
    const historical = [
      { time: "2024-08-30T09:09:00.000Z", open: 24800, high: 24850, low: 24750, close: 24820, volume: 900 },
      { time: "2024-08-30T09:10:00.000Z", open: 24820, high: 24900, low: 24800, close: 24880, volume: 1100 },
    ];
    const completed: LiveCandle[] = [
      {
        bucketMs: Date.parse("2024-08-30T09:09:00.000Z"), // overlap
        open: 24810, high: 24860, low: 24760, close: 24830, volume: 950,
        provider: "INDSTOCKS_V1", instrument: "NIFTY50",
        openTimestamp: "2024-08-30T09:09:00.000Z", lastTimestamp: "2024-08-30T09:09:50.000Z", tickCount: 12,
      },
      {
        bucketMs: Date.parse("2024-08-30T09:10:00.000Z"), // overlap
        open: 24830, high: 24910, low: 24810, close: 24890, volume: 1150,
        provider: "INDSTOCKS_V1", instrument: "NIFTY50",
        openTimestamp: "2024-08-30T09:10:00.000Z", lastTimestamp: "2024-08-30T09:10:50.000Z", tickCount: 15,
      },
    ];
    const result = mergeHistoricalAndLive(historical, completed, null);
    expect(result).toHaveLength(2);
    // Live values should overwrite historical
    expect(result[0].y[0]).toBe(24810); // open from live 09:09
    expect(result[1].y[0]).toBe(24830); // open from live 09:10
  });

  it("live-only returns live candles", () => {
    const completed: LiveCandle[] = [{
      bucketMs: Date.parse("2024-08-30T09:10:00.000Z"),
      open: 25000, high: 25100, low: 24900, close: 25050, volume: 800,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:10:00.000Z", lastTimestamp: "2024-08-30T09:10:50.000Z", tickCount: 10,
    }];
    const result = mergeHistoricalAndLive([], completed, null);
    expect(result).toHaveLength(1);
    expect(result[0].y[0]).toBe(25000);
  });

  it("historical-only returns historical candles", () => {
    const historical = [
      { time: "2024-08-30T09:10:00.000Z", open: 24900, high: 24950, low: 24850, close: 24920, volume: 1000 },
    ];
    const result = mergeHistoricalAndLive(historical, [], null);
    expect(result).toHaveLength(1);
    expect(result[0].y[0]).toBe(24900);
  });

  it("empty historical and empty live returns empty", () => {
    const result = mergeHistoricalAndLive([], [], null);
    expect(result).toHaveLength(0);
  });

  it("current candle replaces overlapping historical", () => {
    const historical = [
      { time: "2024-08-30T09:10:00.000Z", open: 24900, high: 24950, low: 24850, close: 24920, volume: 1000 },
    ];
    const current: LiveCandle = {
      bucketMs: Date.parse("2024-08-30T09:10:00.000Z"), // same timestamp
      open: 25000, high: 25100, low: 24900, close: 25080, volume: 1200,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:10:00.000Z", lastTimestamp: "2024-08-30T09:10:45.000Z", tickCount: 20,
    };
    const result = mergeHistoricalAndLive(historical, [], current);
    expect(result).toHaveLength(1);
    expect(result[0].y[0]).toBe(25000); // current overwrites historical
    expect(result[0].y[3]).toBe(25080); // close from current
  });

  it("chronological ordering with interleaved timestamps", () => {
    const historical = [
      { time: "2024-08-30T09:12:00.000Z", open: 25200, high: 25250, low: 25150, close: 25220, volume: 600 },
      { time: "2024-08-30T09:08:00.000Z", open: 24800, high: 24850, low: 24750, close: 24820, volume: 900 },
    ];
    const completed: LiveCandle[] = [{
      bucketMs: Date.parse("2024-08-30T09:10:00.000Z"),
      open: 25000, high: 25100, low: 24900, close: 25050, volume: 800,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:10:00.000Z", lastTimestamp: "2024-08-30T09:10:50.000Z", tickCount: 10,
    }];
    const result = mergeHistoricalAndLive(historical, completed, null);
    expect(result).toHaveLength(3);
    expect(result[0].x).toBeLessThan(result[1].x);
    expect(result[1].x).toBeLessThan(result[2].x);
  });

  it("preserves historical volume", () => {
    const historical = [
      { time: "2024-08-30T09:10:00.000Z", open: 24900, high: 24950, low: 24850, close: 24920, volume: 1500 },
    ];
    const result = mergeHistoricalAndLive(historical, [], null);
    expect(result).toHaveLength(1);
    expect(result[0].volume).toBe(1500);
  });

  it("preserves live completed candle volume", () => {
    const completed: LiveCandle[] = [{
      bucketMs: Date.parse("2024-08-30T09:12:00.000Z"),
      open: 25000, high: 25100, low: 24900, close: 25050, volume: 2200,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:12:00.000Z", lastTimestamp: "2024-08-30T09:12:50.000Z", tickCount: 10,
    }];
    const result = mergeHistoricalAndLive([], completed, null);
    expect(result[0].volume).toBe(2200);
  });

  it("preserves current candle volume", () => {
    const current: LiveCandle = {
      bucketMs: Date.parse("2024-08-30T09:13:00.000Z"),
      open: 25050, high: 25080, low: 25020, close: 25060, volume: 500,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:13:00.000Z", lastTimestamp: "2024-08-30T09:13:30.000Z", tickCount: 5,
    };
    const result = mergeHistoricalAndLive([], [], current);
    expect(result[0].volume).toBe(500);
  });

  it("preserves null volume from historical", () => {
    const historical = [
      { time: "2024-08-30T09:10:00.000Z", open: 24900, high: 24950, low: 24850, close: 24920, volume: null },
    ];
    const result = mergeHistoricalAndLive(historical, [], null);
    expect(result[0].volume).toBeNull();
  });

  it("mixed historical/live volume preserved correctly", () => {
    const historical = [
      { time: "2024-08-30T09:10:00.000Z", open: 24900, high: 24950, low: 24850, close: 24920, volume: 1000 },
    ];
    const completed: LiveCandle[] = [{
      bucketMs: Date.parse("2024-08-30T09:11:00.000Z"),
      open: 24920, high: 25000, low: 24900, close: 24980, volume: 1500,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:11:00.000Z", lastTimestamp: "2024-08-30T09:11:50.000Z", tickCount: 10,
    }];
    const current: LiveCandle = {
      bucketMs: Date.parse("2024-08-30T09:12:00.000Z"),
      open: 24980, high: 25050, low: 24950, close: 25020, volume: 800,
      provider: "INDSTOCKS_V1", instrument: "NIFTY50",
      openTimestamp: "2024-08-30T09:12:00.000Z", lastTimestamp: "2024-08-30T09:12:30.000Z", tickCount: 5,
    };
    const result = mergeHistoricalAndLive(historical, completed, current);
    expect(result).toHaveLength(3);
    expect(result[0].volume).toBe(1000);
    expect(result[1].volume).toBe(1500);
    expect(result[2].volume).toBe(800);
  });
});
