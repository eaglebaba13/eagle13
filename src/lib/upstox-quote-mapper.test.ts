import { describe, it, expect } from "vitest";
import { mapUpstoxToIndexQuote } from "./upstox-quote-mapper";
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
      { time: "2026-07-14T10:00:00.000Z", open: 24300, high: 24380, low: 24280, close: 24350, volume: null, closed: true },
      { time: "2026-07-15T10:00:00.000Z", open: 24380, high: 24460, low: 24350, close: 24400, volume: null, closed: true },
    ];
    const q = mapUpstoxToIndexQuote({ symbol: "^NSEI", name: "NIFTY 50", tick: tick(), dailyCandles: candles });
    expect(q.livePrice).toBe(24500);
    expect(q.prevDay.close).toBe(24400);
    expect(q.change).toBeCloseTo(100, 2);
    expect(q.changePct).toBeCloseTo(0.41, 1);
    expect(q.marketState).toBe("OPEN");
  });

  it("uses tick prev-close when no candles provided", () => {
    const q = mapUpstoxToIndexQuote({ symbol: "^NSEI", name: "NIFTY 50", tick: tick({ prevClose: 24380 }) });
    expect(q.prevDay.close).toBe(24380);
    expect(q.change).toBeCloseTo(120, 2);
  });

  it("marks marketState CLOSED when session is not REGULAR", () => {
    const q = mapUpstoxToIndexQuote({
      symbol: "^NSEI", name: "NIFTY 50",
      tick: tick({ telemetry: { ...tick().telemetry, marketSession: "CLOSED" } }),
    });
    expect(q.marketState).toBe("CLOSED");
  });

  it("never NaN when only live price is present", () => {
    const q = mapUpstoxToIndexQuote({
      symbol: "^NSEI", name: "NIFTY 50",
      tick: tick({ open: null, high: null, low: null, prevClose: null }),
    });
    expect(Number.isFinite(q.livePrice)).toBe(true);
    expect(Number.isFinite(q.change)).toBe(true);
    expect(Number.isFinite(q.prevDay.close)).toBe(true);
  });
});