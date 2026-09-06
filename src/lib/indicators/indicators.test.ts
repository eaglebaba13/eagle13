import { describe, expect, it } from "vitest";
import type { IndicatorCandle } from "./types";
import { calculateSma, SMA_ID } from "./sma";
import { calculateEma, EMA_ID } from "./ema";
import { calculateRsi, RSI_ID } from "./rsi";
import { calculateMacd, MACD_ID } from "./macd";
import { calculateBollinger, BOLLINGER_ID } from "./bollinger";
import { calculateVwap, VWAP_ID } from "./vwap";
import {
  getIndicator,
  listIndicators,
  hasIndicator,
  listIndicatorIds,
  registerIndicator,
} from "./registry";

// ────────────────────── Test Fixtures ──────────────────────────────

function candle(close: number, time = 0, volume: number | null = null): IndicatorCandle {
  return { time, open: close, high: close + 1, low: close - 1, close, volume };
}

function candlesFromCloses(closes: number[]): IndicatorCandle[] {
  return closes.map((c, i) => candle(c, i * 60_000));
}

// Known values from Wikipedia/textbook:
// SMA(3) of [1,2,3,4,5] = [null, null, 2, 3, 4]
const CLOSES_5 = [1, 2, 3, 4, 5];

// ────────────────────── SMA ────────────────────────────────────────

describe("SMA", () => {
  it("computes SMA(3) correctly", () => {
    const result = calculateSma(candlesFromCloses(CLOSES_5), { period: 3 });
    expect(result.id).toBe(SMA_ID);
    expect(result.points).toHaveLength(5);
    expect(result.points[0].values.sma).toBeNull();
    expect(result.points[1].values.sma).toBeNull();
    expect(result.points[2].values.sma).toBe(2);
    expect(result.points[3].values.sma).toBe(3);
    expect(result.points[4].values.sma).toBe(4);
  });

  it("SMA(1) equals the close price", () => {
    const result = calculateSma(candlesFromCloses([10, 20, 30]), { period: 1 });
    expect(result.points[0].values.sma).toBe(10);
    expect(result.points[1].values.sma).toBe(20);
    expect(result.points[2].values.sma).toBe(30);
  });

  it("empty input returns empty points", () => {
    const result = calculateSma([], { period: 5 });
    expect(result.points).toHaveLength(0);
    expect(result.warmUpComplete).toBe(false);
  });

  it("single candle with period 1", () => {
    const result = calculateSma(candlesFromCloses([42]), { period: 1 });
    expect(result.points).toHaveLength(1);
    expect(result.points[0].values.sma).toBe(42);
  });

  it("constant price series", () => {
    const result = calculateSma(candlesFromCloses([5, 5, 5, 5, 5]), { period: 3 });
    for (let i = 2; i < 5; i++) {
      expect(result.points[i].values.sma).toBe(5);
    }
  });

  it("warmUpComplete is true when enough data", () => {
    const result = calculateSma(candlesFromCloses([1, 2, 3]), { period: 3 });
    expect(result.warmUpComplete).toBe(true);
  });

  it("warmUpComplete is false when insufficient", () => {
    const result = calculateSma(candlesFromCloses([1, 2]), { period: 3 });
    expect(result.warmUpComplete).toBe(false);
  });

  it("period defaults to 20 when not specified", () => {
    const result = calculateSma(candlesFromCloses([1, 2, 3]), {});
    expect(result.params.period).toBe(20);
  });
});

// ────────────────────── EMA ────────────────────────────────────────

