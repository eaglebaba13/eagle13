import { describe, it, expect } from "vitest";
import {
  buildWatchlist,
  findTokenizedMetals,
  summarizeCrypto,
  DEFAULT_CRYPTO_WATCHLIST,
} from "./dashboard-selectors";
import type { CoindcxMarketSnapshot } from "./types";

function snap(over: Partial<CoindcxMarketSnapshot> = {}, market: Partial<CoindcxMarketSnapshot["market"]> = {}, ticker: Partial<NonNullable<CoindcxMarketSnapshot["ticker"]>> | null = {}): CoindcxMarketSnapshot {
  const base: CoindcxMarketSnapshot = {
    market: {
      pair: "BTCUSDT",
      ecode: "B",
      base: "BTC",
      quote: "USDT",
      assetClass: "CRYPTO_MAJOR",
      status: "ACTIVE",
      minQuantity: null,
      maxQuantity: null,
      tickSize: null,
      baseCurrencyPrecision: null,
      targetCurrencyPrecision: null,
      linkedUnderlying: null,
      notes: [],
      ...market,
    },
    ticker: ticker
      ? {
          pair: market.pair ?? "BTCUSDT",
          last: 100,
          bid: null,
          ask: null,
          high24h: null,
          low24h: null,
          change24hPct: 1,
          volume24h: null,
          quoteVolume24h: null,
          timestamp: "2025-01-01T00:00:00Z",
          ...ticker,
        }
      : null,
    meta: {
      providerId: "COINDCX",
      endpoint: "/exchange/ticker",
      status: "LIVE",
      latencyMs: 10,
      fetchedAt: "2025-01-01T00:00:00Z",
      ageSec: 5,
      safeError: null,
      upstreamCode: null,
      requestId: null,
      tradingEnabledFlag: false,
      sessionSemantics: "24x7",
    },
    ...over,
  };
  return base;
}

describe("crypto dashboard selectors", () => {
  it("builds default watchlist and marks missing bases UNAVAILABLE", () => {
    const rows = buildWatchlist([snap({}, { base: "BTC", pair: "BTCUSDT" }, { last: 50000, change24hPct: 2 })]);
    expect(rows.length).toBe(DEFAULT_CRYPTO_WATCHLIST.length);
    const btc = rows.find((r) => r.base === "BTC")!;
    expect(btc.status).toBe("LIVE");
    expect(btc.change24hPct).toBe(2);
    const eth = rows.find((r) => r.base === "ETH")!;
    expect(eth.status).toBe("UNAVAILABLE");
    expect(eth.last).toBeNull();
  });

  it("classifies DELAYED status from provider meta", () => {
    const rows = buildWatchlist([
      snap({ meta: { ...snap().meta, status: "DELAYED" } }, { base: "BTC" }, { last: 1, change24hPct: 0 }),
    ]);
    expect(rows.find((r) => r.base === "BTC")!.status).toBe("DELAYED");
  });

  it("prefers USDT quote then falls back", () => {
    const inr = snap({}, { base: "BTC", pair: "BTCINR", quote: "INR" }, { last: 999 });
    const usdt = snap({}, { base: "BTC", pair: "BTCUSDT", quote: "USDT" }, { last: 100 });
    const rows = buildWatchlist([inr, usdt], ["BTC"]);
    expect(rows[0].pair).toBe("BTCUSDT");
    expect(rows[0].last).toBe(100);
  });

  it("findTokenizedMetals returns null when provider does not supply them", () => {
    const res = findTokenizedMetals([snap({}, { base: "BTC" }, { last: 1 })]);
    expect(res.gold).toBeNull();
    expect(res.silver).toBeNull();
  });

  it("findTokenizedMetals returns tokenized gold/silver rows when present", () => {
    const gold = snap(
      {},
      { base: "PAXG", pair: "PAXGUSDT", assetClass: "TOKENIZED_METAL", linkedUnderlying: "GOLD" },
      { last: 2000, change24hPct: 0.5 },
    );
    const silver = snap(
      {},
      { base: "KAG", pair: "KAGUSDT", assetClass: "TOKENIZED_METAL", linkedUnderlying: "SILVER" },
      { last: 25, change24hPct: -0.2 },
    );
    const res = findTokenizedMetals([gold, silver]);
    expect(res.gold?.base).toBe("PAXG");
    expect(res.silver?.base).toBe("KAG");
    expect(res.gold?.linkedUnderlying).toBe("GOLD");
  });

  it("summarizeCrypto computes gainers/losers/avg/best/worst", () => {
    const rows = buildWatchlist([
      snap({}, { base: "BTC", pair: "BTCUSDT" }, { last: 100, change24hPct: 5 }),
      snap({}, { base: "ETH", pair: "ETHUSDT" }, { last: 100, change24hPct: -3 }),
      snap({}, { base: "SOL", pair: "SOLUSDT" }, { last: 100, change24hPct: 1 }),
      snap({}, { base: "XRP", pair: "XRPUSDT" }, { last: 100, change24hPct: -1 }),
    ]);
    const s = summarizeCrypto(rows);
    expect(s.total).toBe(4);
    expect(s.gainers).toBe(2);
    expect(s.losers).toBe(2);
    expect(s.bestPerformer?.base).toBe("BTC");
    expect(s.worstPerformer?.base).toBe("ETH");
    expect(s.avgChangePct).toBeCloseTo(0.5, 5);
    expect(s.worstStatus).toBe("LIVE");
  });

  it("summary worstStatus escalates to worst row status", () => {
    const rows = buildWatchlist([
      snap({}, { base: "BTC" }, { last: 1, change24hPct: 0 }),
    ]);
    // No SOL/ETH/XRP → UNAVAILABLE rows escalate worstStatus
    const s = summarizeCrypto(rows);
    expect(s.worstStatus).toBe("UNAVAILABLE");
  });
});
