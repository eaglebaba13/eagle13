import { describe, it, expect } from "vitest";
import { detectFairValueGaps, computeUnicornSetup } from "./fvg-calculator";
import { findInstrument, searchInstruments } from "../market-data/fo-universe";

describe("FVG & ICT Unicorn Calculator", () => {
  it("detects a bullish Fair Value Gap when candle[2].low > candle[0].high", () => {
    const candles = [
      { open: 24000, high: 24020, low: 23980, close: 24010 }, // c0
      { open: 24010, high: 24150, low: 24010, close: 24140 }, // c1 (expansion)
      { open: 24140, high: 24180, low: 24080, close: 24160 }, // c2 (low is 24080 > c0 high 24020)
    ];

    const fvgs = detectFairValueGaps(candles);
    expect(fvgs.length).toBe(1);
    expect(fvgs[0].low).toBe(24020);
    expect(fvgs[0].high).toBe(24080);
    expect(fvgs[0].midpoint).toBe(24050);
  });

  it("detects a bearish Fair Value Gap when candle[0].low > candle[2].high", () => {
    const candles = [
      { open: 24180, high: 24190, low: 24120, close: 24130 }, // c0 (low 24120)
      { open: 24130, high: 24135, low: 23990, close: 24000 }, // c1 (down expansion)
      { open: 24000, high: 24050, low: 23980, close: 24010 }, // c2 (high is 24050 < c0 low 24120)
    ];

    const fvgs = detectFairValueGaps(candles);
    expect(fvgs.length).toBe(1);
    expect(fvgs[0].low).toBe(24050);
    expect(fvgs[0].high).toBe(24120);
    expect(fvgs[0].midpoint).toBe(24085);
  });

  it("computes Unicorn Setup with Entry, SL, and Target for visible candles", () => {
    const candles = Array.from({ length: 25 }, (_, i) => ({
      open: 24000 + i * 10,
      high: 24020 + i * 10,
      low: 23990 + i * 10,
      close: 24015 + i * 10,
    }));

    const setup = computeUnicornSetup(candles, "NIFTY50", 0.05);
    expect(setup).toBeDefined();
    expect(setup?.symbol).toBe("NIFTY50");
    expect(setup?.entryPrice).toBeGreaterThan(0);
    expect(setup?.invalidationSL).toBeGreaterThan(0);
    expect(setup?.targetPrice).toBeGreaterThan(0);
    expect(setup?.rMultiple).toBe(2.5);
  });
});

describe("Universal FO Universe & Search", () => {
  it("finds NIFTY50 and aliases correctly", () => {
    const nifty = findInstrument("NIFTY50");
    expect(nifty).toBeDefined();
    expect(nifty?.name).toBe("NIFTY 50");
    expect(nifty?.category).toBe("INDEX");

    const alias = findInstrument("nifty");
    expect(alias?.symbol).toBe("NIFTY50");
  });

  it("finds single-stock F&O equities like PNB, RELIANCE, AUBANK", () => {
    const pnb = findInstrument("PNB");
    expect(pnb).toBeDefined();
    expect(pnb?.name).toBe("Punjab National Bank");
    expect(pnb?.lotSize).toBe(8000);

    const reliance = findInstrument("RELIANCE");
    expect(reliance).toBeDefined();
    expect(reliance?.lotSize).toBe(500);
  });

  it("searches instruments by sector and query", () => {
    const banks = searchInstruments("Bank", "FO_EQUITY");
    expect(banks.length).toBeGreaterThanOrEqual(10);
    expect(banks.some((b) => b.symbol === "HDFCBANK")).toBe(true);
  });
});