describe("EMA", () => {
  it("EMA(3) seed is SMA of first 3 values", () => {
    const closes = [1, 2, 3, 4, 5];
    const result = calculateEma(candlesFromCloses(closes), { period: 3 });
    expect(result.points[0].values.ema).toBeNull();
    expect(result.points[1].values.ema).toBeNull();
    // Seed: SMA(1,2,3) = 2
    expect(result.points[2].values.ema).toBe(2);
  });

  it("EMA(3) propagates correctly", () => {
    const closes = [1, 2, 3, 4, 5];
    const result = calculateEma(candlesFromCloses(closes), { period: 3 });
    // After seed (i=2): ema=2
    // i=3: ema = 4 * (2/4) + 2 * (2/4) = 2 + 1 = 3
    expect(result.points[3].values.ema).toBe(3);
    // i=4: ema = 5 * 0.5 + 3 * 0.5 = 4
    expect(result.points[4].values.ema).toBe(4);
  });

  it("empty input", () => {
    const result = calculateEma([], { period: 5 });
    expect(result.points).toHaveLength(0);
  });

  it("EMA(1) equals close price", () => {
    const result = calculateEma(candlesFromCloses([10, 20, 30]), { period: 1 });
    // period=1, multiplier=2/2=1, so EMA = close * 1 = close
    expect(result.points[0].values.ema).toBe(10);
  });

  it("constant price series stays constant", () => {
    const result = calculateEma(candlesFromCloses([7, 7, 7, 7, 7]), { period: 3 });
    for (let i = 2; i < 5; i++) {
      expect(result.points[i].values.ema).toBe(7);
    }
  });
});

// ────────────────────── RSI ────────────────────────────────────────

