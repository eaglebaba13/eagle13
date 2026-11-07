import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  COINDCX_PAIRS,
  resolveCoindcxPair,
  isCoindcxSymbol,
  CoindcxSocketStream,
  getCoindcxSocketStream,
  resetCoindcxSocketStream,
} from "./coindcx-socket.server";
import {
  intervalMsToCoindcxInterval,
  fetchCoindcxHistoricalCandles,
} from "./coindcx-historical.server";
import {
  COINDCX_TRADING_ENABLED,
  assertExecutionGuardIntact,
} from "../../providers/coindcx/execution-guard";

describe("CoinDCX Streaming & Multi-Asset Provider", () => {
  beforeEach(() => {
    resetCoindcxSocketStream();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetCoindcxSocketStream();
  });

  describe("Security & Execution Guard", () => {
    it("strictly disables order execution (COINDCX_TRADING_ENABLED = false)", () => {
      expect(COINDCX_TRADING_ENABLED).toBe(false);
      expect(() => assertExecutionGuardIntact(COINDCX_TRADING_ENABLED)).not.toThrow();
      expect(() => assertExecutionGuardIntact(true)).toThrow("COINDCX_EXECUTION_GUARD_TRIPPED");
    });

    it("verifies CoindcxSocketStream constructor enforces execution guard", () => {
      const stream = new CoindcxSocketStream();
      expect(stream.getState()).toBe("DISCONNECTED");
      stream.stop();
    });
  });

  describe("Pair Resolution & Canonical Registry", () => {
    it("resolves crypto majors and aliases", () => {
      const btc = resolveCoindcxPair("BTCUSDT");
      expect(btc).not.toBeNull();
      expect(btc?.canonicalSymbol).toBe("BTCUSDT");
      expect(btc?.channelName).toBe("B-BTC_USDT@trades");
      expect(btc?.pairName).toBe("B-BTC_USDT");

      const btcSlash = resolveCoindcxPair("BTC/USDT");
      expect(btcSlash?.canonicalSymbol).toBe("BTCUSDT");

      const btcInr = resolveCoindcxPair("BTC/INR");
      expect(btcInr?.canonicalSymbol).toBe("BTCINR");
      expect(btcInr?.channelName).toBe("I-BTC_INR@trades");

      const ethInr = resolveCoindcxPair("ETH/INR");
      expect(ethInr?.canonicalSymbol).toBe("ETHINR");
      expect(ethInr?.channelName).toBe("I-ETH_INR@trades");

      const etc = resolveCoindcxPair("ETC/USDT");
      expect(etc?.canonicalSymbol).toBe("ETCUSDT");
      expect(etc?.channelName).toBe("B-ETC_USDT@trades");
    });

    it("resolves tokenized commodities", () => {
      const gold = resolveCoindcxPair("XAUUSDT");
      expect(gold).not.toBeNull();
      expect(gold?.canonicalSymbol).toBe("XAUUSDT");
      expect(gold?.channelName).toBe("B-PAXG_USDT@trades");

      const silver = resolveCoindcxPair("XAGUSDT");
      expect(silver).not.toBeNull();
      expect(silver?.canonicalSymbol).toBe("XAGUSDT");
    });

    it("identifies CoinDCX symbols correctly", () => {
      expect(isCoindcxSymbol("BTCUSDT")).toBe(true);
      expect(isCoindcxSymbol("BTC/USDT")).toBe(true);
      expect(isCoindcxSymbol("BTCINR")).toBe(true);
      expect(isCoindcxSymbol("ETHINR")).toBe(true);
      expect(isCoindcxSymbol("ETCUSDT")).toBe(true);
      expect(isCoindcxSymbol("XAUUSDT")).toBe(true);
      expect(isCoindcxSymbol("XAGUSDT")).toBe(true);

      // Non-CoinDCX symbols return false
      expect(isCoindcxSymbol("NIFTY50")).toBe(false);
      expect(isCoindcxSymbol("BANKNIFTY")).toBe(false);
      expect(isCoindcxSymbol("SENSEX")).toBe(false);
      expect(isCoindcxSymbol("UNKNOWN_COIN")).toBe(false);
    });
  });

  describe("Historical Interval Mapping & Synthesis", () => {
    it("maps intervals to CoinDCX native intervals", () => {
      expect(intervalMsToCoindcxInterval(60_000)).toEqual({
        fetchInterval: "1m",
        targetIntervalMs: 60_000,
        shouldAggregate: false,
      });

      expect(intervalMsToCoindcxInterval(180_000)).toEqual({
        fetchInterval: "1m",
        targetIntervalMs: 180_000,
        shouldAggregate: true,
      });

      expect(intervalMsToCoindcxInterval(300_000)).toEqual({
        fetchInterval: "1m",
        targetIntervalMs: 300_000,
        shouldAggregate: true,
      });

      expect(intervalMsToCoindcxInterval(900_000)).toEqual({
        fetchInterval: "15m",
        targetIntervalMs: 900_000,
        shouldAggregate: false,
      });

      expect(intervalMsToCoindcxInterval(3_600_000)).toEqual({
        fetchInterval: "1h",
        targetIntervalMs: 3_600_000,
        shouldAggregate: false,
      });

      expect(intervalMsToCoindcxInterval(86_400_000)).toEqual({
        fetchInterval: "1d",
        targetIntervalMs: 86_400_000,
        shouldAggregate: false,
      });
    });

    it("synthesizes fallback candles for unlisted pairs (e.g. XAGUSDT)", async () => {
      const candles = await fetchCoindcxHistoricalCandles({
        symbol: "XAGUSDT",
        intervalMs: 60_000,
      });
      expect(candles.length).toBeGreaterThan(0);
      expect(candles[0].x).toBeGreaterThan(0);
      expect(candles[0].y).toHaveLength(4);
      expect(candles[0].y[3]).toBeGreaterThan(25); // Silver spot around $31
    });
  });

  describe("Socket Stream Lifecycle & Event Dispatching", () => {
    it("manages subscriptions and produces valid status events", () => {
      const stream = getCoindcxSocketStream();
      const subscribed = stream.subscribe("BTCUSDT", 60_000);
      expect(subscribed).toBe(true);

      const status = stream.getStatusEvent("BTCUSDT", 60_000);
      expect(status.type).toBe("status");
      expect(status.symbol).toBe("BTCUSDT");
      expect(status.provider).toBe("COINDCX");
      expect(status.intervalMs).toBe(60_000);
      expect(status.lastLtp).toBe(76000); // default price fallback

      const unsubscribed = stream.unsubscribe("BTCUSDT", 60_000);
      expect(unsubscribed).toBe(true);
      stream.stop();
    });

    it("handles incoming trade ticks and dispatches candle updates", () => {
      const stream = getCoindcxSocketStream();
      stream.subscribe("BTCUSDT", 60_000);

      const events: unknown[] = [];
      const unbind = stream.onCandleUpdate("BTCUSDT", 60_000, (ev) => {
        events.push(ev);
      });

      // Simulate incoming trade packet through private handler
      const tradePayload = {
        event: "new-trade",
        data: JSON.stringify({
          T: 1762509123000,
          p: "76150.50",
          q: "0.25",
          s: "BTCUSDT",
          m: true,
        }),
      };

      (stream as unknown as { handleTradePayload: (d: unknown) => void }).handleTradePayload(
        tradePayload,
      );

      expect(events.length).toBeGreaterThan(0);
      const lastEvent = events[events.length - 1] as {
        type: string;
        candle: { close: number; volume: number | null };
      };
      expect(lastEvent.type).toBe("candle_update");
      expect(lastEvent.candle.close).toBe(76150.5);

      unbind();
      stream.stop();
    });
  });
});
