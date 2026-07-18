import { describe, it, expect } from "vitest";
import { classifyBase, linkedUnderlyingFor, TOKENIZED_METAL_MAP, CRYPTO_MAJOR_BASES, isSurfacedMarket, marketSortKey } from "./symbols";
import { parseMarketsDetails, discoverySummary } from "./market-discovery";
import { normalizeTickerRow, indexTickers } from "./ticker";
import { parseCandles } from "./candles";
import { classifyCoindcxFreshness } from "./freshness";
import { buildCoindcxDiagnostics } from "./diagnostics";
import { COINDCX_TRADING_ENABLED, assertNoExecution, assertExecutionGuardIntact } from "./execution-guard";
import { assertAllowlistedEndpoint, COINDCX_ENDPOINTS } from "./endpoints";
import type { CoindcxMarket } from "./types";

describe("coindcx · symbols", () => {
  it("classifies BTC/ETH/SOL/XRP as CRYPTO_MAJOR", () => {
    for (const b of CRYPTO_MAJOR_BASES) expect(classifyBase(b)).toBe("CRYPTO_MAJOR");
  });
  it("classifies PAXG/XAUT as TOKENIZED_METAL linked to GOLD", () => {
    expect(classifyBase("PAXG")).toBe("TOKENIZED_METAL");
    expect(linkedUnderlyingFor("PAXG")).toBe("GOLD");
    expect(linkedUnderlyingFor("XAUT")).toBe("GOLD");
  });
  it("classifies DOGE as OTHER (filtered out of surfaces)", () => {
    expect(classifyBase("DOGE")).toBe("OTHER");
  });
  it("KAG maps to SILVER", () => {
    expect(TOKENIZED_METAL_MAP.KAG).toBe("SILVER");
  });
  it("marketSortKey ranks crypto majors ahead of tokenized metals", () => {
    const btc: CoindcxMarket = { pair: "BTCUSDT", ecode: "B", base: "BTC", quote: "USDT", assetClass: "CRYPTO_MAJOR", status: "ACTIVE", minQuantity: null, maxQuantity: null, tickSize: null, baseCurrencyPrecision: null, targetCurrencyPrecision: null, linkedUnderlying: null, notes: [] };
    const paxg: CoindcxMarket = { ...btc, pair: "PAXGUSDT", base: "PAXG", assetClass: "TOKENIZED_METAL", linkedUnderlying: "GOLD" };
    expect(marketSortKey(btc)[0]).toBeLessThan(marketSortKey(paxg)[0]);
  });
});

describe("coindcx · discovery parser", () => {
  const raw = [
    { symbol: "BTCUSDT", ecode: "B", target_currency_short_name: "BTC", base_currency_short_name: "USDT", status: "active", min_quantity: "0.0001" },
    { symbol: "PAXGUSDT", ecode: "B", target_currency_short_name: "PAXG", base_currency_short_name: "USDT", status: "active" },
    { symbol: "DOGEUSDT", ecode: "B", target_currency_short_name: "DOGE", base_currency_short_name: "USDT", status: "active" },
    { symbol: "BTCINR", ecode: "I", target_currency_short_name: "BTC", base_currency_short_name: "INR", status: "inactive" },
  ];
  it("surfaces only crypto-majors and tokenized-metals; filters OTHER + SUSPENDED", () => {
    const markets = parseMarketsDetails(raw);
    const pairs = markets.map((m) => m.pair);
    expect(pairs).toContain("BTCUSDT");
    expect(pairs).toContain("PAXGUSDT");
    expect(pairs).toContain("BTCINR"); // inactive still surfaced (not suspended)
    expect(pairs).not.toContain("DOGEUSDT");
  });
  it("annotates tokenized metals with disclaimer", () => {
    const [_, paxg] = parseMarketsDetails(raw).filter((m) => m.base === "PAXG");
    // Grab first PAXG
    const p = parseMarketsDetails(raw).find((m) => m.base === "PAXG")!;
    expect(p.notes.some((n) => n.includes("TOKENIZED"))).toBe(true);
    expect(p.linkedUnderlying).toBe("GOLD");
  });
  it("discoverySummary counts categories", () => {
    const s = discoverySummary(parseMarketsDetails(raw));
    expect(s.cryptoMajors).toBeGreaterThan(0);
    expect(s.tokenizedMetals).toBe(1);
  });
  it("returns [] for non-array input", () => {
    expect(parseMarketsDetails(null)).toEqual([]);
    expect(parseMarketsDetails({})).toEqual([]);
  });
});

