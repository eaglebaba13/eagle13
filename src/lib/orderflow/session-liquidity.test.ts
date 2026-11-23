import { describe, it, expect } from "vitest";
import { calculateSessionLiquidity } from "./session-liquidity";
import { matchMarketItem, type MarketBlock } from "../live-levels.functions";

describe("Session Liquidity & Canonical Market Matching Suite", () => {
  const sampleMarkets: MarketBlock[] = [
    {
      key: "NIFTY",
      name: "NIFTY 50",
      symbol: "^NSEI",
      currency: "₹",
      crypto: false,
      livePrice: 25349.65,
      prevClose: 25300.0,
      prevDate: "2026-11-20",
      change: 49.65,
      changePct: 0.2,
      marketState: "CLOSED",
      cycles: { base: 25000, upper: 25500, lower: 24500 },
      planets: [],
    },
    {
      key: "GOLD",
      name: "GOLD",
      symbol: "GC=F",
      currency: "$",
      crypto: false,
      livePrice: 3623.5,
      prevClose: 3615.0,
      prevDate: "2026-11-20",
      change: 8.5,
      changePct: 0.24,
      marketState: "OPEN",
      cycles: { base: 3600, upper: 3700, lower: 3500 },
      planets: [],
    },
    {
      key: "SILVER",
      name: "SILVER",
      symbol: "SI=F",
      currency: "$",
      crypto: false,
      livePrice: 32.8,
      prevClose: 32.5,
      prevDate: "2026-11-20",
      change: 0.3,
      changePct: 0.92,
      marketState: "OPEN",
      cycles: { base: 32, upper: 34, lower: 30 },
      planets: [],
    },
    {
      key: "BTC",
      name: "BITCOIN",
      symbol: "BTC-USD",
      currency: "$",
      crypto: true,
      livePrice: 91500.0,
      prevClose: 90000.0,
      prevDate: "2026-11-20",
      change: 1500.0,
      changePct: 1.67,
      marketState: "OPEN",
      cycles: { base: 90000, upper: 95000, lower: 85000 },
      planets: [],
    },
  ];

  describe("1. Canonical Market Matching", () => {
    it("maps GC1! and COMEX GOLD aliases to GOLD market block", () => {
      const match1 = matchMarketItem(sampleMarkets, "GC1!", "COMEX GOLD (GC1!)");
      expect(match1).toBeDefined();
      expect(match1?.key).toBe("GOLD");
      expect(match1?.livePrice).toBe(3623.5);

      const match2 = matchMarketItem(sampleMarkets, "XAUUSDT");
      expect(match2).toBeDefined();
      expect(match2?.key).toBe("GOLD");
    });

    it("maps SI1! and SILVER aliases to SILVER market block", () => {
      const match = matchMarketItem(sampleMarkets, "SI1!", "COMEX SILVER (SI1!)");
      expect(match).toBeDefined();
      expect(match?.key).toBe("SILVER");
    });

    it("maps NIFTY50 alias to NIFTY market block", () => {
      const match = matchMarketItem(sampleMarkets, "NIFTY50");
      expect(match).toBeDefined();
      expect(match?.key).toBe("NIFTY");
    });

    it("maps BTCUSDT to BTC market block", () => {
      const match = matchMarketItem(sampleMarkets, "BTCUSDT");
      expect(match).toBeDefined();
      expect(match?.key).toBe("BTC");
    });
  });

  describe("2. Session Liquidity Low <= High Invariant", () => {
    it("enforces pdl <= pdh and pwl <= pwh on normal multi-day candles", () => {
      const candles = [
        { time: Date.parse("2026-11-19T10:00:00Z"), open: 3600, high: 3650, low: 3580, close: 3620, volume: 100 },
        { time: Date.parse("2026-11-20T10:00:00Z"), open: 3620, high: 3660, low: 3610, close: 3640, volume: 150 },
      ];

      const res = calculateSessionLiquidity(candles, "GC1!", 3640);
      expect(res).not.toBeNull();
      expect(res!.pdl).toBeLessThanOrEqual(res!.pdh);
      expect(res!.pwl).toBeLessThanOrEqual(res!.pwh);
    });

    it("sanitizes anomalous candles where high < low without throwing or inverting", () => {
      // Inverted candles where high was mistakenly smaller than low
      const invertedCandles = [
        { time: Date.parse("2026-11-19T10:00:00Z"), open: 3650, high: 3580, low: 3650, close: 3600, volume: 100 },
        { time: Date.parse("2026-11-20T10:00:00Z"), open: 3640, high: 3610, low: 3660, close: 3620, volume: 150 },
      ];

      const res = calculateSessionLiquidity(invertedCandles, "GC1!", 3620);
      expect(res).not.toBeNull();
      expect(res!.pdl).toBeLessThanOrEqual(res!.pdh);
      expect(res!.pwl).toBeLessThanOrEqual(res!.pwh);
    });

    it("handles single-day session with positive range buffer", () => {
      const singleDay = [
        { time: Date.parse("2026-11-20T10:00:00Z"), open: 3620, high: 3630, low: 3615, close: 3625, volume: 100 },
      ];

      const res = calculateSessionLiquidity(singleDay, "GC1!", 3625);
      expect(res).not.toBeNull();
      expect(res!.pdl).toBeLessThanOrEqual(res!.pdh);
      expect(res!.pwl).toBeLessThanOrEqual(res!.pwh);
    });
  });
});
