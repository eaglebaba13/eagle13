import { describe, it, expect } from "vitest";
import {
  computeVolumeProfile,
  getDefaultBinSize,
  type OrderFlowCandle,
} from "./volume-profile-engine";
import {
  generateVolumeProfileSignals,
  formatVolumeProfileTelegramAlert,
} from "./volume-profile-signals";

describe("Volume Profile & Order Flow Quantitative Engine", () => {
  it("resolves canonical bin sizes across instruments", () => {
    expect(getDefaultBinSize("NIFTY50")).toBe(5.0);
    expect(getDefaultBinSize("BANKNIFTY")).toBe(10.0);
    expect(getDefaultBinSize("SENSEX")).toBe(10.0);
    expect(getDefaultBinSize("GC1!")).toBe(0.5);
    expect(getDefaultBinSize("XAUUSD")).toBe(0.5);
    expect(getDefaultBinSize("GOLD")).toBe(0.5);
  });

  it("handles empty or degenerate candle series safely", () => {
    const emptyProfile = computeVolumeProfile([], { symbol: "NIFTY50" });
    expect(emptyProfile.totalVolume).toBe(0);
    expect(emptyProfile.bins).toHaveLength(0);
    expect(emptyProfile.shape).toBe("D_SHAPE");
  });

  it("computes accurate POC and Value Area (70%) on normal distribution", () => {
    const candles: OrderFlowCandle[] = [];
    const baseTime = 1700000000000;
    // Construct symmetric bell curve around 24,500
    // Price range: 24,400 to 24,600 (bins of 5pt)
    for (let p = 24400; p <= 24600; p += 10) {
      const distFromCenter = Math.abs(p - 24500);
      const vol = Math.max(100, Math.round(5000 * Math.exp(-(distFromCenter ** 2) / (2 * 40 ** 2))));
      candles.push({
        time: baseTime + (p - 24400) * 60_000,
        open: p,
        high: p + 8,
        low: p - 2,
        close: p + 5,
        volume: vol,
      });
    }

    const profile = computeVolumeProfile(candles, { symbol: "NIFTY50", binSize: 5 });

    expect(profile.totalVolume).toBeGreaterThan(0);
    // POC should be centered near 24,500
    expect(profile.poc).toBeGreaterThanOrEqual(24490);
    expect(profile.poc).toBeLessThanOrEqual(24510);

    // Value Area must contain approximately 70% of total volume
    expect(profile.val).toBeLessThan(profile.poc);
    expect(profile.vah).toBeGreaterThan(profile.poc);
    expect(profile.valueAreaPercentage).toBeGreaterThanOrEqual(68);
    expect(profile.valueAreaPercentage).toBeLessThanOrEqual(80);

    // Symmetric bell curve must be classified as D-Shape Rotation
    expect(profile.shape).toBe("D_SHAPE");
    expect(profile.shapeBias).toBe("NEUTRAL");
  });

  it("classifies P-Shape (Bullish) when POC and heavy volume cluster in upper 35%", () => {
    const candles: OrderFlowCandle[] = [];
    const baseTime = 1700000000000;

    // Thin stem at bottom (24,000 to 24,300 with low volume: 100)
    for (let p = 24000; p < 24300; p += 20) {
      candles.push({
        time: baseTime + p * 1000,
        open: p,
        high: p + 18,
        low: p,
        close: p + 15,
        volume: 100,
      });
    }

    // Heavy bulge at the top (24,350 to 24,500 with massive volume: 5,000 to 10,000)
    for (let p = 24350; p <= 24500; p += 10) {
      const vol = p >= 24440 && p <= 24480 ? 10000 : 4000;
      candles.push({
        time: baseTime + p * 1000,
        open: p,
        high: p + 9,
        low: p - 1,
        close: p + 5,
        volume: vol,
      });
    }

    const profile = computeVolumeProfile(candles, { symbol: "NIFTY50", binSize: 5 });

    expect(profile.shape).toBe("P_SHAPE");
    expect(profile.shapeBias).toBe("BULLISH");
    expect(profile.shapeLabel).toBe("P-Shape (Bullish)");
    expect(profile.relativePocPosition).toBeGreaterThanOrEqual(0.65);
    expect(profile.poc).toBeGreaterThanOrEqual(24440);
  });

  it("classifies b-Shape (Bearish) when POC and heavy volume cluster in lower 35%", () => {
    const candles: OrderFlowCandle[] = [];
    const baseTime = 1700000000000;

    // Heavy bulge at bottom (24,000 to 24,150 with massive volume)
    for (let p = 24000; p <= 24150; p += 10) {
      const vol = p >= 24030 && p <= 24080 ? 12000 : 4000;
      candles.push({
        time: baseTime + p * 1000,
        open: p,
        high: p + 9,
        low: p - 1,
        close: p + 5,
        volume: vol,
      });
    }

    // Thin stem at top (24,200 to 24,500 with low volume: 100)
    for (let p = 24200; p <= 24500; p += 20) {
      candles.push({
        time: baseTime + p * 1000,
        open: p,
        high: p + 18,
        low: p,
        close: p + 15,
        volume: 100,
      });
    }

    const profile = computeVolumeProfile(candles, { symbol: "NIFTY50", binSize: 5 });

    expect(profile.shape).toBe("B_SHAPE_BEARISH");
    expect(profile.shapeBias).toBe("BEARISH");
    expect(profile.shapeLabel).toBe("b-Shape (Bearish)");
    expect(profile.relativePocPosition).toBeLessThanOrEqual(0.35);
    expect(profile.poc).toBeLessThanOrEqual(24100);
  });

  it("detects High Volume Nodes (HVN) and Low Volume Nodes (LVN)", () => {
    const candles: OrderFlowCandle[] = [];
    const baseTime = 1700000000000;

    // Construct a double distribution profile with two distinct peaks and a middle valley:
    // Peak 1: 50,000 (volume 8,000)
    // Valley (LVN): 50,200 (volume 200)
    // Peak 2: 50,400 (volume 9,000)
    for (let p = 49800; p <= 50600; p += 20) {
      let vol = 1000;
      if (Math.abs(p - 50000) <= 40) vol = 8000;
      else if (Math.abs(p - 50200) <= 30) vol = 150;
      else if (Math.abs(p - 50400) <= 40) vol = 9000;

      candles.push({
        time: baseTime + (p - 49800) * 60_000,
        open: p,
        high: p + 15,
        low: p - 2,
        close: p + 10,
        volume: vol,
      });
    }

    const profile = computeVolumeProfile(candles, { symbol: "BANKNIFTY", binSize: 10 });

    expect(profile.hvns.length).toBeGreaterThanOrEqual(1);
    expect(profile.lvns.length).toBeGreaterThanOrEqual(1);

    // Verify LVN is near 50,200
    const hasValley = profile.lvns.some((l) => Math.abs(l.price - 50200) <= 60);
    expect(hasValley).toBe(true);
  });

  it("computes 0.5-pt binning accurately for COMEX Gold (GC1! / XAUUSD)", () => {
    const candles: OrderFlowCandle[] = [];
    const baseTime = 1700000000000;

    // Gold ranging between 2,735.00 and 2,750.00
    for (let p = 2735.0; p <= 2750.0; p += 1.0) {
      const vol = p === 2740.0 ? 5000 : 500;
      candles.push({
        time: baseTime + (p - 2735) * 60_000,
        open: p,
        high: p + 0.8,
        low: p - 0.2,
        close: p + 0.5,
        volume: vol,
      });
    }

    const profile = computeVolumeProfile(candles, { symbol: "GC1!", binSize: 0.5 });

    expect(profile.binSize).toBe(0.5);
    expect(profile.poc).toBeGreaterThanOrEqual(2739.5);
    expect(profile.poc).toBeLessThanOrEqual(2740.5);
    expect(profile.bins.length).toBeGreaterThanOrEqual(25);
  });

  it("computes 10-pt binning accurately for BSE SENSEX", () => {
    const candles: OrderFlowCandle[] = [];
    const baseTime = 1700000000000;

    // SENSEX ranging from 80,000 to 80,500 in 10-pt increments
    for (let p = 80000; p <= 80500; p += 10) {
      const vol = p === 80250 ? 15000 : 1500;
      candles.push({
        time: baseTime + (p - 80000) * 1000,
        open: p,
        high: p + 8,
        low: p - 2,
        close: p + 5,
        volume: vol,
      });
    }

    const profile = computeVolumeProfile(candles, { symbol: "SENSEX", binSize: 10 });
    expect(profile.symbol).toBe("SENSEX");
    expect(profile.binSize).toBe(10);
    expect(profile.poc).toBeGreaterThanOrEqual(80240);
    expect(profile.poc).toBeLessThanOrEqual(80260);
    expect(profile.val).toBeLessThan(profile.poc);
    expect(profile.vah).toBeGreaterThan(profile.poc);
  });
});

