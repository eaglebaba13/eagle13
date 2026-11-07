import { describe, expect, it } from "vitest";
import type { IndicatorCandle } from "./types";
import {
  calculateVwap,
  computeIntradayVWAP,
  istDateKey,
  goldSessionKey,
  VWAP_ID,
  vwapDefinition,
} from "./vwap";
import {
  generateVWAPSignals,
  formatVWAPTelegramAlert,
  type VWAPExecutionSignal,
} from "../orderflow/vwap-signals";

function makeCandle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number | null = 1000,
): IndicatorCandle {
  return { time, open, high, low, close, volume };
}

describe("VWAP Foundation & Engine", () => {
  it("registers VWAP definition metadata properly", () => {
    expect(vwapDefinition.id).toBe(VWAP_ID);
    expect(vwapDefinition.outputs[0].key).toBe("vwap");
    expect(vwapDefinition.outputs[0].type).toBe("line");
  });

  it("calculates exact cumulative VWAP with known values", () => {
    // Candle 1: H=11, L=9, C=10 -> TP=10, V=100 -> cumPV=1000, cumV=100 -> VWAP=10
    // Candle 2: H=12, L=10, C=11 -> TP=11, V=200 -> cumPV=1000 + 2200 = 3200, cumV=300 -> VWAP=10.6667
    const candles: IndicatorCandle[] = [
      makeCandle(1000, 10, 11, 9, 10, 100),
      makeCandle(61000, 10, 12, 10, 11, 200),
    ];
    const res = calculateVwap(candles, {});
    expect(res.points).toHaveLength(2);
    expect(res.points[0].values.vwap).toBe(10);
    expect(res.points[1].values.vwap).toBeCloseTo(10.6667, 3);
  });

  it("handles null volume and carries forward previous VWAP", () => {
    const candles: IndicatorCandle[] = [
      makeCandle(1000, 10, 11, 9, 10, 100),
      makeCandle(61000, 10, 12, 10, 11, null),
    ];
    const res = calculateVwap(candles, {});
    expect(res.points[0].values.vwap).toBe(10);
    expect(res.points[1].values.vwap).toBe(10);
  });

  it("resets accumulation across IST date session boundary", () => {
    const day1Time = 1725000000000; // ~Aug 30 2024
    const day2Time = day1Time + 24 * 3600 * 1000;
    expect(istDateKey(day1Time)).not.toBe(istDateKey(day2Time));

    const candles: IndicatorCandle[] = [
      makeCandle(day1Time, 100, 102, 98, 100, 500),
      makeCandle(day2Time, 200, 204, 196, 200, 500),
    ];
    const res = calculateVwap(candles, {});
    expect(res.points[0].values.vwap).toBe(100);
    expect(res.points[1].values.vwap).toBe(200);
  });

  it("computes volume-weighted standard deviations and bands in computeIntradayVWAP", () => {
    const candles: IndicatorCandle[] = [
      makeCandle(1000, 100, 101, 99, 100, 1000), // TP = 100
      makeCandle(61000, 102, 103, 101, 102, 1000), // TP = 102
      makeCandle(121000, 104, 105, 103, 104, 1000), // TP = 104
    ];
    const vwapPoints = computeIntradayVWAP(candles);
    expect(vwapPoints).toHaveLength(3);

    // After 3 identical volume bars at 100, 102, 104:
    // Mean = (100 + 102 + 104) / 3 = 102
    expect(vwapPoints[2].vwap).toBe(102);
    expect(vwapPoints[2].stdDev).toBeGreaterThan(0);
    expect(vwapPoints[2].upperBand2SD).toBeCloseTo(vwapPoints[2].vwap + 2 * vwapPoints[2].stdDev, 3);
    expect(vwapPoints[2].lowerBand2SD).toBeCloseTo(vwapPoints[2].vwap - 2 * vwapPoints[2].stdDev, 3);
  });

  it("handles empty or zero-volume series safely without crashing", () => {
    const emptyPoints = computeIntradayVWAP([]);
    expect(emptyPoints).toHaveLength(0);

    const zeroVolCandles: IndicatorCandle[] = [
      makeCandle(1000, 50, 51, 49, 50, 0),
      makeCandle(61000, 52, 53, 51, 52, 0),
    ];
    const points = computeIntradayVWAP(zeroVolCandles);
    expect(points).toHaveLength(2);
    expect(points[0].vwap).toBe(50);
    // Second candle has no volume, carries forward previous VWAP
    expect(points[1].vwap).toBe(50);
  });
});

