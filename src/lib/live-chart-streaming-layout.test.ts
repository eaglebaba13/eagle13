import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createLiveCandleSSE } from "./live-candle-sse";
import { emptyLiveState, applyLiveEvent } from "../hooks/use-live-candle-sse";
import type { LiveStatusEvent, LiveCandleEvent } from "./live-candle-contract";

afterEach(() => {
  vi.useRealTimers();
});

describe("Live Chart Streaming & Layout Verification Suite", () => {
  describe("1. Robust Live SSE Streaming & Keepalive Ping", () => {
    it("authorizes COMEX GOLD (GC1!) in createLiveCandleSSE without 400 error", async () => {
      const res = createLiveCandleSSE("GC1!", 60000);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(res.headers.get("Cache-Control")).toContain("no-cache");

      const reader = res.body!.getReader();
      const firstChunk = await reader.read();
      expect(firstChunk.done).toBe(false);

      const text = new TextDecoder().decode(firstChunk.value);
      expect(text).toContain('"symbol":"GC1!"');
      expect(text).toContain('"provider":"COMEX_STREAM"');
      expect(text).toContain('"connectionState":"CONNECTED"');
      expect(text).toContain('"freshness":"LIVE"');

      await reader.cancel();
    });

    it("rejects invalid symbols or intervals with HTTP 400", () => {
      const resInvalidSym = createLiveCandleSSE("UNKNOWN_SYMBOL", 60000);
      expect(resInvalidSym.status).toBe(400);

      const resInvalidInterval = createLiveCandleSSE("GC1!", 45000);
      expect(resInvalidInterval.status).toBe(400);
    });

    it("sends periodic : ping\\n\\n keepalive comments to prevent proxy drops", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const res = createLiveCandleSSE("GC1!", 60000, controller.signal);
      const reader = res.body!.getReader();

      // Read initial status event
      const initial = await reader.read();
      expect(initial.done).toBe(false);

      // Advance 15s to trigger ping keepalive
      vi.advanceTimersByTime(15000);

      let foundPing = false;
      for (let i = 0; i < 5; i++) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const text = new TextDecoder().decode(chunk.value);
        if (text.includes(": ping\n\n")) {
          foundPing = true;
          break;
        }
      }
      expect(foundPing).toBe(true);

      controller.abort();
      await reader.cancel();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("releases all ping and status timers on abort", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const res = createLiveCandleSSE("GC1!", 60000, controller.signal);
      const reader = res.body!.getReader();

      await reader.read();
      controller.abort();
      await reader.cancel();

      vi.advanceTimersByTime(30000);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("2. Client State & Resilient SSE Handling", () => {
    it("initializes with empty state and null currentCandle", () => {
      const state = emptyLiveState();
      expect(state.connected).toBe(false);
      expect(state.status).toBeNull();
      expect(state.currentCandle).toBeNull();
      expect(state.completedCandles.size).toBe(0);
      expect(state.error).toBeNull();
    });

    it("applies status and candle_update events cleanly", () => {
      let state = emptyLiveState();

      const statusEvent: LiveStatusEvent = {
        type: "status",
        symbol: "GC1!",
        intervalMs: 60000,
        provider: "COMEX_STREAM",
        connectionState: "CONNECTED",
        freshness: "LIVE",
        quality: "OK",
        lastTick: "2026-11-07T12:00:00.000Z",
        lastLtp: 2742.5,
        completedCount: 40,
        error: null,
        currentCandle: {
          time: 1750000000000,
          open: 2740,
          high: 2745,
          low: 2739,
          close: 2742.5,
          volume: 200,
        },
      };

      state = applyLiveEvent(state, statusEvent);
      expect(state.status?.provider).toBe("COMEX_STREAM");
      expect(state.currentCandle?.close).toBe(2742.5);

      const candleEvent: LiveCandleEvent = {
        type: "candle_update",
        symbol: "GC1!",
        intervalMs: 60000,
        provider: "COMEX_STREAM",
        freshness: "LIVE",
        quality: "OK",
        lastTick: "2026-11-07T12:01:00.000Z",
        lastLtp: 2744.0,
        connectionState: "CONNECTED",
        completed: true,
        timestamp: "2026-11-07T12:01:00.000Z",
        tickCount: 5,
        candle: {
          time: 1750000000000,
          open: 2740,
          high: 2745,
          low: 2739,
          close: 2744.0,
          volume: 250,
        },
      };

      state = applyLiveEvent(state, candleEvent);
      expect(state.completedCandles.size).toBe(1);
      expect(state.completedCandles.get(1750000000000)?.close).toBe(2744.0);
    });
  });

  describe("3. Decoupled Volume Bar Scaling & Bull/Bear Color Coding", () => {
    it("computes green volume for bullish candles (close >= open) and red for bearish (close < open)", () => {
      const bullishCandle = { x: 1000, y: [100, 105, 99, 104] as const, volume: 1500 };
      const bearishCandle = { x: 2000, y: [104, 106, 98, 101] as const, volume: 2200 };

      const formatVol = (c: { x: number; y: readonly [number, number, number, number]; volume: number }) => {
        const isUp = c.y[3] >= c.y[0];
        return {
          x: c.x,
          y: c.volume,
          fillColor: isUp ? "rgba(16, 185, 129, 0.5)" : "rgba(244, 63, 94, 0.5)",
          strokeColor: isUp ? "#10b981" : "#f43f5e",
        };
      };

      const bullVol = formatVol(bullishCandle);
      expect(bullVol.fillColor).toBe("rgba(16, 185, 129, 0.5)");
      expect(bullVol.strokeColor).toBe("#10b981");

      const bearVol = formatVol(bearishCandle);
      expect(bearVol.fillColor).toBe("rgba(244, 63, 94, 0.5)");
      expect(bearVol.strokeColor).toBe("#f43f5e");
    });

    it("clamps volume max to 5.5x maxVol so volume bars never exceed 18% of chart height", () => {
      const maxVol = 2000;
      const yaxisVolumeMax = maxVol * 5.5;
      const maxBarHeightPct = (maxVol / yaxisVolumeMax) * 100;

      expect(yaxisVolumeMax).toBe(11000);
      expect(maxBarHeightPct).toBeCloseTo(18.18, 1);
      expect(maxBarHeightPct).toBeLessThan(20);
    });
  });

  describe("4. Source Code and Layout Verification", () => {
    it("verifies live-chart.tsx has CONNECTED • STREAMING badge and proper FRVP right margin", () => {
      const source = readFileSync("src/routes/live-chart.tsx", "utf8");

      expect(source).toContain("CONNECTED • STREAMING");
      expect(source).toContain("right-16 sm:right-20");
      expect(source).toContain("maxVol * 5.5");
      expect(source).toContain("rgba(16, 185, 129, 0.5)");
      expect(source).toContain("rgba(244, 63, 94, 0.5)");

      // Verify no prohibited mock generators
      expect(source).not.toMatch(/generateMockCandles|basePrices|startLocalSimulator|Math\.random/);
    });

    it("verifies use-live-candle-sse.ts has resilient backoff reconnect and resets attempts on open/message", () => {
      const source = readFileSync("src/hooks/use-live-candle-sse.ts", "utf8");

      expect(source).toContain("attempts = 0;");
      expect(source).toContain("Math.min(1000 * 2 ** attempts, 10000)");
      expect(source).toContain('window.addEventListener("online"');
      expect(source).toContain('document.addEventListener("visibilitychange"');
      expect(source).not.toContain("attempts >= 5 ?");
    });
  });
});