describe("coindcx · ticker + candles", () => {
  it("normalizes a valid ticker row", () => {
    const t = normalizeTickerRow(
      { market: "BTCUSDT", last_price: "50000.5", bid: "49999", ask: "50001", high: "51000", low: "49000", change_24_hour: "1.5", volume: "12.3", timestamp: 1_700_000_000_000 },
      "2024-01-01T00:00:00Z",
    );
    expect(t?.pair).toBe("BTCUSDT");
    expect(t?.last).toBe(50000.5);
    expect(t?.timestamp).toContain("2023");
  });
  it("rejects tickers missing last_price", () => {
    expect(normalizeTickerRow({ market: "BTCUSDT" }, "2024-01-01T00:00:00Z")).toBeNull();
  });
  it("indexTickers keys by pair", () => {
    const m = indexTickers([{ market: "BTCUSDT", last_price: 1 }, { market: "ETHUSDT", last_price: 2 }], "2024-01-01T00:00:00Z");
    expect(m.get("BTCUSDT")?.last).toBe(1);
    expect(m.get("ETHUSDT")?.last).toBe(2);
  });
  it("parseCandles rejects rows with missing OHLC", () => {
    const out = parseCandles([
      { open: 1, high: 2, low: 0.5, close: 1.5, time: 1_700_000_000_000, volume: 10 },
      { open: null, high: 2, low: 0.5, close: 1.5, time: 1_700_000_060_000 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].close).toBe(1.5);
  });
});

describe("coindcx · freshness", () => {
  it("LIVE within 30s, DELAYED within 5m, STALE beyond", () => {
    expect(classifyCoindcxFreshness(10)).toBe("LIVE");
    expect(classifyCoindcxFreshness(120)).toBe("DELAYED");
    expect(classifyCoindcxFreshness(9999)).toBe("STALE");
    expect(classifyCoindcxFreshness(-1)).toBe("UNAVAILABLE");
  });
});

describe("coindcx · execution guard", () => {
  it("trading flag is FALSE at compile-time", () => {
    expect(COINDCX_TRADING_ENABLED).toBe(false);
  });
  it("assertNoExecution throws with operation name", () => {
    expect(() => assertNoExecution("placeOrder")).toThrow(/COINDCX_TRADING_DISABLED/);
  });
  it("guard tripwire fires when flag flipped", () => {
    expect(() => assertExecutionGuardIntact(true as unknown as false)).toThrow(/GUARD_TRIPPED/);
  });
});

describe("coindcx · endpoint allowlist", () => {
  it("accepts allowlisted URLs", () => {
    expect(() => assertAllowlistedEndpoint(COINDCX_ENDPOINTS.marketsDetails)).not.toThrow();
    expect(() => assertAllowlistedEndpoint(`${COINDCX_ENDPOINTS.candles}?pair=BTCUSDT&interval=1m`)).not.toThrow();
  });
  it("rejects non-allowlisted URLs (including any private/trade path)", () => {
    expect(() => assertAllowlistedEndpoint("https://api.coindcx.com/exchange/v1/orders/create")).toThrow();
    expect(() => assertAllowlistedEndpoint("https://malicious.example.com/api")).toThrow();
  });
});

describe("coindcx · diagnostics builder", () => {
  it("reports zero trading state and endpoint allowlist", () => {
    const d = buildCoindcxDiagnostics({
      markets: [],
      lastDiscoveryAt: null,
      lastDiscoveryLatencyMs: null,
      lastError: null,
      nowIso: "2024-01-01T00:00:00Z",
    });
    expect(d.tradingEnabled).toBe(false);
    expect(d.executionGuardActive).toBe(true);
    expect(d.endpointsAllowlisted.length).toBeGreaterThan(0);
    expect(d.providerId).toBe("COINDCX");
  });
});
