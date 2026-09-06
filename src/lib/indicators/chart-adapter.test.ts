import { describe, expect, it } from "vitest";
import {
  indicatorToChartSeries,
  indicatorsToChartSeries,
  getChartPlacement,
  validateIndicatorParams,
  getIndicatorColor,
} from "./chart-adapter";
import type { IndicatorResult } from "./types";

function makeResult(id: string, keys: string[], values: (number | null)[][]): IndicatorResult {
  return {
    id,
    params: {},
    points: values.map((vals, i) => ({
      time: i * 60_000,
      values: Object.fromEntries(keys.map((k, j) => [k, vals[j] ?? null])),
    })),
    warmUpComplete: true,
    computedAt: Date.now(),
  };
}

describe("chart-adapter", () => {
  describe("indicatorToChartSeries", () => {
    it("SMA → single overlay line series", () => {
      const result = makeResult("SMA", ["sma"], [[null], [25000], [25100], [25200]]);
      const config = indicatorToChartSeries(result);
      expect(config.placement).toBe("overlay");
      expect(config.series).toHaveLength(1);
      expect(config.series[0].name).toBe("SMA Sma");
      expect(config.series[0].data).toHaveLength(4);
      expect(config.series[0].data[0].y).toBeNull();
      expect(config.series[0].data[1].y).toBe(25000);
    });

    it("EMA → single overlay line series", () => {
      const result = makeResult("EMA", ["ema"], [[null], [25000]]);
      const config = indicatorToChartSeries(result);
      expect(config.placement).toBe("overlay");
      expect(config.series).toHaveLength(1);
      expect(config.series[0].name).toBe("EMA Ema");
    });

    it("RSI → single oscillator line series", () => {
      const result = makeResult("RSI", ["rsi"], [[null], [65]]);
      const config = indicatorToChartSeries(result);
      expect(config.placement).toBe("oscillator");
      expect(config.series).toHaveLength(1);
      expect(config.series[0].name).toBe("RSI Rsi");
    });

    it("MACD → three series (macd, signal, histogram)", () => {
      const result = makeResult(
        "MACD",
        ["macd", "signal", "histogram"],
        [
          [null, null, null],
          [10, 5, 5],
        ],
      );
      const config = indicatorToChartSeries(result);
      expect(config.placement).toBe("oscillator");
      expect(config.series).toHaveLength(3);
      expect(config.series[0].name).toBe("MACD Macd");
      expect(config.series[1].name).toBe("MACD Signal");
      expect(config.series[2].name).toBe("MACD Histogram");
      expect(config.series[2].type).toBe("bar");
    });

    it("Bollinger → three overlay line series", () => {
      const result = makeResult(
        "BOLLINGER",
        ["upper", "middle", "lower"],
        [
          [null, null, null],
          [25200, 25000, 24800],
        ],
      );
      const config = indicatorToChartSeries(result);
      expect(config.placement).toBe("overlay");
      expect(config.series).toHaveLength(3);
      expect(config.series[0].name).toBe("BB Upper");
      expect(config.series[1].name).toBe("BB Middle");
      expect(config.series[2].name).toBe("BB Lower");
    });

    it("VWAP → single overlay line series", () => {
      const result = makeResult("VWAP", ["vwap"], [[25000], [25050]]);
      const config = indicatorToChartSeries(result);
      expect(config.placement).toBe("overlay");
      expect(config.series).toHaveLength(1);
    });

    it("preserves null warm-up values", () => {
      const result = makeResult("SMA", ["sma"], [[null], [null], [25000]]);
      const config = indicatorToChartSeries(result);
      expect(config.series[0].data[0].y).toBeNull();
      expect(config.series[0].data[1].y).toBeNull();
      expect(config.series[0].data[2].y).toBe(25000);
    });

    it("preserves timestamp alignment", () => {
      const result = makeResult("SMA", ["sma"], [[null], [25000], [25100]]);
      const config = indicatorToChartSeries(result);
      expect(config.series[0].data[0].x).toBe(0);
      expect(config.series[0].data[1].x).toBe(60_000);
      expect(config.series[0].data[2].x).toBe(120_000);
    });

    it("empty result returns empty series", () => {
      const result: IndicatorResult = {
        id: "SMA",
        params: {},
        points: [],
        warmUpComplete: false,
        computedAt: Date.now(),
      };
      const config = indicatorToChartSeries(result);
      // No points → no output keys → no series
      expect(config.series).toHaveLength(0);
    });
  });

  describe("indicatorsToChartSeries", () => {
    it("separates overlay and oscillator indicators", () => {
      const sma = makeResult("SMA", ["sma"], [[25000]]);
      const rsi = makeResult("RSI", ["rsi"], [[65]]);
      const { overlaySeries, oscillators } = indicatorsToChartSeries([sma, rsi]);
      expect(overlaySeries).toHaveLength(1);
      expect(oscillators).toHaveLength(1);
      expect(oscillators[0].indicatorId).toBe("RSI");
    });

    it("groups multiple overlay indicators together", () => {
      const sma = makeResult("SMA", ["sma"], [[25000]]);
      const ema = makeResult("EMA", ["ema"], [[25100]]);
      const { overlaySeries, oscillators } = indicatorsToChartSeries([sma, ema]);
      expect(overlaySeries).toHaveLength(2);
      expect(oscillators).toHaveLength(0);
    });
  });

  describe("getChartPlacement", () => {
    it("SMA is overlay", () => expect(getChartPlacement("SMA")).toBe("overlay"));
    it("EMA is overlay", () => expect(getChartPlacement("EMA")).toBe("overlay"));
    it("VWAP is overlay", () => expect(getChartPlacement("VWAP")).toBe("overlay"));
    it("BOLLINGER is overlay", () => expect(getChartPlacement("BOLLINGER")).toBe("overlay"));
    it("RSI is oscillator", () => expect(getChartPlacement("RSI")).toBe("oscillator"));
    it("MACD is oscillator", () => expect(getChartPlacement("MACD")).toBe("oscillator"));
  });

  describe("validateIndicatorParams", () => {
    it("valid params pass", () => {
      const result = validateIndicatorParams({ period: 20 }, [
        { key: "period", type: "int", min: 1, max: 500 },
      ]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("below minimum fails", () => {
      const result = validateIndicatorParams({ period: 0 }, [
        { key: "period", type: "int", min: 1, max: 500 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("minimum");
    });

    it("above maximum fails", () => {
      const result = validateIndicatorParams({ period: 1000 }, [
        { key: "period", type: "int", min: 1, max: 500 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("maximum");
    });

    it("non-integer for int type fails", () => {
      const result = validateIndicatorParams({ period: 14.5 }, [
        { key: "period", type: "int", min: 1, max: 500 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("integer");
    });

    it("float type accepts decimals", () => {
      const result = validateIndicatorParams({ multiplier: 2.5 }, [
        { key: "multiplier", type: "float", min: 0.1, max: 5 },
      ]);
      expect(result.valid).toBe(true);
    });

    it("missing required param fails", () => {
      const result = validateIndicatorParams({}, [
        { key: "period", type: "int", min: 1, max: 500 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("required");
    });
  });

  describe("getIndicatorColor", () => {
    it("returns known colors", () => {
      expect(getIndicatorColor("sma")).toBe("#f59e0b");
      expect(getIndicatorColor("ema")).toBe("#3b82f6");
      expect(getIndicatorColor("rsi")).toBe("#8b5cf6");
    });

    it("returns default for unknown", () => {
      expect(getIndicatorColor("unknown")).toBe("#888");
    });
  });

  describe("determinism", () => {
    it("same input produces same output", () => {
      const result = makeResult("SMA", ["sma"], [[null], [25000], [25100]]);
      const r1 = indicatorToChartSeries(result);
      const r2 = indicatorToChartSeries(result);
      expect(r1.series).toEqual(r2.series);
    });
  });
});
