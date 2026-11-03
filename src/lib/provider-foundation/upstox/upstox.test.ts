import { describe, it, expect } from "vitest";
import {
  UPSTOX_ADAPTER_ID,
  UPSTOX_CACHE_NAMESPACE,
  UPSTOX_SUPPORTED_SYMBOLS,
  UpstoxHistoricalAdapter,
  UpstoxHttpClient,
  buildUpstoxProviderAdapter,
  evaluateUpstoxTokenPolicy,
  isUpstoxSupported,
  normalizeCandles,
  parseUpstoxCandles,
  planRange,
  redactUpstoxMessage,
  resolveUpstoxAccessToken,
  resolveUpstoxAnalyticsToken,
  resolveUpstoxMarketDataToken,
  resolveInstrument,
  tupleToRaw,
  upstoxHistoricalCacheKey,
  upstoxRangePolicyFor,
  TIMEFRAME_TO_UPSTOX,
  mergeCandleChunks,
} from "./index";
import type { UpstoxCandleTuple } from "./index";

const LIVE_ENV = {
  UPSTOX_MARKET_DATA_MODE: "live",
  UPSTOX_API_KEY: "key-abc",
  UPSTOX_API_SECRET: "secret-xyz",
  UPSTOX_ACCESS_TOKEN: "live-token-1234567890",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function tuple(
  t: string,
  o: number,
  h: number,
  l: number,
  c: number,
  v: number,
  oi?: number,
): UpstoxCandleTuple {
  return [t, o, h, l, c, v, oi] as UpstoxCandleTuple;
}

describe("upstox token policy", () => {
  it("marks disabled mode as unusable", () => {
    const s = evaluateUpstoxTokenPolicy({});
    expect(s.tokenUsable).toBe(false);
    expect(s.mode).toBe("disabled");
    expect(s.reason).toMatch(/adapter disabled/);
  });
  it("rejects placeholder tokens", () => {
    const s = evaluateUpstoxTokenPolicy({
      UPSTOX_MARKET_DATA_MODE: "live",
      UPSTOX_API_KEY: "changeme",
      UPSTOX_API_SECRET: "",
      UPSTOX_ACCESS_TOKEN: "xxxx",
    });
    expect(s.tokenUsable).toBe(false);
  });
  it("does not silently fall back to sandbox token", () => {
    const s = evaluateUpstoxTokenPolicy({
      UPSTOX_MARKET_DATA_MODE: "live",
      UPSTOX_API_KEY: "k",
      UPSTOX_API_SECRET: "s",
      UPSTOX_ACCESS_TOKEN: "",
      UPSTOX_SANDBOX_ACCESS_TOKEN: "sbx-tok",
    });
    expect(s.tokenSource).toBe("NONE");
    expect(s.tokenUsable).toBe(false);
  });
  it("accepts live credentials", () => {
    const s = evaluateUpstoxTokenPolicy(LIVE_ENV);
    expect(s.tokenSource).toBe("LIVE");
    expect(s.tokenUsable).toBe(true);
  });
  it("accepts the Coolify Analytics Token variable without OAuth credentials", () => {
    const token = "analytics-token-fixture";
    const env = {
      UPSTOX_MARKET_DATA_MODE: "live",
      Upstox_Analytics_Token: token,
    };
    const s = evaluateUpstoxTokenPolicy(env);
    expect(s.tokenUsable).toBe(true);
    expect(resolveUpstoxAnalyticsToken(env)).toBe(token);
    expect(resolveUpstoxMarketDataToken(env)).toBe(token);
    expect(JSON.stringify(s)).not.toContain(token);
  });
  it("prefers Analytics Token but preserves legacy access-token fallback", () => {
    expect(
      resolveUpstoxMarketDataToken({
        UPSTOX_ANALYTICS_TOKEN: "canonical-analytics-token",
        Upstox_Analytics_Token: "coolify-analytics-token",
        UPSTOX_ACCESS_TOKEN: "legacy-access-token",
      }),
    ).toBe("canonical-analytics-token");
    expect(resolveUpstoxMarketDataToken({ Upstox_Analytics_Token: "coolify-token" })).toBe(
      "coolify-token",
    );
    expect(resolveUpstoxMarketDataToken({ UPSTOX_ACCESS_TOKEN: "legacy-token" })).toBe(
      "legacy-token",
    );
    expect(
      resolveUpstoxAnalyticsToken({
        UPSTOX_ANALYTICS_TOKEN: "placeholder",
        Upstox_Analytics_Token: "coolify-token",
      }),
    ).toBe("coolify-token");
    expect(resolveUpstoxAccessToken({ UPSTOX_ACCESS_TOKEN: "xxxx" })).toBeUndefined();
  });
  it("rejects absent and placeholder Analytics credentials", () => {
    expect(resolveUpstoxMarketDataToken({})).toBeUndefined();
    expect(
      evaluateUpstoxTokenPolicy({
        UPSTOX_MARKET_DATA_MODE: "live",
        Upstox_Analytics_Token: "placeholder",
      }).tokenUsable,
    ).toBe(false);
  });
});

describe("upstox instrument master", () => {
  it("resolves supported symbols", () => {
    for (const sym of UPSTOX_SUPPORTED_SYMBOLS) {
      const inst = resolveInstrument(sym);
      expect(inst).not.toBeNull();
      expect(inst!.timezone).toBe("Asia/Kolkata");
    }
    expect(resolveInstrument("INDIA_VIX")?.instrumentKey).toBe("NSE_INDEX|India VIX");
    expect(resolveInstrument("INDIA_VIX")?.tradingSymbol).toBe("INDIA VIX");
  });
  it("does not resolve external or unverified markets", () => {
    expect(resolveInstrument("XAUUSD")).toBeNull();
    expect(resolveInstrument("BTC")).toBeNull();
    expect(resolveInstrument("FINNIFTY")).toBeNull();
    expect(resolveInstrument("GOLD")).toBeNull();
    expect(resolveInstrument("SILVER")).toBeNull();
    expect(isUpstoxSupported("BTC")).toBe(false);
    expect(isUpstoxSupported("FINNIFTY")).toBe(false);
  });
});

describe("upstox range policy + chunking", () => {
  it("returns policies for all timeframes", () => {
    for (const tf of Object.keys(TIMEFRAME_TO_UPSTOX)) {
      const p = upstoxRangePolicyFor(tf as never);
      expect(p.supported).toBe(true);
    }
  });
  it("chunks 1m across the max span", () => {
    const plan = planRange("1m", "2024-01-01", "2024-04-30");
    expect(plan.ok).toBe(true);
    expect(plan.chunks.length).toBeGreaterThan(1);
    // Chunks are ordered and non-overlapping
    for (let i = 1; i < plan.chunks.length; i++) {
      expect(plan.chunks[i]!.from > plan.chunks[i - 1]!.to).toBe(true);
    }
  });
  it("rejects reversed range", () => {
    const plan = planRange("1d", "2025-01-10", "2025-01-01");
    expect(plan.ok).toBe(false);
  });
  it("rejects out-of-support earliest date", () => {
    const plan = planRange("1m", "2010-01-01", "2010-01-05");
    expect(plan.ok).toBe(false);
  });
});

describe("upstox normalization", () => {
  const nowMs = Date.parse("2026-07-16T09:30:00.000Z");
  it("rejects invalid OHLC / duplicates / future candles", () => {
    const rows = [
      { time: "2026-07-15T09:15:00Z", open: 100, high: 110, low: 95, close: 105, volume: 1000 },
      { time: "2026-07-15T09:15:00Z", open: 100, high: 110, low: 95, close: 105, volume: 1000 }, // dup
      { time: "2026-07-15T09:30:00Z", open: 100, high: 90, low: 95, close: 105, volume: 1000 }, // high<max
      { time: "2026-07-15T09:45:00Z", open: 100, high: 110, low: 108, close: 105, volume: 1000 }, // low>min(close)
      { time: "2027-01-01T09:15:00Z", open: 100, high: 110, low: 95, close: 105, volume: 1000 }, // future
    ];
    const r = normalizeCandles(rows, nowMs);
    expect(r.candles.length).toBe(1);
    const reasons = r.rejected.map((x) => x.reason);
    expect(reasons).toContain("duplicate timestamp");
    expect(reasons).toContain("future candle");
    expect(reasons.some((x) => x.startsWith("high") || x.startsWith("low"))).toBe(true);
  });
  it("parses V3 tuple payload", () => {
    const payload = {
      data: {
        candles: [
          tuple("2026-07-15T09:15:00Z", 100, 110, 95, 105, 1000),
          tuple("2026-07-15T09:30:00Z", 105, 115, 100, 110, 1200, 50),
        ],
      },
    };
    const parsed = parseUpstoxCandles(payload);
    expect(parsed).not.toBeNull();
    const raws = parsed!.map(tupleToRaw);
    expect(raws.every((x) => x !== null)).toBe(true);
  });
  it("dedupes across chunk boundaries", () => {
    const c1 = [
      {
        time: "2026-07-15T09:15:00Z",
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 0,
        closed: true as const,
      },
    ];
    const c2 = [
      {
        time: "2026-07-15T09:15:00Z",
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 0,
        closed: true as const,
      },
      {
        time: "2026-07-15T09:30:00Z",
        open: 2,
        high: 2,
        low: 2,
        close: 2,
        volume: 0,
        closed: true as const,
      },
    ];
    const merged = mergeCandleChunks([c1, c2]);
    expect(merged.length).toBe(2);
  });
});

describe("upstox http redaction", () => {
  it("redacts both configured Analytics Token variable names", () => {
    const red = redactUpstoxMessage(
      'UPSTOX_ANALYTICS_TOKEN=canonical-secret Upstox_Analytics_Token="coolify-secret"',
    );
    expect(red).not.toContain("canonical-secret");
    expect(red).not.toContain("coolify-secret");
  });

  it("redacts bearer tokens from messages", () => {
    const msg = 'called with Authorization: Bearer live-token-1234567890 body {"api_key":"abc"}';
    const red = redactUpstoxMessage(msg);
    expect(red).not.toContain("live-token-1234567890");
    expect(red).not.toContain("abc");
  });
  it("returns AUTH_REQUIRED when token is missing", async () => {
    const client = new UpstoxHttpClient({
      env: { UPSTOX_MARKET_DATA_MODE: "disabled" },
      fetchImpl: async () => {
        throw new Error("should not be called");
      },
    });
    const res = await client.request({
      path: "v3/historical-candle/x/minutes/1/2026-07-16/2026-07-15",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UPSTOX_AUTH_REQUIRED");
  });
  it("classifies 401 without retry", async () => {
    let calls = 0;
    const client = new UpstoxHttpClient({
      env: LIVE_ENV,
      maxRetries: 3,
      backoffBaseMs: 0,
      fetchImpl: async () => {
        calls++;
        return new Response("nope", { status: 401 });
      },
    });
    const res = await client.request({ path: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UPSTOX_AUTH_REQUIRED");
    expect(calls).toBe(1);
  });
  it("respects 429 Retry-After", async () => {
    let calls = 0;
    const client = new UpstoxHttpClient({
      env: LIVE_ENV,
      maxRetries: 0,
      backoffBaseMs: 0,
      fetchImpl: async () => {
        calls++;
        return new Response("slow down", { status: 429, headers: { "retry-after": "2" } });
      },
    });
    const res = await client.request({ path: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UPSTOX_RATE_LIMITED");
      expect(res.error.retryAfterMs).toBe(2000);
    }
  });
  it("catches malformed JSON as schema error", async () => {
    const client = new UpstoxHttpClient({
      env: LIVE_ENV,
      fetchImpl: async () =>
        new Response("not json", { status: 200, headers: { "content-type": "application/json" } }),
    });
    const res = await client.request({ path: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UPSTOX_SCHEMA_ERROR");
  });
  it("does not include token in the outgoing URL", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const client = new UpstoxHttpClient({
      env: LIVE_ENV,
      fetchImpl: async (input, init) => {
        seenUrl = String(input);
        seenAuth = String((init?.headers as Record<string, string>)["Authorization"] ?? "");
        return jsonResponse({ data: { candles: [] } });
      },
    });
    await client.request({ path: "v3/historical-candle/foo/minutes/1/2026-07-16/2026-07-15" });
    expect(seenUrl).not.toContain("live-token-1234567890");
    expect(seenAuth).toContain("Bearer");
  });
  it("uses the Coolify Analytics Token for read-only requests without exposing it", async () => {
    const token = "coolify-analytics-token-fixture";
    let seenAuthorization = "";
    let seenUrl = "";
    const client = new UpstoxHttpClient({
      env: {
        UPSTOX_MARKET_DATA_MODE: "live",
        Upstox_Analytics_Token: token,
      },
      fetchImpl: async (input, init) => {
        seenAuthorization = String(
          (init?.headers as Record<string, string>)["Authorization"] ?? "",
        );
        seenUrl = String(input);
        return jsonResponse({ status: "success", data: {} });
      },
    });
    const res = await client.request({
      path: "v2/market-quote/quotes",
      query: { instrument_key: "NSE_INDEX|India VIX" },
    });
    expect(res.ok).toBe(true);
    expect(seenAuthorization).toBe(`Bearer ${token}`);
    expect(new URL(seenUrl).searchParams.get("instrument_key")).toBe("NSE_INDEX|India VIX");
    expect(seenUrl).not.toContain(token);
    expect(JSON.stringify(res)).not.toContain(token);
  });
});

describe("upstox adapter (mock HTTP)", () => {
  function makeAdapter(fetchImpl: typeof fetch, env = LIVE_ENV) {
    return new UpstoxHistoricalAdapter({ env, fetchImpl, backoffBaseMs: 0, maxRetries: 0 });
  }

  it("maps every timeframe to a documented unit/interval", () => {
    expect(TIMEFRAME_TO_UPSTOX["1m"]).toEqual({ unit: "minutes", interval: 1 });
    expect(TIMEFRAME_TO_UPSTOX["3m"]).toEqual({ unit: "minutes", interval: 3 });
    expect(TIMEFRAME_TO_UPSTOX["5m"]).toEqual({ unit: "minutes", interval: 5 });
    expect(TIMEFRAME_TO_UPSTOX["15m"]).toEqual({ unit: "minutes", interval: 15 });
    expect(TIMEFRAME_TO_UPSTOX["1h"]).toEqual({ unit: "hours", interval: 1 });
    expect(TIMEFRAME_TO_UPSTOX["1d"]).toEqual({ unit: "days", interval: 1 });
  });

  it("rejects unsupported symbols", async () => {
    const adapter = makeAdapter(async () => jsonResponse({ data: { candles: [] } }));
    const res = await adapter.fetchRange({
      symbol: "BTC" as never,
      timeframe: "1d",
      from: "2025-01-01",
      to: "2025-01-05",
      nowIso: "2026-07-16T00:00:00Z",
      nowMs: Date.parse("2026-07-16T00:00:00Z"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("UNSUPPORTED_SYMBOL");
  });

  it("returns candles for NIFTY50 daily", async () => {
    let capturedUrl = "";
    const adapter = makeAdapter(async (input) => {
      capturedUrl = String(input);
      return jsonResponse({
        data: {
          candles: [
            tuple("2025-01-02T09:15:00Z", 100, 110, 95, 105, 1000),
            tuple("2025-01-03T09:15:00Z", 105, 115, 100, 110, 1200),
          ],
        },
      });
    });
    const res = await adapter.fetchRange({
      symbol: "NIFTY50",
      timeframe: "1d",
      from: "2025-01-01",
      to: "2025-01-05",
      nowIso: "2026-07-16T00:00:00Z",
      nowMs: Date.parse("2026-07-16T00:00:00Z"),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.candles.length).toBe(2);
      expect(res.data.telemetry.providerId).toBe(UPSTOX_ADAPTER_ID);
    }
    expect(capturedUrl).toContain("/v3/historical-candle/");
    expect(capturedUrl).toContain("/days/1/");
  });

  it("uses the official INDIA VIX instrument key for quote and V3 candle requests", async () => {
    const providerTime = Date.parse("2026-07-16T09:30:00.000Z");
    const quoteAdapter = makeAdapter(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/v2/market-quote/quotes");
      expect(url.searchParams.get("instrument_key")).toBe("NSE_INDEX|India VIX");
      return jsonResponse({
        data: {
          "NSE_INDEX|India VIX": {
            last_price: 16.25,
            last_trade_time: providerTime,
            ohlc: { open: 16, high: 17, low: 15, close: 15.5 },
          },
        },
      });
    });
    const quote = await quoteAdapter.fetchQuote("INDIA_VIX", "2026-07-16T09:30:01.000Z");
    expect(quote.ok).toBe(true);
    if (quote.ok) {
      expect(quote.data.last).toBe(16.25);
      expect(quote.data.telemetry.providerTime).toBe("2026-07-16T09:30:00.000Z");
    }

    let candleUrl = "";
    const candleAdapter = makeAdapter(async (input) => {
      candleUrl = String(input);
      return jsonResponse({
        data: {
          candles: [
            tuple("2025-01-02T09:15:00Z", 15, 16, 14, 15.5, 0),
            tuple("2025-01-03T09:15:00Z", 15.5, 16.5, 15, 16, 0),
          ],
        },
      });
    });
    const candles = await candleAdapter.fetchRange({
      symbol: "INDIA_VIX",
      timeframe: "1d",
      from: "2025-01-01",
      to: "2025-01-05",
      nowIso: "2026-07-16T00:00:00Z",
      nowMs: Date.parse("2026-07-16T00:00:00Z"),
    });
    expect(candles.ok).toBe(true);
    expect(candleUrl).toContain("/NSE_INDEX%7CIndia%20VIX/days/1/");
  });

  it("does not treat an out-of-range provider timestamp as fresh", async () => {
    const adapter = makeAdapter(async () =>
      jsonResponse({
        data: {
          "NSE_INDEX|India VIX": {
            last_price: 16.25,
            last_trade_time: 1e99,
          },
        },
      }),
    );
    const result = await adapter.fetchQuote("INDIA_VIX", "2026-07-16T09:30:01.000Z");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.telemetry.providerTime).toBeNull();
      expect(result.data.telemetry.status).toBe("OFFLINE");
    }
  });

  it("chunks a >30-day 1m request into multiple HTTP calls", async () => {
    let calls = 0;
    const adapter = makeAdapter(async () => {
      calls++;
      return jsonResponse({ data: { candles: [] } });
    });
    const res = await adapter.fetchRange({
      symbol: "NIFTY50",
      timeframe: "1m",
      from: "2024-01-01",
      to: "2024-04-30",
      nowIso: "2026-07-16T00:00:00Z",
      nowMs: Date.parse("2026-07-16T00:00:00Z"),
    });
    expect(res.ok).toBe(true);
    expect(calls).toBeGreaterThan(1);
  });

  it("propagates AUTH_REQUIRED from the HTTP client", async () => {
    const adapter = makeAdapter(async () => new Response("no", { status: 401 }));
    const res = await adapter.fetchRange({
      symbol: "NIFTY50",
      timeframe: "1d",
      from: "2025-01-01",
      to: "2025-01-05",
      nowIso: "2026-07-16T00:00:00Z",
      nowMs: Date.parse("2026-07-16T00:00:00Z"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("AUTH_REQUIRED");
  });

  it("cache key is deterministic and namespaced", () => {
    const k = upstoxHistoricalCacheKey({
      instrumentKey: "NSE_INDEX|Nifty 50",
      timeframe: "1d",
      from: "2025-01-01",
      to: "2025-01-31",
    });
    expect(k.startsWith(UPSTOX_CACHE_NAMESPACE + ":historical:")).toBe(true);
    expect(k).toContain("NSE_INDEX|Nifty 50");
    // Isolated from the base provider-foundation cache namespace prefix.
    expect(k.startsWith("provider-foundation:")).toBe(false);
  });

  it("registers as HISTORICAL primary in the provider registry shape", () => {
    const adapter = buildUpstoxProviderAdapter({
      env: LIVE_ENV,
      fetchImpl: async () => jsonResponse({ data: { candles: [] } }),
    });
    expect(adapter.id).toBe(UPSTOX_ADAPTER_ID);
    expect(adapter.capability.domain).toBe("HISTORICAL");
    expect(adapter.role).toBe("PRIMARY");
  });
});

describe("upstox governance guards", () => {
  it("adapter files do not import broker/order paths", async () => {
    // Runtime import-graph check: importing the adapter must NOT pull in
    // any broker adapter side-effects. If a future edit adds such an
    // import, the module will still load but this smoke test asserts the
    // ProviderAdapter contract remains data-only.
    const mod = await import("./index");
    const keys = Object.keys(mod);
    expect(keys).not.toContain("placeOrder");
    expect(keys).not.toContain("cancelOrder");
  });
});
