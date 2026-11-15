import { describe, expect, it, vi } from "vitest";
import { emptyLiveState, type LiveSSEState, type LiveSSEStatus } from "@/hooks/use-live-candle-sse";
import type { IndexQuote } from "@/lib/market.functions";
import { buildTickerItem } from "./LiveMarketTickerTape";

vi.mock("@/lib/market.functions", () => ({ getMarketData: vi.fn() }));

const earlier = "2026-11-13T09:59:59.000Z";
const latest = "2026-11-13T10:00:00.000Z";

function quote(patch: Partial<IndexQuote> = {}): IndexQuote {
  return {
    symbol: "^NSEI",
    name: "NIFTY 50",
    livePrice: 24500,
    prevSessionClose: 24650,
    change: -150,
    changePct: -0.61,
    marketState: "CLOSED",
    prevDay: { open: 24600, high: 24700, low: 24400, close: 24500, date: "2026-11-13" },
    updatedAt: latest,
    providerTime: earlier,
    dailyQuote: { source: "UPSTOX", prevClose: 24650, change: -150, changePct: -0.61 },
    ...patch,
  };
}

function live(patch: Partial<LiveSSEStatus> = {}): LiveSSEState {
  return {
    ...emptyLiveState(),
    connected: true,
    status: {
      provider: "UPSTOX_V3_WS",
      freshness: "LIVE",
      quality: "OK",
      lastTick: latest,
      lastLtp: 24500,
      change: null,
      changePct: null,
      connectionState: "CONNECTED",
      completedCount: 0,
      currentCandle: null,
      error: null,
      ...patch,
    },
  };
}

describe("LiveMarketTickerTape daily market changes", () => {
  it("preserves the latest WebSocket daily change instead of recalculating it", () => {
    const item = buildTickerItem(
      "NIFTY 50",
      "^NSEI",
      live({ change: -151.25, changePct: -0.61345 }),
      quote(),
    );
    expect(item).toEqual({ symbol: "NIFTY 50", ltp: 24500, change: -151.25, changePct: -0.61345 });
  });

  it.each([
    ["NIFTY 50", "^NSEI", 24500, 24650, -150, "-0.61"],
    ["BANK NIFTY", "^NSEBANK", 51620.5, 52030.6, -410.1, "-0.79"],
    ["BSE SENSEX", "^BSESN", 81104.2, 81741.3, -637.1, "-0.78"],
  ])(
    "uses authentic REST previous close for zero ticks on %s",
    (label, symbol, lastLtp, prevClose, change, displayedPercent) => {
      const item = buildTickerItem(
        label,
        symbol,
        live({ lastLtp, change: 0, changePct: 0 }),
        quote({
          symbol,
          livePrice: lastLtp,
          dailyQuote: { source: "UPSTOX", prevClose, change: 0, changePct: 0 },
        }),
      );
      expect(item.ltp).toBe(lastLtp);
      expect(item.change).toBeCloseTo(change, 6);
      expect(item.changePct?.toFixed(2)).toBe(displayedPercent);
    },
  );

  it("leaves changes unavailable when the API has no authentic baseline", () => {
    const item = buildTickerItem(
      "NIFTY 50",
      "^NSEI",
      live({ change: 0, changePct: 0 }),
      quote({
        change: 1000,
        changePct: 18.1,
        dailyQuote: { source: "UPSTOX", prevClose: null, change: null, changePct: null },
      }),
    );
    expect(item).toEqual({ symbol: "NIFTY 50", ltp: 24500, change: null, changePct: null });
  });

  it("shows no synthetic index prices or deltas during a cold start", () => {
    for (const [label, symbol] of [
      ["NIFTY 50", "^NSEI"],
      ["BANK NIFTY", "^NSEBANK"],
      ["BSE SENSEX", "^BSESN"],
      ["INDIA VIX", "^INDIAVIX"],
    ]) {
      expect(buildTickerItem(label, symbol, emptyLiveState())).toEqual({
        symbol: label,
        ltp: null,
        change: null,
        changePct: null,
      });
    }
  });

  it("rejects another index's quote instead of borrowing its price or previous close", () => {
    expect(buildTickerItem("BANK NIFTY", "^NSEBANK", emptyLiveState(), quote())).toEqual({
      symbol: "BANK NIFTY",
      ltp: null,
      change: null,
      changePct: null,
    });
    const item = buildTickerItem(
      "BANK NIFTY",
      "^NSEBANK",
      live({ lastLtp: 51620.5, change: 0 }),
      quote(),
    );
    expect(item).toEqual({ symbol: "BANK NIFTY", ltp: 51620.5, change: null, changePct: null });
  });

  it("uses a newer REST quote rather than an older WebSocket price and delta", () => {
    const item = buildTickerItem(
      "NIFTY 50",
      "^NSEI",
      live({ lastTick: earlier, lastLtp: 24600, change: -50, changePct: -0.2 }),
      quote({ providerTime: latest }),
    );
    expect(item).toEqual({ symbol: "NIFTY 50", ltp: 24500, change: -150, changePct: -0.61 });
  });

  it("does not manufacture a nonzero change when the market closes unchanged", () => {
    const item = buildTickerItem(
      "NIFTY 50",
      "^NSEI",
      live({ change: 0, changePct: 0 }),
      quote({
        dailyQuote: { source: "UPSTOX", prevClose: 24500, change: 0, changePct: 0 },
      }),
    );
    expect(item).toEqual({ symbol: "NIFTY 50", ltp: 24500, change: 0, changePct: 0 });
  });
});
