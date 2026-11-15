import { describe, it, expect, vi } from "vitest";
import { mapUpstoxToIndexQuote, resolveUpstoxDailyChange } from "./upstox-quote-mapper";
import type { QuoteTick, HistoricalCandle } from "./provider-foundation/types";

function tick(overrides: Partial<QuoteTick> = {}): QuoteTick {
  return {
    symbol: "NIFTY50",
    last: 24500,
    open: 24450,
    high: 24550,
    low: 24400,
    prevClose: 24400,
    change: 100,
    changePct: 0.4,
    volume: null,
    currency: "INR",
    telemetry: {
      status: "LIVE",
      latencyMs: 12,
      receivedAt: "2026-07-16T04:00:00.000Z",
      providerTime: "2026-07-16T04:00:00.000Z",
      marketSession: "REGULAR",
      rateLimit: null,
      retryAfterMs: null,
      staleReason: null,
      providerId: "upstox",
      role: "PRIMARY",
    },
    ...overrides,
  };
}

describe("mapUpstoxToIndexQuote", () => {
  it("produces IndexQuote with live price, change, prevDay from candles", () => {
    const candles: HistoricalCandle[] = [
      {
        time: "2026-07-14T10:00:00.000Z",
        open: 24300,
        high: 24380,
        low: 24280,
        close: 24350,
        volume: null,
        closed: true,
      },
      {
        time: "2026-07-15T10:00:00.000Z",
        open: 24380,
        high: 24460,
        low: 24350,
        close: 24400,
        volume: null,
        closed: true,
      },
    ];
    const q = mapUpstoxToIndexQuote({
      symbol: "^NSEI",
      name: "NIFTY 50",
      tick: tick(),
      dailyCandles: candles,
    });
    expect(q.livePrice).toBe(24500);
    expect(q.prevDay.close).toBe(24400);
    expect(q.change).toBeCloseTo(100, 2);
    expect(q.changePct).toBe(0.4);
    expect(q.marketState).toBe("OPEN");
  });

  it("preserves provider deltas even when a different quote baseline is present", () => {
    const q = mapUpstoxToIndexQuote({
      symbol: "^NSEI",
      name: "NIFTY 50",
      tick: tick({ prevClose: 24380 }),
    });
    expect(q.prevDay.close).toBe(24380);
    expect(q.change).toBe(100);
    expect(q.changePct).toBe(0.4);
    expect(q.dailyQuote).toEqual({ source: "UPSTOX", prevClose: 24380, change: 100, changePct: 0.4 });
  });

  it("marks marketState CLOSED when session is not REGULAR", () => {
    const q = mapUpstoxToIndexQuote({
      symbol: "^NSEI",
      name: "NIFTY 50",
      tick: tick({ telemetry: { ...tick().telemetry, marketSession: "CLOSED" } }),
    });
    expect(q.marketState).toBe("CLOSED");
  });

  it("never NaN when only live price is present", () => {
    const q = mapUpstoxToIndexQuote({
      symbol: "^NSEI",
      name: "NIFTY 50",
      tick: tick({ open: null, high: null, low: null, prevClose: null, change: null, changePct: null }),
    });
    expect(Number.isFinite(q.livePrice)).toBe(true);
    expect(Number.isFinite(q.change)).toBe(true);
    expect(Number.isFinite(q.prevDay.close)).toBe(true);
    expect(q.dailyQuote).toEqual({ source: "UPSTOX", prevClose: null, change: null, changePct: null });
  });

  it("uses the REST quote baseline when the latest closed-session candle equals LTP", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T05:00:00.000Z"));
    try {
      const q = mapUpstoxToIndexQuote({
        symbol: "^NSEI", name: "NIFTY 50",
        tick: tick({ last: 24500, prevClose: 24650, change: 0, changePct: 0 }),
        dailyCandles: [{ time: "2026-07-17T10:00:00.000Z", open: 24600, high: 24700, low: 24450, close: 24500, volume: null, closed: true }],
      });
      expect(q.prevDay.close).toBe(24500);
      expect(q.change).toBe(-150);
      expect(q.changePct).toBe(-0.61);
      expect(q.dailyQuote?.prevClose).toBe(24650);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("resolveUpstoxDailyChange", () => {
  it("returns direct provider deltas without rounding or recalculation", () => {
    expect(resolveUpstoxDailyChange({ lastPrice: 24500, prevClose: 20000, change: -151.25, changePct: -0.61345 }))
      .toEqual({ change: -151.25, changePct: -0.61345 });
  });

  it.each([0, null, undefined])("calculates from an authentic previous close when net change is %s", (change) => {
    const result = resolveUpstoxDailyChange({ lastPrice: 24500, prevClose: 24650, change, changePct: 0 });
    expect(result.change).toBe(-150);
    expect(result.changePct).toBeCloseTo(-150 / 24650 * 100, 10);
  });

  it("preserves a genuine zero with an authentic baseline", () => {
    expect(resolveUpstoxDailyChange({ lastPrice: 24500, prevClose: 24500, change: 0, changePct: 0 }))
      .toEqual({ change: 0, changePct: 0 });
  });

  it.each([null, undefined, 0, -1, NaN, Infinity])("leaves the delta unavailable for invalid previous close %s", (prevClose) => {
    expect(resolveUpstoxDailyChange({ lastPrice: 24500, prevClose, change: 0 }))
      .toEqual({ change: null, changePct: null });
  });

  it.each([null, undefined, 0, -1, NaN, Infinity])("does not calculate a fallback from invalid LTP %s", (lastPrice) => {
    expect(resolveUpstoxDailyChange({ lastPrice, prevClose: 24500 }))
      .toEqual({ change: null, changePct: null });
  });

  it("keeps missing percent unavailable without an authentic baseline", () => {
    expect(resolveUpstoxDailyChange({ lastPrice: 24500, change: -150 }))
      .toEqual({ change: -150, changePct: null });
  });
});