describe("VWAP Quantitative Execution Signals", () => {
  it("detects Overbought Mean Reversion when price > +2.0 SD with upper wick exhaustion", () => {
    // Generate baseline VWAP at ~25000 with modest variance
    const t0 = 1750000000000;
    const baseCandles: IndicatorCandle[] = [];
    for (let i = 0; i < 20; i++) {
      baseCandles.push(makeCandle(t0 + i * 60000, 25000, 25010, 24990, 25000, 1000));
    }
    // Price extends upward to 25225 (+5.0 SD) and prints an upper wick rejection
    // High = 25225, Open = 25200, Close = 25190, Low = 25170
    // Range = 55, Upper wick = 25225 - 25200 = 25 (45% wick)
    // Reward to VWAP (~25015) = 175, Risk to stop (~25235) = 45 -> R:R ~ 3.88:1
    baseCandles.push(makeCandle(t0 + 20 * 60000, 25200, 25225, 25170, 25190, 2500));

    const signals = generateVWAPSignals(baseCandles, { symbol: "NIFTY50", minRiskReward: 1.2 });
    const mrBear = signals.find((s) => s.type === "VWAP_MEAN_REVERSION_OVERBOUGHT");

    expect(mrBear).toBeDefined();
    expect(mrBear?.direction).toBe("BEARISH");
    expect(mrBear?.targetPrice).toBeLessThan(mrBear!.price);
    expect(mrBear?.stopLoss).toBeGreaterThan(mrBear!.price);
    expect(mrBear?.confirmation.wickRatio).toBeGreaterThanOrEqual(0.35);
  });

  it("detects Oversold Mean Reversion when price < -2.0 SD with lower wick exhaustion", () => {
    const t0 = 1750000000000;
    const baseCandles: IndicatorCandle[] = [];
    for (let i = 0; i < 20; i++) {
      baseCandles.push(makeCandle(t0 + i * 60000, 25000, 25010, 24990, 25000, 1000));
    }
    // Price plunges downward to 24780 (-5.0 SD) and prints a lower wick rejection
    // Low = 24780, Open = 24800, Close = 24810, High = 24825
    // Range = 45, Lower wick = 24800 - 24780 = 20 (44% wick)
    // Reward to VWAP (~25000) = 190, Risk to stop (~24770) = 40 -> R:R ~ 4.75:1
    baseCandles.push(makeCandle(t0 + 20 * 60000, 24800, 24825, 24780, 24810, 2500));

    const signals = generateVWAPSignals(baseCandles, { symbol: "NIFTY50", minRiskReward: 1.2 });
    const mrBull = signals.find((s) => s.type === "VWAP_MEAN_REVERSION_OVERSOLD");

    expect(mrBull).toBeDefined();
    expect(mrBull?.direction).toBe("BULLISH");
    expect(mrBull?.targetPrice).toBeGreaterThan(mrBull!.price);
    expect(mrBull?.stopLoss).toBeLessThan(mrBull!.price);
    expect(mrBull?.confirmation.wickRatio).toBeGreaterThanOrEqual(0.35);
  });

  it("detects Bullish Dynamic Support Retest when price holds above VWAP line", () => {
    const t0 = 1750000000000;
    // VWAP builds at ~25000
    const candles: IndicatorCandle[] = [
      makeCandle(t0, 24980, 25020, 24970, 25010, 1000),
      makeCandle(t0 + 60000, 25010, 25040, 25000, 25035, 1000),
      // Retest candle: dips down to VWAP (~25015), wicks off it, and closes strong
      makeCandle(t0 + 120000, 25035, 25050, 25015, 25045, 1500),
    ];

    const signals = generateVWAPSignals(candles, { symbol: "NIFTY50", minRiskReward: 1.2 });
    const supportRetest = signals.find((s) => s.type === "VWAP_DYNAMIC_SUPPORT_RETEST");

    expect(supportRetest).toBeDefined();
    expect(supportRetest?.direction).toBe("BULLISH");
    expect(supportRetest?.targetPrice).toBeGreaterThan(supportRetest!.price);
    expect(supportRetest?.stopLoss).toBeLessThan(supportRetest!.price);
  });

  it("detects Bearish Dynamic Resistance Retest when price rejects from below VWAP", () => {
    const t0 = 1750000000000;
    // VWAP builds at ~25000
    const candles: IndicatorCandle[] = [
      makeCandle(t0, 25020, 25030, 24980, 24990, 1000),
      makeCandle(t0 + 60000, 24990, 25000, 24960, 24970, 1000),
      // Pullback candle: tests VWAP from below (~24990), rejects, and closes down
      makeCandle(t0 + 120000, 24970, 24990, 24950, 24960, 1500),
    ];

    const signals = generateVWAPSignals(candles, { symbol: "NIFTY50", minRiskReward: 1.2 });
    const resRetest = signals.find((s) => s.type === "VWAP_DYNAMIC_RESISTANCE_RETEST");

    expect(resRetest).toBeDefined();
    expect(resRetest?.direction).toBe("BEARISH");
    expect(resRetest?.targetPrice).toBeLessThan(resRetest!.price);
    expect(resRetest?.stopLoss).toBeGreaterThan(resRetest!.price);
  });

  it("formats institutional Telegram alert with complete trade parameters", () => {
    const mockSignal: VWAPExecutionSignal = {
      id: "VWAP-MR-BEAR-GC1!-1750000000000",
      symbol: "GC1!",
      type: "VWAP_MEAN_REVERSION_OVERBOUGHT",
      direction: "BEARISH",
      price: 2748.5,
      timestamp: 1750000000000,
      vwap: 2740.0,
      stdDev: 3.5,
      targetPrice: 2740.0,
      stopLoss: 2752.0,
      riskRewardRatio: 2.43,
      confirmation: {
        candleConfirmed: true,
        candleType: "BEARISH_REJECTION_PINBAR",
        wickRatio: 0.58,
        zScore: 2.43,
      },
      headline: "VWAP Mean Reversion: COMEX Gold Overbought (+2.4σ)",
      description: "Price extended beyond +2.0 SD from VWAP with heavy upper wick trap.",
      recommendedAction: "SHORT with stop above 2752.0. Target VWAP mean at 2740.0.",
    };

    const text = formatVWAPTelegramAlert(mockSignal);
    expect(text).toContain("INSTITUTIONAL VWAP ALERT");
    expect(text).toContain("GC1!");
    expect(text).toContain("Intraday VWAP: 2740");
    expect(text).toContain("Target Price: 2740");
    expect(text).toContain("Stop Loss: 2752");
    expect(text).toContain("2.43:1");
    expect(text).toContain("SHORT with stop above 2752.0");
  });
});
