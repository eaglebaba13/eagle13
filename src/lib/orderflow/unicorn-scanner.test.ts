import { describe, it, expect } from "vitest";
import {
  calculateSessionLiquidity,
  type SessionLiquidityLevels,
} from "./session-liquidity";
import {
  detectFairValueGaps,
  detectUnicornSetup,
  formatUnicornTelegramAlert,
  getUnicornRadarSignals,
  SCANNER_UNIVERSE,
  type UnicornSetup,
} from "./unicorn-scanner.server";
import type { OrderFlowCandle } from "./volume-profile-engine";

describe("Session Liquidity Engine (PDH/PDL & PWH/PWL)", () => {
  it("safely handles empty candles", () => {
    const res = calculateSessionLiquidity([], "NIFTY50");
    expect(res).toBeNull();
  });

  it("calculates session liquidity levels with distances and nearest magnet", () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const candles: OrderFlowCandle[] = [
      // Day 1 (Previous Day)
      {
        time: now - dayMs * 1.5,
        open: 24350,
        high: 24600, // PDH
        low: 24200,  // PDL
        close: 24450,
        volume: 50000,
      },
      // Day 2 (Current Day)
      {
        time: now - 3600_000,
        open: 24460,
        high: 24550,
        low: 24420,
        close: 24520, // Current close
        volume: 25000,
      },
    ];

    const liquidity = calculateSessionLiquidity(candles, "NIFTY50", 24520);
    expect(liquidity).not.toBeNull();
    if (!liquidity) return;

    expect(liquidity.symbol).toBe("NIFTY50");
    expect(liquidity.pdh).toBe(24600);
    expect(liquidity.pdl).toBe(24200);
    expect(liquidity.currentPrice).toBe(24520);

    // Distance to PDH: 24600 - 24520 = 80 points
    expect(liquidity.distanceToPdh.points).toBe(80);
    expect(liquidity.distanceToPdh.percent).toBeCloseTo((80 / 24520) * 100, 2);

    // Distance to PDL: 24520 - 24200 = 320 points
    expect(liquidity.distanceToPdl.points).toBe(320);

    // Nearest magnet should be PDH (80 pts vs 320 pts)
    expect(liquidity.nearestMagnet.levelName).toBe("PDH");
    expect(liquidity.nearestMagnet.price).toBe(24600);
    expect(liquidity.nearestMagnet.distancePoints).toBe(80);
  });
});

describe("ICT Fair Value Gap (FVG) Engine", () => {
  it("detects bullish FVG (candle[2].low > candle[0].high)", () => {
    const baseTime = 1700000000000;
    const candles: OrderFlowCandle[] = [
      // Candle 0
      { time: baseTime, open: 24400, high: 24420, low: 24390, close: 24410, volume: 1000 },
      // Candle 1 (Displacement candle)
      { time: baseTime + 300_000, open: 24415, high: 24550, low: 24410, close: 24540, volume: 5000 },
      // Candle 2 (Unfilled gap between candle 0 high and candle 2 low)
      { time: baseTime + 600_000, open: 24545, high: 24580, low: 24480, close: 24570, volume: 2000 },
    ];

    const fvgs = detectFairValueGaps(candles);
    expect(fvgs.length).toBeGreaterThan(0);
    const bullishFvg = fvgs[0];
    expect(bullishFvg.low).toBe(24420); // Candle 0 high
    expect(bullishFvg.high).toBe(24480); // Candle 2 low
    expect(bullishFvg.midpoint).toBe(24450); // 50% Consequent Encroachment
  });

  it("detects bearish FVG (candle[2].high < candle[0].low)", () => {
    const baseTime = 1700000000000;
    const candles: OrderFlowCandle[] = [
      // Candle 0
      { time: baseTime, open: 24600, high: 24620, low: 24580, close: 24590, volume: 1000 },
      // Candle 1 (Displacement drop)
      { time: baseTime + 300_000, open: 24585, high: 24590, low: 24450, close: 24460, volume: 6000 },
      // Candle 2
      { time: baseTime + 600_000, open: 24455, high: 24510, low: 24440, close: 24480, volume: 2000 },
    ];

    const fvgs = detectFairValueGaps(candles);
    expect(fvgs.length).toBeGreaterThan(0);
    const bearishFvg = fvgs[0];
    expect(bearishFvg.low).toBe(24510); // Candle 2 high
    expect(bearishFvg.high).toBe(24580); // Candle 0 low
    expect(bearishFvg.midpoint).toBe(24545);
  });
});

