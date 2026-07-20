// Phase 36.3 — Provider migration audit tests.
//
// Verifies dashboard market data prefers Upstox and does NOT call
// Yahoo Finance for NIFTY / BANKNIFTY / INDIA VIX when Upstox
// responds successfully. Gold / Silver Yahoo calls are retained as
// the intentional commodity/ratio fallback (see docs).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type UxOk = {
  ok: true;
  quote: { livePrice: number; prevSessionClose: number; change: number; changePct: number; symbol: string; name: string; marketState: "OPEN"; prevDay: { open: number; high: number; low: number; close: number; date: string }; updatedAt: string };
  providerMetadata: { name: "upstox-historical-v1"; status: string; receivedAt: string; providerTime: string | null };
};

const makeUpstoxQuote = (label: string, price: number): UxOk => ({
  ok: true,
  quote: {
    symbol: label,
    name: label,
    livePrice: price,
    prevSessionClose: price - 10,
    change: 10,
    changePct: 0.5,
    marketState: "OPEN",
    prevDay: { open: price - 20, high: price + 5, low: price - 25, close: price - 10, date: "2026-07-19" },
    updatedAt: new Date().toISOString(),
  },
  providerMetadata: {
    name: "upstox-historical-v1",
    status: "LIVE",
    receivedAt: new Date().toISOString(),
    providerTime: new Date().toISOString(),
  },
});

// Track Yahoo URLs the module tries to fetch.
const yahooCalls: string[] = [];

vi.mock("./http", () => ({
  fetchJson: vi.fn(async (url: string) => {
    yahooCalls.push(url);
    // Minimal Yahoo chart response shape for commodity fallback (GC=F/SI=F).
    const now = Math.floor(Date.now() / 1000);
    return {
      chart: {
        result: [
          {
            meta: { regularMarketPrice: 2500, shortName: url },
            timestamp: [now - 172800, now - 86400, now],
            indicators: { quote: [{ open: [1, 2, 3], high: [1, 2, 3], low: [1, 2, 3], close: [1, 2, 3] }] },
          },
        ],
      },
    };
  }),
}));

vi.mock("./server-cache", () => ({
  cached: async <T,>(_k: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("./upstox-market-data.server", () => ({
  fetchUpstoxIndexQuote: vi.fn(async (sym: "NIFTY50" | "BANKNIFTY" | "INDIA_VIX") => {
    if (sym === "NIFTY50") return makeUpstoxQuote("^NSEI", 25000);
    if (sym === "BANKNIFTY") return makeUpstoxQuote("^NSEBANK", 52000);
    return makeUpstoxQuote("^INDIAVIX", 12);
  }),
}));

describe("market.functions — provider routing (Phase 36.3)", () => {
  beforeEach(() => {
    yahooCalls.length = 0;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prefers Upstox for NIFTY/BANKNIFTY/VIX and does NOT call Yahoo for those symbols", async () => {
    const mod = await import("./market.functions");
    const res = (await mod.getMarketDataImpl()) as {
      providerMetadata?: Record<string, { name: string }>;
    };
    // Yahoo should be called ONLY for GC=F and SI=F (commodities), never for indices.
    const indexHits = yahooCalls.filter((u) => /NSEI|NSEBANK|INDIAVIX/i.test(u));
    expect(indexHits, "no Yahoo index requests when Upstox is healthy").toEqual([]);
    // Commodity fallback preserved.
    const commodityHits = yahooCalls.filter((u) => /GC%3DF|SI%3DF|GC=F|SI=F/.test(u));
    expect(commodityHits.length).toBeGreaterThanOrEqual(2);
    // Provider metadata identifies Upstox for indices.
    expect(res.providerMetadata?.nifty.name).toBe("upstox-historical-v1");
    expect(res.providerMetadata?.banknifty.name).toBe("upstox-historical-v1");
    expect(res.providerMetadata?.vix.name).toBe("upstox-historical-v1");
  });
});