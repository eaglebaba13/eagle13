import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartHeaderHud } from "../../components/chart/ChartHeaderHud";
import { buildLtpChartLevels, calculatorUnderlying } from "./ltp-overlay";
import { isRegularSessionCandle } from "../provider-foundation/indstocks/candle-aggregator";
import type { LtpCalculatorOutput, StockFourLineLevels } from "../options/ltp-calculator-engine.server";

export const calculatorFixture: LtpCalculatorOutput = {
  underlying: "NIFTY", timestamp: "2026-11-16T05:30:00Z", spotPrice: 25250, atmStrike: 25250,
  coaScenario: { scenarioId: 7, name: "PURE BULL RUN", tag: "COA #7", summary: "Support and resistance moving up",
    recommendation: "STRICT NO PUTS. Buy Call at every bottom.", sentiment: "EXTREMELY_BULLISH", color: "emerald",
    supportState: "WTT", resistanceState: "WTT", supportDominantFactor: "BOTH", resistanceDominantFactor: "VOLUME", badgeText: "COA #7" },
  reversalLevels: { eos: 25121.85, eor: 25364.50, eosMinus1: 25091.05, eorPlus1: 25401.25,
    sModerate: 25131.25, sRisky: 25140.5, rModerate: 25354.75, rRisky: 25344.5,
    supportStrike: 25200, resistanceStrike: 25300, spotPrice: 25250, maxPainSl: 25091.05, maxGainTarget: 25401.25 },
  callStrikes: [], putStrikes: [], currency: "INR", currencySymbol: "₹",
};

describe("authentic calculator presentation", () => {
  it("copies exact engine prices and strike labels rather than reconstructing ATM premiums", () => {
    const result = buildLtpChartLevels(calculatorFixture);
    expect(result.map((l) => [l.id, l.price])).toEqual([
      ["eos", 25121.85], ["s-mod", 25131.25], ["eor", 25364.50], ["r-mod", 25354.75], ["max-pain", 25091.05], ["max-gain", 25401.25],
    ]);
    expect(result.find((l) => l.id === "eos")?.name).toContain("25200 PE");
    expect(result.find((l) => l.id === "eor")?.name).toContain("25300 CE");
    expect(result.some((l) => l.price === 25227.5 || l.price === 25272.5)).toBe(false);
  });
  it("omits duplicate safe thresholds, absent results and invalid prices without substituting defaults", () => {
    const input = { ...calculatorFixture, reversalLevels: { ...calculatorFixture.reversalLevels,
      sModerate: 25121.85, rModerate: 25364.50, maxGainTarget: NaN } };
    expect(buildLtpChartLevels(input).map((l) => l.id)).toEqual(["eos", "eor", "max-pain"]);
    expect(buildLtpChartLevels(null)).toEqual([]);
  });
  it("uses the stock engine's four lines exactly and keeps stable line IDs when strikes shift", () => {
    const fourLine = { p2: 1482.85, p1: 1461.15, c1: 1418.45, c2: 1397.65 } as StockFourLineLevels;
    expect(buildLtpChartLevels(calculatorFixture, fourLine).map((l) => l.price)).toEqual([1482.85,1461.15,1418.45,1397.65]);
    expect(buildLtpChartLevels({ ...calculatorFixture, reversalLevels: { ...calculatorFixture.reversalLevels, supportStrike: 25150 } }).map((l) => l.id))
      .toEqual(buildLtpChartLevels(calculatorFixture).map((l) => l.id));
    expect(calculatorUnderlying("NIFTY50")).toBe("NIFTY");
    expect(calculatorUnderlying("banknifty")).toBe("BANKNIFTY");
  });
  it("renders the same COA rule, states, strikes and exact paisa in the real HUD component", () => {
    const html = renderToStaticMarkup(createElement(ChartHeaderHud, {
      instrument: { key: "NIFTY50", symbol: "NIFTY50", name: "NIFTY 50", currency: "INR", category: "INDEX", sector: "Index", defaultPrice: 0, lotSize: 25, tickSize: 0.05 },
      intervalLabel: "1m", hud: null, latestCandle: { open: 25200, high: 25300, low: 25100, close: 25250 }, isLive: true,
      ltpData: calculatorFixture, ltpState: "ready", ltpProvider: "UPSTOX", ltpQuality: "OK",
    }));
    for (const text of ["PURE BULL RUN", "COA #7", "WTT", "25200 PE", "25300 CE", "25,121.85", "25,364.50", "25,091.05", calculatorFixture.coaScenario.recommendation]) expect(html).toContain(text);
  });
});

describe("Indian intraday anchor rejection", () => {
  it.each([60000,180000,300000,900000,1800000,3600000,14400000])("rejects pre-open/after-close anchors at %i ms without removing valid prior sessions", (interval) => {
    expect(isRegularSessionCandle(Date.parse("2026-11-16T00:00:00+05:30"),interval,"NIFTY50")).toBe(false);
    expect(isRegularSessionCandle(Date.parse("2026-11-16T09:14:59+05:30"),interval,"BANKNIFTY")).toBe(false);
    expect(isRegularSessionCandle(Date.parse("2026-11-13T15:29:00+05:30"),interval,"NIFTY50")).toBe(true);
    expect(isRegularSessionCandle(Date.parse("2026-11-16T09:15:00+05:30"),interval,"NIFTY50")).toBe(true);
    expect(isRegularSessionCandle(Date.parse("2026-11-16T15:30:00+05:30"),interval,"NIFTY50")).toBe(false);
  });
  it("preserves legitimate daily/weekly midnight bars and 24/7 instruments", () => {
    const midnight = Date.parse("2026-11-16T00:00:00+05:30");
    expect(isRegularSessionCandle(midnight,86400000,"NIFTY50")).toBe(true);
    expect(isRegularSessionCandle(midnight,604800000,"BANKNIFTY")).toBe(true);
    expect(isRegularSessionCandle(midnight,60000,"BTCUSDT")).toBe(true);
    expect(isRegularSessionCandle(midnight,3600000,"GC1!")).toBe(true);
  });
});