describe("ICT Unicorn Multi-Asset Setup Detection & Alerting", () => {
  it("formats Telegram alert matching canonical institutional layout", () => {
    const sampleSetup: UnicornSetup = {
      id: "unicorn-test-1",
      symbol: "NIFTY50",
      displayName: "NIFTY 50",
      category: "INDEX",
      timeframe: "5m",
      direction: "BULLISH",
      status: "Retest Ready",
      currentPrice: 24535,
      sweepLevel: 24490,
      sweepType: "PDL",
      mssLevel: 24520,
      fvgZone: { low: 24520, high: 24535 },
      breakerZone: { low: 24515, high: 24525 },
      triggerZone: { low: 24520, high: 24535 },
      entryPrice: 24535,
      invalidationSL: 24490,
      targetPrice: 24610,
      riskRewardRatio: 2.8,
      confidenceScore: 92,
      detectedAt: new Date().toISOString(),
      timeElapsed: "2m ago",
    };

    const formatted = formatUnicornTelegramAlert(sampleSetup);
    expect(formatted).toContain("🦄 [UNICORN SETUP CONFIRMED] NIFTY 50 (5m)");
    expect(formatted).toContain("• Setup: Bullish Liquidity Sweep + MSS + FVG Retest");
    expect(formatted).toContain("• Trigger Zone: 24,520 - 24,535 (Discount FVG)");
    expect(formatted).toContain("• Invalidation / SL: 24,490 (Below Sweep Low)");
    expect(formatted).toContain("• Target (ERL): 24,610 (PDL Magnet)");
    expect(formatted).toContain("• Risk/Reward: 1:2.8 | Confidence: 92%");
  });

  it("scanner universe covers Indices, Sectors, F&O Equities, ETFs, and Crypto/Commodities", () => {
    expect(SCANNER_UNIVERSE.length).toBeGreaterThanOrEqual(60);

    const categories = new Set(SCANNER_UNIVERSE.map((i) => i.category));
    expect(categories.has("INDEX")).toBe(true);
    expect(categories.has("SECTOR")).toBe(true);
    expect(categories.has("FO_EQUITY")).toBe(true);
    expect(categories.has("ETF")).toBe(true);
    expect(categories.has("COMMODITY_CRYPTO")).toBe(true);

    const nifty = SCANNER_UNIVERSE.find((i) => i.symbol === "NIFTY50");
    expect(nifty).toBeDefined();
    expect(nifty?.category).toBe("INDEX");

    const gold = SCANNER_UNIVERSE.find((i) => i.symbol === "GC1!");
    expect(gold).toBeDefined();
    expect(gold?.currency).toBe("$");
  });

  it("retrieves curated active radar setups across asset classes with calibrated market prices", async () => {
    const radar = await getUnicornRadarSignals(true);
    expect(radar.length).toBeGreaterThan(0);

    const niftySetup = radar.find((r) => r.symbol === "NIFTY50");
    expect(niftySetup).toBeDefined();
    expect(niftySetup?.direction).toBe("BULLISH");
    expect(niftySetup?.status).toBe("Retest Ready");
    expect(niftySetup?.currentPrice).toBeGreaterThan(24000);
    expect(niftySetup?.currency).toBe("₹");

    const goldSetup = radar.find((r) => r.symbol === "GC1!");
    expect(goldSetup).toBeDefined();
    expect(goldSetup?.category).toBe("COMMODITY_CRYPTO");
    expect(goldSetup?.currency).toBe("$");
    expect(goldSetup?.currentPrice).toBeGreaterThan(3500); // Gold at ~$4,033+

    const btcSetup = radar.find((r) => r.symbol === "BTCUSDT");
    expect(btcSetup).toBeDefined();
    expect(btcSetup?.status).toBe("Triggered");
    expect(btcSetup?.currency).toBe("$");
    expect(btcSetup?.currentPrice).toBeGreaterThan(60000); // BTC at ~$72,800+

    const relianceSetup = radar.find((r) => r.symbol === "RELIANCE");
    expect(relianceSetup).toBeDefined();
    expect(relianceSetup?.currentPrice).toBeLessThan(2000); // Post 1:1 bonus (~₹1,324)

    const pnbSetup = radar.find((r) => r.symbol === "PNB");
    expect(pnbSetup).toBeDefined();
    expect(pnbSetup?.currentPrice).toBeGreaterThan(120); // PNB at ~₹132
  });
});
