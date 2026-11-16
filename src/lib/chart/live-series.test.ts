import { describe, it, expect, vi } from "vitest";
import { LiveSeriesSynchronizer, mergeChartCandles, type ChartCandleData } from "./live-series";
import { createChartDrawing, drawingLogical, pointAtLogical } from "./drawing-types";
import { bucketTimestamp, stitchCandlePoints } from "../provider-foundation/indstocks/candle-aggregator";

const start = Date.parse("2026-11-13T09:15:00+05:30");
const bar = (i: number, close = 102): ChartCandleData => ({ time: start + i * 60000, open: 100, high: 110, low: 90, close, volume: 100 });
const ports = () => ({ candle: { setData: vi.fn(), update: vi.fn() }, volume: { setData: vi.fn(), update: vi.fn() }, vwap: { setData: vi.fn(), update: vi.fn() } });

describe("incremental chart series", () => {
  it("seeds all 500 bars exactly once and never reloads any series during repeated live ticks", () => {
    const sync = new LiveSeriesSynchronizer();
    const api = ports();
    const history = Array.from({ length: 500 }, (_, i) => bar(i));
    expect(sync.sync("NIFTY50:60000", mergeChartCandles(history), api)).toBe(true);
    for (const close of [103, 104, 105]) {
      expect(sync.sync("NIFTY50:60000", mergeChartCandles(history, bar(499, close)), api)).toBe(false);
    }
    for (const series of Object.values(api)) expect(series.setData).toHaveBeenCalledTimes(1);
    expect(api.candle.setData.mock.calls[0][0]).toHaveLength(500);
    expect(api.candle.update).toHaveBeenCalledTimes(3);
    expect(api.candle.update.mock.calls.at(-1)?.[0].close).toBe(105);
  });

  it("finalizes the preceding bar before appending new bars without a dataset reset", () => {
    const sync = new LiveSeriesSynchronizer();
    const api = ports();
    sync.sync("a", mergeChartCandles([bar(0), bar(1)]), api);
    sync.sync("a", mergeChartCandles([bar(0), bar(1, 104), bar(2)]), api);
    expect(api.candle.update.mock.calls.map((call) => call[0].close)).toEqual([104, 102]);
    sync.sync("a", mergeChartCandles([bar(0, 106), bar(1, 104), bar(2)]), api);
    expect(api.candle.update.mock.calls.at(-1)?.[1]).toBe(true);
    expect(api.candle.setData).toHaveBeenCalledTimes(1);
    expect(sync.sync("BANKNIFTY:300000", mergeChartCandles([bar(0)]), api)).toBe(true);
    expect(api.candle.setData).toHaveBeenCalledTimes(2);
  });

  it("preserves REST history, its open/extremes and volume when SSE begins mid-candle", () => {
    const historical = [bar(0), bar(1)];
    const live = { ...bar(1, 108), open: 107, high: 109, low: 104, volume: 10 };
    const result = mergeChartCandles(historical, live);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ open: 100, high: 110, low: 90, close: 108, volume: 100 });
    expect(mergeChartCandles(historical, { ...live, time: live.time / 1000 })).toEqual(result);
    expect(stitchCandlePoints([{ x: start, y: [100, 110, 90, 105], volume: 10 }], [{ x: NaN, y: [1, 1, 1, 1], volume: 0 }])).toHaveLength(1);
  });

  it("does not invent volume or VWAP when index volume is absent", () => {
    const sync = new LiveSeriesSynchronizer();
    const api = ports();
    sync.sync("a", [{ ...bar(0), volume: null }], api);
    expect(api.volume.setData.mock.calls[0][0][0].value).toBe(0);
    expect(api.vwap.setData.mock.calls[0][0][0]).not.toHaveProperty("value");
  });
  it("backfills appended reconnect history and retains existing logical indices when REST rolls its 500-bar window", () => {
    const sync = new LiveSeriesSynchronizer();
    const api = ports();
    sync.sync("a", mergeChartCandles([bar(0), bar(1), bar(2)]), api);
    sync.sync("a", mergeChartCandles([bar(2), bar(3), bar(4), bar(5)]), api);
    expect(sync.candles).toHaveLength(6);
    expect(sync.candles[0].time).toBe(start / 1000);
    expect(api.candle.setData).toHaveBeenCalledTimes(1);
    expect(api.candle.update.mock.calls.map((c) => c[0].time)).toEqual([3, 4, 5].map((i) => start / 1000 + i * 60));
  });
});

describe("logical drawing anchors", () => {
  const bars = [bar(0), bar(1), bar(2)];
  it("supports fractional indices and future whitespace without an exact candle timestamp", () => {
    const point = pointAtLogical(8.5, 105, bars, 60000)!;
    expect(point.logical).toBe(8.5);
    expect(drawingLogical(point, bars, 60000)).toBe(8.5);
    expect(point.time).toBe(start / 1000 + 8.5 * 60);
  });
  it("rebases persisted anchors after history shifts and loads legacy drawings across timeframes", () => {
    const point = pointAtLogical(1.5, 105, bars, 60000)!;
    const prepended = [bar(-1), ...bars];
    expect(drawingLogical(point, prepended, 60000)).toBe(2.5);
    expect(drawingLogical({ time: start / 1000 + 60, price: 105 }, bars, 60000)).toBe(1);
    expect(drawingLogical(point, [bar(0), bar(2)], 120000)).toBeCloseTo(0.75);
    expect(pointAtLogical(NaN, 1, bars, 60000)).toBeNull();
  });
  it.each(["trendline", "horizontal", "fibonacci", "rectangle", "riskRewardLong", "riskRewardShort", "ruler"] as const)("creates complete %s drawings with logical endpoints", (tool) => {
    const first = pointAtLogical(1, 100, bars, 60000)!;
    const second = pointAtLogical(8, 90, bars, 60000)!;
    const drawing = createChartDrawing(tool, first, second, "test");
    expect(drawing.isComplete).toBe(true);
    expect(drawing.points.every((p) => Number.isFinite(p.logical))).toBe(true);
    expect(drawing.meta?.barCount).toBe(7);
    if (tool === "riskRewardLong") expect(drawing.points.map((p) => p.price)).toEqual([100, 90, 120]);
    if (tool === "riskRewardShort") expect(drawing.points.map((p) => p.price)).toEqual([100, 110, 80]);
    if (tool === "horizontal") expect(drawing.points).toHaveLength(1);
  });
});

describe("Indian session alignment shared by REST and SSE", () => {
  it.each([1800000, 3600000, 14400000])("aligns %i ms bars to the 09:15 session open", (interval) => {
    const tick = Date.parse("2026-11-16T09:45:00+05:30");
    const expected = Date.parse(interval === 1800000 ? "2026-11-16T09:45:00+05:30" : "2026-11-16T09:15:00+05:30");
    expect(bucketTimestamp(tick, interval, "NIFTY50")).toBe(expected);
    expect(bucketTimestamp(tick, interval, "BANKNIFTY")).toBe(expected);
  });
  it("aligns daily/weekly Indian bars while preserving crypto UTC buckets", () => {
    const tick = Date.parse("2026-11-18T10:00:00+05:30");
    expect(bucketTimestamp(tick, 86400000, "NIFTY50")).toBe(Date.parse("2026-11-18T00:00:00+05:30"));
    expect(bucketTimestamp(tick, 604800000, "NIFTY50")).toBe(Date.parse("2026-11-16T00:00:00+05:30"));
    expect(bucketTimestamp(tick, 3600000, "BTCUSDT")).toBe(Math.floor(tick / 3600000) * 3600000);
  });
});