describe("Volume Profile Execution Signals Engine", () => {
  it("triggers LVN_MOMENTUM_BREAKOUT on candle close beyond LVN with volume surge", () => {
    const baseTime = 1700000000000;
    // Build a profile with an LVN at 24,550 and an HVN at 24,620
    const mockProfile = {
      symbol: "NIFTY50" as const,
      sessionOpenTime: baseTime,
      sessionEndTime: baseTime + 3600000,
      totalVolume: 50000,
      totalCandles: 60,
      binSize: 5,
      minPrice: 24400,
      maxPrice: 24700,
      range: 300,
      poc: 24480,
      pocVolume: 8000,
      vah: 24650,
      val: 24450,
      valueAreaVolume: 35000,
      valueAreaPercentage: 70,
      bins: [],
      hvns: [
        { price: 24480, volume: 8000 },
        { price: 24620, volume: 7500 },
      ],
      lvns: [{ price: 24550, volume: 300 }],
      shape: "P_SHAPE" as const,
      shapeLabel: "P-Shape (Bullish)" as const,
      shapeBias: "BULLISH" as const,
      relativePocPosition: 0.72,
      summary: "Bullish test",
    };

    // Historical candles averaging 1,000 vol
    const candles: OrderFlowCandle[] = [];
    for (let i = 0; i < 10; i++) {
      candles.push({
        time: baseTime + i * 60_000,
        open: 24520 + i,
        high: 24525 + i,
        low: 24515 + i,
        close: 24522 + i,
        volume: 1000,
      });
    }

    // Prev candle below LVN (24,545)
    candles.push({
      time: baseTime + 11 * 60_000,
      open: 24535,
      high: 24548,
      low: 24530,
      close: 24545,
      volume: 1200,
    });

    // Current breakout candle: closes decisively above LVN high (24,562) with 2.5x volume expansion
    candles.push({
      time: baseTime + 12 * 60_000,
      open: 24545,
      high: 24565,
      low: 24542,
      close: 24562,
      volume: 2500, // 2.5x average
    });

    const signals = generateVolumeProfileSignals(mockProfile, candles);

    expect(signals.length).toBeGreaterThan(0);
    const breakoutSignal = signals.find((s) => s.type === "LVN_MOMENTUM_BREAKOUT");
    expect(breakoutSignal).toBeDefined();
    expect(breakoutSignal?.direction).toBe("BULLISH");
    expect(breakoutSignal?.triggerLevel).toBe(24550);
    expect(breakoutSignal?.targetPrice).toBe(24620); // Targeting next HVN magnet
    expect(breakoutSignal?.confirmation.candleConfirmed).toBe(true);
    expect(breakoutSignal?.confirmation.volumeSurgeRatio).toBeGreaterThan(1.5);
  });

  it("triggers HVN_LIQUIDITY_SWEEP_REVERSAL on wick rejection (>50%) at key node", () => {
    const baseTime = 1700000000000;
    const mockProfile = {
      symbol: "GC1!" as const,
      sessionOpenTime: baseTime,
      sessionEndTime: baseTime + 3600000,
      totalVolume: 80000,
      totalCandles: 60,
      binSize: 0.5,
      minPrice: 2720,
      maxPrice: 2760,
      range: 40,
      poc: 2740,
      pocVolume: 12000,
      vah: 2750,
      val: 2730,
      valueAreaVolume: 56000,
      valueAreaPercentage: 70,
      bins: [],
      hvns: [{ price: 2740, volume: 12000 }],
      lvns: [],
      shape: "D_SHAPE" as const,
      shapeLabel: "D-Shape (Rotation)" as const,
      shapeBias: "NEUTRAL" as const,
      relativePocPosition: 0.5,
      summary: "Neutral test",
    };

    const candles: OrderFlowCandle[] = [];
    for (let i = 0; i < 10; i++) {
      candles.push({
        time: baseTime + i * 60_000,
        open: 2735 + i * 0.3,
        high: 2737 + i * 0.3,
        low: 2734 + i * 0.3,
        close: 2736 + i * 0.3,
        volume: 800,
      });
    }

    // Candle sweeps above POC 2,740 up to 2,744, but gets rejected sharply down to close at 2,739
    // Upper wick: 2744 - 2739.2 = 4.8 out of range 5.0 (96% upper wick trap)
    candles.push({
      time: baseTime + 11 * 60_000,
      open: 2738.5,
      high: 2744.0,
      low: 2738.0,
      close: 2738.8,
      volume: 1800,
    });

    const signals = generateVolumeProfileSignals(mockProfile, candles);

    expect(signals.length).toBeGreaterThan(0);
    const sweepSignal = signals.find((s) => s.type === "HVN_LIQUIDITY_SWEEP_REVERSAL");
    expect(sweepSignal).toBeDefined();
    expect(sweepSignal?.direction).toBe("BEARISH");
    expect(sweepSignal?.triggerLevel).toBe(2740); // POC rejection
    expect(sweepSignal?.confirmation.candleConfirmed).toBe(true);
    expect(sweepSignal?.confirmation.wickRatio).toBeGreaterThan(0.5);
  });

  it("enforces candle confirmation and rejects naked touches", () => {
    const baseTime = 1700000000000;
    const mockProfile = {
      symbol: "NIFTY50" as const,
      sessionOpenTime: baseTime,
      sessionEndTime: baseTime + 3600000,
      totalVolume: 50000,
      totalCandles: 60,
      binSize: 5,
      minPrice: 24400,
      maxPrice: 24700,
      range: 300,
      poc: 24500,
      pocVolume: 8000,
      vah: 24600,
      val: 24400,
      valueAreaVolume: 35000,
      valueAreaPercentage: 70,
      bins: [],
      hvns: [{ price: 24500, volume: 8000 }],
      lvns: [{ price: 24550, volume: 300 }],
      shape: "D_SHAPE" as const,
      shapeLabel: "D-Shape (Rotation)" as const,
      shapeBias: "NEUTRAL" as const,
      relativePocPosition: 0.5,
      summary: "Neutral",
    };

    // A candle that only touches LVN with normal volume and closes inside it without breakout
    const candles: OrderFlowCandle[] = [
      { time: 1, open: 24540, high: 24545, low: 24535, close: 24540, volume: 1000 },
      { time: 2, open: 24540, high: 24545, low: 24535, close: 24540, volume: 1000 },
      { time: 3, open: 24540, high: 24552, low: 24538, close: 24548, volume: 900 }, // Naked touch inside LVN, no surge, no close beyond
    ];

    const signals = generateVolumeProfileSignals(mockProfile, candles);
    expect(signals).toHaveLength(0); // Naked touch safely rejected
  });

  it("formats institutional Telegram alert with profile shape bias and target boundaries", () => {
    const mockSignal = {
      id: "sig-test-1",
      symbol: "NIFTY50" as const,
      type: "LVN_MOMENTUM_BREAKOUT" as const,
      direction: "BULLISH" as const,
      price: 24555,
      timestamp: 1700000000000,
      triggerLevel: 24550,
      targetPrice: 24620,
      stopLoss: 24520,
      riskRewardRatio: 2.33,
      shapeBias: "BULLISH" as const,
      profileShape: "P_SHAPE" as const,
      confirmation: {
        candleConfirmed: true,
        candleType: "BREAKOUT_CLOSE" as const,
        volumeSurgeRatio: 2.1,
        wickRatio: 0.12,
      },
      headline: "LVN Momentum Breakout: NIFTY 24,550 level cleared (Target: 24,620 HVN)",
      description: "Price cleared void.",
      recommendedAction: "BUY CALL above 24,550.",
    };

    const rendered = formatVolumeProfileTelegramAlert(mockSignal);
    expect(rendered).toContain("[VOLUME PROFILE ALERT]");
    expect(rendered).toContain("LVN Momentum Breakout: NIFTY 24,550 level cleared");
    expect(rendered).toContain("P_SHAPE (BULLISH)");
    expect(rendered).toContain("Target Price: 24620");
    expect(rendered).toContain("Stop Loss: 24520");
  });
});
