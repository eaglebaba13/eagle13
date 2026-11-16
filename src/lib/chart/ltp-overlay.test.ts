import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartHeaderHud } from "../../components/chart/ChartHeaderHud";
import { buildLtpChartLevels, buildShiftingChartLevels, calculatorUnderlying } from "./ltp-overlay";
import { isRegularSessionCandle } from "../provider-foundation/indstocks/candle-aggregator";
import type { LtpCalculatorOutput, StockFourLineLevels, StrikeDominance } from "../options/ltp-calculator-engine.server";

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

const challenger = (overrides: Partial<StrikeDominance> = {}): StrikeDominance => ({
  strike: 25250, reversalPrice: 25210.35, volume: 100, volPct: 84.5, oi: 200, oiPct: 79.2, ltp: 39.65, iv: 15,
  isMaxVol: false, isMaxOi: false, isWttVol: false, isWtbVol: false, isWttOi: false, isWtbOi: false, ...overrides,
});

describe("engine WTB/WTT chart levels", () => {
  const input = { ...calculatorFixture,
    putStrikes: [challenger({ isWttVol: true, isWttOi: true })],
    callStrikes: [challenger({ strike: 25350, reversalPrice: 25424.85, isWtbOi: true })],
  };
  it("plots exact flagged PE/CE reversal prices and combines Volume/OI on one line", () => {
    const levels = buildShiftingChartLevels(input);
    expect(levels).toHaveLength(2);
    expect(levels[0]).toMatchObject({ id: "shift-pe-wtt-25250", name: "WTT Support (25250 PE)", price: 25210.35, color: "#06B6D4", dash: true, lineWidth: 2,
      detail: "VOL 84.5% / OI 79.2%" });
    expect(levels[1]).toMatchObject({ id: "shift-ce-wtb-25350", name: "WTB Resistance (25350 CE)", price: 25424.85, color: "#F43F5E", detail: "OI 79.2%" });
    expect(buildLtpChartLevels(input).filter((l) => l.id.startsWith("shift-"))).toEqual(levels);
  });
  it("retains opposed Volume/OI flags and stable identities as percentages change", () => {
    const mixed = { ...calculatorFixture, putStrikes: [challenger({ isWttVol: true, isWtbOi: true })] };
    const first = buildShiftingChartLevels(mixed);
    expect(first.map((l) => l.id)).toEqual(["shift-pe-wtt-25250", "shift-pe-wtb-25250"]);
    const next = buildShiftingChartLevels({ ...mixed, putStrikes: [challenger({ isWttVol: true, isWtbOi: true, volPct: 91.3 })] });
    expect(next.map((l) => l.id)).toEqual(first.map((l) => l.id));
    expect(next[0].detail).toBe("VOL 91.3%");
  });
  it("does not manufacture flags from percentages or substitute a strike for missing reversal prices", () => {
    expect(buildShiftingChartLevels({ ...calculatorFixture, putStrikes: [
      challenger({ volPct: 99.9, oiPct: 100 }), challenger({ isWtbVol: true, reversalPrice: NaN }),
      challenger({ isWttOi: true, reversalPrice: 0 }),
    ] })).toEqual([]);
    expect(buildShiftingChartLevels(null)).toEqual([]);
  });
  it("adds flagged levels alongside stock four-line prices", () => {
    const stock = { p2: 1482.85, p1: 1461.15, c1: 1418.45, c2: 1397.65 } as StockFourLineLevels;
    expect(buildLtpChartLevels(input, stock).map((l) => l.id)).toEqual(["p2", "p1", "c1", "c2", "shift-pe-wtt-25250", "shift-ce-wtb-25350"]);
  });
  it("renders active WTB/WTT prices and factor labels in the actual HUD", () => {
    const html = renderToStaticMarkup(createElement(ChartHeaderHud, {
      instrument: { key: "NIFTY50", symbol: "NIFTY50", name: "NIFTY 50", currency: "INR", category: "INDEX", sector: "Index", defaultPrice: 0, lotSize: 25, tickSize: 0.05 },
      intervalLabel: "1m", hud: null, latestCandle: { open: 25200, high: 25300, low: 25100, close: 25250 }, isLive: true,
      ltpData: input, ltpState: "ready",
    }));
    for (const value of ["WTT Support (25250 PE)", "WTB Resistance (25350 CE)", "25,210.35", "25,424.85", "VOL 84.5% / OI 79.2%"]) expect(html).toContain(value);
  });
});

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