describe("RSI", () => {
  it("all gains (monotonically increasing) → RSI = 100", () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const result = calculateRsi(candlesFromCloses(closes), { period: 14 });
    // First RSI at index 14
    expect(result.points[14].values.rsi).toBe(100);
  });

  it("all losses (monotonically decreasing) → RSI = 0", () => {
    const closes = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const result = calculateRsi(candlesFromCloses(closes), { period: 14 });
    expect(result.points[14].values.rsi).toBe(0);
  });

  it("warm-up period is null", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = calculateRsi(candlesFromCloses(closes), { period: 14 });
    for (let i = 0; i < 14; i++) {
      expect(result.points[i].values.rsi).toBeNull();
    }
    // First RSI at index 14
    expect(result.points[14].values.rsi).not.toBeNull();
  });

  it("insufficient data returns all null", () => {
    const closes = [1, 2, 3];
    const result = calculateRsi(candlesFromCloses(closes), { period: 14 });
    expect(result.warmUpComplete).toBe(false);
    for (const p of result.points) {
      expect(p.values.rsi).toBeNull();
    }
  });

  it("RSI is in 0-100 range for mixed series", () => {
    const closes = [
      44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28,
      46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
    ];
    const result = calculateRsi(candlesFromCloses(closes), { period: 14 });
    for (const p of result.points) {
      if (p.values.rsi != null) {
        expect(p.values.rsi).toBeGreaterThanOrEqual(0);
        expect(p.values.rsi).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ────────────────────── MACD ───────────────────────────────────────

describe("MACD", () => {
  it("returns null during warm-up", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calculateMacd(candlesFromCloses(closes), { fast: 12, slow: 26, signal: 9 });
    // Warm-up: slow - 1 = 25 candles before first MACD
    for (let i = 0; i < 25; i++) {
      expect(result.points[i].values.macd).toBeNull();
    }
  });

  it("MACD, signal, histogram are all present after warm-up", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const result = calculateMacd(candlesFromCloses(closes), { fast: 12, slow: 26, signal: 9 });
    // Find first non-null MACD
    const firstMacd = result.points.findIndex((p) => p.values.macd != null);
    expect(firstMacd).toBeGreaterThanOrEqual(0);
    // After first MACD + signal warm-up, histogram should be present
    const signalWarmUp = firstMacd + 9 - 1;
    if (signalWarmUp < result.points.length) {
      expect(result.points[signalWarmUp].values.histogram).not.toBeNull();
    }
  });

  it("histogram = macd - signal", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
    const result = calculateMacd(candlesFromCloses(closes), { fast: 12, slow: 26, signal: 9 });
    for (const p of result.points) {
      if (p.values.macd != null && p.values.signal != null) {
        expect(p.values.histogram).toBeCloseTo(p.values.macd - p.values.signal, 4);
      }
    }
  });

  it("constant price → MACD near zero", () => {
    const closes = Array(50).fill(100);
    const result = calculateMacd(candlesFromCloses(closes), { fast: 12, slow: 26, signal: 9 });
    const last = result.points[result.points.length - 1];
    expect(last.values.macd).toBeCloseTo(0, 2);
  });
});

// ────────────────────── Bollinger Bands ────────────────────────────

describe("Bollinger Bands", () => {
  it("middle band equals SMA", () => {
    const closes = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
    const bb = calculateBollinger(candlesFromCloses(closes), { period: 5, multiplier: 2 });
    const sma = calculateSma(candlesFromCloses(closes), { period: 5 });
    for (let i = 4; i < closes.length; i++) {
      expect(bb.points[i].values.middle).toBe(sma.points[i].values.sma);
    }
  });

  it("upper > middle > lower when std dev > 0", () => {
    const closes = [10, 12, 11, 13, 14, 12, 15, 13, 16, 14];
    const result = calculateBollinger(candlesFromCloses(closes), { period: 5, multiplier: 2 });
    for (let i = 4; i < closes.length; i++) {
      const { upper, middle, lower } = result.points[i].values;
      if (upper != null && middle != null && lower != null) {
        expect(upper).toBeGreaterThan(middle);
        expect(middle).toBeGreaterThan(lower);
      }
    }
  });

  it("constant price → bands collapse to single line", () => {
    const closes = Array(10).fill(50);
    const result = calculateBollinger(candlesFromCloses(closes), { period: 5, multiplier: 2 });
    for (let i = 4; i < 10; i++) {
      const { upper, middle, lower } = result.points[i].values;
      expect(upper).toBe(middle);
      expect(lower).toBe(middle);
    }
  });

  it("null during warm-up", () => {
    const closes = [1, 2, 3];
    const result = calculateBollinger(candlesFromCloses(closes), { period: 5, multiplier: 2 });
    for (const p of result.points) {
      expect(p.values.upper).toBeNull();
      expect(p.values.middle).toBeNull();
      expect(p.values.lower).toBeNull();
    }
  });
});

// ────────────────────── VWAP ───────────────────────────────────────

describe("VWAP", () => {
  it("VWAP with known values", () => {
    // Typical price = (H+L+C)/3
    // Candle 1: H=11, L=9, C=10 → TP=10, V=100 → PV=1000, cumV=100, VWAP=10
    // Candle 2: H=12, L=10, C=11 → TP=11, V=200 → PV=3200, cumV=300, VWAP=10.67
    const candles: IndicatorCandle[] = [
      { time: 0, open: 10, high: 11, low: 9, close: 10, volume: 100 },
      { time: 60_000, open: 11, high: 12, low: 10, close: 11, volume: 200 },
    ];
    const result = calculateVwap(candles, {});
    expect(result.points[0].values.vwap).toBe(10);
    expect(result.points[1].values.vwap).toBeCloseTo(10.67, 2);
  });

  it("null volume skips candle", () => {
    const candles: IndicatorCandle[] = [
      { time: 0, open: 10, high: 11, low: 9, close: 10, volume: 100 },
      { time: 60_000, open: 10, high: 11, low: 9, close: 10, volume: null },
    ];
    const result = calculateVwap(candles, {});
    expect(result.points[0].values.vwap).toBe(10);
    // Second candle has no volume → carries forward VWAP
    expect(result.points[1].values.vwap).toBe(10);
  });

  it("resets on session boundary", () => {
    // Two candles on different days (24h apart)
    const day1 = 1725000000000; // some epoch ms
    const day2 = day1 + 86_400_000;
    const candles: IndicatorCandle[] = [
      { time: day1, open: 10, high: 11, low: 9, close: 10, volume: 100 },
      { time: day2, open: 20, high: 21, low: 19, close: 20, volume: 100 },
    ];
    const result = calculateVwap(candles, {});
    // Second candle is a new day → VWAP resets
    expect(result.points[1].values.vwap).toBe(20);
  });

  it("empty input", () => {
    const result = calculateVwap([], {});
    expect(result.points).toHaveLength(0);
  });
});

// ────────────────────── Registry ───────────────────────────────────

describe("indicator registry", () => {
  it("all 6 built-in indicators registered", () => {
    expect(listIndicators()).toHaveLength(6);
    expect(hasIndicator("SMA")).toBe(true);
    expect(hasIndicator("EMA")).toBe(true);
    expect(hasIndicator("RSI")).toBe(true);
    expect(hasIndicator("MACD")).toBe(true);
    expect(hasIndicator("BOLLINGER")).toBe(true);
    expect(hasIndicator("VWAP")).toBe(true);
  });

  it("getIndicator returns correct definition", () => {
    const sma = getIndicator("SMA");
    expect(sma?.name).toBe("Simple Moving Average");
    expect(sma?.params).toHaveLength(1);
    expect(sma?.outputs).toHaveLength(1);
  });

  it("getIndicator returns undefined for unknown ID", () => {
    expect(getIndicator("UNKNOWN")).toBeUndefined();
  });

  it("listIndicatorIds returns all IDs", () => {
    const ids = listIndicatorIds();
    expect(ids).toContain("SMA");
    expect(ids).toContain("EMA");
    expect(ids).toContain("RSI");
    expect(ids).toContain("MACD");
    expect(ids).toContain("BOLLINGER");
    expect(ids).toContain("VWAP");
  });

  it("registerIndicator adds new indicator", () => {
    const custom = {
      id: "CUSTOM_TEST",
      name: "Custom Test",
      description: "Test indicator",
      params: [],
      outputs: [{ key: "value", label: "Value", type: "line" as const }],
      warmUpPeriod: () => 1,
      calculate: (candles: readonly IndicatorCandle[]) => ({
        id: "CUSTOM_TEST",
        params: {},
        points: candles.map((c) => ({ time: c.time, values: { value: c.close } })),
        warmUpComplete: true,
        computedAt: Date.now(),
      }),
    };
    registerIndicator(custom);
    expect(hasIndicator("CUSTOM_TEST")).toBe(true);
    expect(getIndicator("CUSTOM_TEST")?.name).toBe("Custom Test");
  });

  it("registerIndicator throws on duplicate", () => {
    expect(() => registerIndicator(getIndicator("SMA")!)).toThrow("Duplicate");
  });
});

// ────────────────────── Determinism ────────────────────────────────

describe("determinism", () => {
  it("SMA is deterministic — same input produces same output", () => {
    const closes = [10, 20, 30, 40, 50];
    const r1 = calculateSma(candlesFromCloses(closes), { period: 3 });
    const r2 = calculateSma(candlesFromCloses(closes), { period: 3 });
    expect(r1.points).toEqual(r2.points);
  });

  it("EMA is deterministic", () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r1 = calculateEma(candlesFromCloses(closes), { period: 5 });
    const r2 = calculateEma(candlesFromCloses(closes), { period: 5 });
    expect(r1.points).toEqual(r2.points);
  });

  it("RSI is deterministic", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 10);
    const r1 = calculateRsi(candlesFromCloses(closes), { period: 14 });
    const r2 = calculateRsi(candlesFromCloses(closes), { period: 14 });
    expect(r1.points).toEqual(r2.points);
  });
});

// ────────────────────── Edge Cases ─────────────────────────────────

describe("edge cases", () => {
  it("zero period is clamped to 1", () => {
    const result = calculateSma(candlesFromCloses([1, 2, 3]), { period: 0 });
    expect(result.params.period).toBe(1);
  });

  it("negative period is clamped to 1", () => {
    const result = calculateEma(candlesFromCloses([1, 2, 3]), { period: -5 });
    expect(result.params.period).toBe(1);
  });

  it("large candle series does not crash", () => {
    const closes = Array.from({ length: 10_000 }, (_, i) => 100 + Math.sin(i / 100) * 20);
    const result = calculateSma(candlesFromCloses(closes), { period: 200 });
    expect(result.points).toHaveLength(10_000);
    expect(result.points[9999].values.sma).not.toBeNull();
  });

  it("Bollinger with period 2 (minimum)", () => {
    const result = calculateBollinger(candlesFromCloses([10, 20]), { period: 2, multiplier: 2 });
    expect(result.points[1].values.upper).not.toBeNull();
    expect(result.points[1].values.lower).not.toBeNull();
  });
});
