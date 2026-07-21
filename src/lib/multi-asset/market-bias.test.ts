import { describe, it, expect } from "vitest";
import { computeMarketBias } from "./market-bias";
import { getInstrument } from "./instruments";
import type { LevelBundle } from "./level-bundle";
import type { SelectedCandle } from "./daily-candle";

const candle: SelectedCandle = {
  open: 100, high: 110, low: 95, close: 105, volume: 1000,
  candleOpenTime: "2026-07-21T00:00:00.000Z",
  candleCloseTime: "2026-07-22T00:00:00.000Z",
  providerTimezone: "Asia/Kolkata", reportingTimezone: "Asia/Kolkata",
  ageHours: 4, freshness: "FRESH", session24x7: false,
};

function niftyBundle(): LevelBundle {
  return {
    instrumentId: "NIFTY",
    tradingDate: "2026-07-21",
    sourceCandle: candle,
    pivot: { r3: 130, r2: 120, r1: 115, pp: 103.33, s1: 98, s2: 88, s3: 78 },
    pivotFormulaVersion: "EAGLEBABA_PIVOT_V1",
    gann: { up: 115, down: 95, sourcePrice: 105, formulaVersion: "GANN_SQUARE_OF_9_V1", status: "FRESH" },
    astro: { status: "FRESH", levels: [
      { name: "Sun-L1", value: 108, direction: "UP", role: "resistance", source: "astro" },
      { name: "Sun-L2", value: 112, direction: "UP", role: "resistance", source: "astro" },
    ], generatedAt: candle.candleOpenTime, validForDate: "2026-07-21" },
    calculatedAt: candle.candleOpenTime, freshness: "FRESH",
  };
}

describe("computeMarketBias", () => {
  it("returns bullish when price above R1 with Gann/Astro up", () => {
    const r = computeMarketBias({ instrument: getInstrument("NIFTY"), bundle: niftyBundle(), livePrice: 118 });
    expect(["BULLISH","STRONG_BULLISH"]).toContain(r.bias);
  });
  it("returns bearish when price below S1", () => {
    const r = computeMarketBias({ instrument: getInstrument("NIFTY"), bundle: niftyBundle(), livePrice: 90 });
    expect(["BEARISH","STRONG_BEARISH"]).toContain(r.bias);
  });
  it("returns UNAVAILABLE when no live price and non-index inputs", () => {
    const b = niftyBundle();
    const btcBundle: LevelBundle = {
      ...b, instrumentId: "BTC",
      gann: { ...b.gann, status: "UNAVAILABLE", up: null, down: null, sourcePrice: null },
      astro: { ...b.astro, status: "UNAVAILABLE", levels: [] },
    };
    const r = computeMarketBias({ instrument: getInstrument("BTC"), bundle: btcBundle, livePrice: null });
    expect(r.bias).toBe("UNAVAILABLE");
  });
});