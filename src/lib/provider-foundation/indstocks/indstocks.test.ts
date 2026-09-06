import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  IndstocksAdapter,
  buildIndstocksProviderAdapter,
} from "./indstocks-historical.adapter.server";
import { IndstocksHttpClient } from "./indstocks-http.server";
import {
  parseIndstocksCandles,
  normalizeIndstocksCandles,
  mergeIndstocksCandleChunks,
  computeIndstocksDataQuality,
} from "./indstocks-normalizer";
import { planIndstocksRange } from "./indstocks-range-policy";
import {
  resolveIndstocksInstrument,
  INDSTOCKS_SUPPORTED_SYMBOLS,
  isIndstocksSupported,
} from "./indstocks-instruments.server";

// ────────────────────── Instrument Resolution ──────────────────────

describe("indstocks instruments", () => {
  it("resolves NIFTY50", () => {
    const i = resolveIndstocksInstrument("NIFTY50");
    expect(i).not.toBeNull();
    expect(i?.scripCode).toBe("NSE_26000");
    expect(i?.instrumentType).toBe("INDEX");
  });

  it("resolves BANKNIFTY", () => {
    const i = resolveIndstocksInstrument("BANKNIFTY");
    expect(i?.scripCode).toBe("NSE_26009");
  });

  it("resolves INDIA_VIX", () => {
    const i = resolveIndstocksInstrument("INDIA_VIX");
    expect(i?.scripCode).toBe("NSE_26017");
  });

  it("returns null for unsupported symbol", () => {
    expect(resolveIndstocksInstrument("GOLD")).toBeNull();
    expect(resolveIndstocksInstrument("BTC")).toBeNull();
    expect(resolveIndstocksInstrument("UNKNOWN")).toBeNull();
  });

  it("supported symbols list contains exactly 3", () => {
    expect(INDSTOCKS_SUPPORTED_SYMBOLS).toEqual(["NIFTY50", "BANKNIFTY", "INDIA_VIX"]);
  });

  it("isIndstocksSupported guard", () => {
    expect(isIndstocksSupported("NIFTY50")).toBe(true);
    expect(isIndstocksSupported("GOLD")).toBe(false);
  });
});

// ────────────────────── Normalizer ─────────────────────────────────

describe("indstocks normalizer", () => {
  it("parses valid candles from response", () => {
    const raw = {
      success: true,
      data: {
        candles: [
          { ts: 1720000000, o: 25000, h: 25100, l: 24900, c: 25050, v: 1000 },
          { ts: 1720003600, o: 25050, h: 25200, l: 25000, c: 25150, v: 1200 },
        ],
      },
    };
    const parsed = parseIndstocksCandles(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed![0].ts).toBe(1720000000);
  });

  it("returns null for invalid response", () => {
    expect(parseIndstocksCandles(null)).toBeNull();
    expect(parseIndstocksCandles({})).toBeNull();
    expect(parseIndstocksCandles({ data: {} })).toBeNull();
    expect(parseIndstocksCandles({ data: { candles: "not-array" } })).toBeNull();
  });

  it("normalizes candles and rejects invalid rows", () => {
    const raw = [
      { ts: 1720000000, o: 25000, h: 25100, l: 24900, c: 25050, v: 1000 },
      { ts: -1, o: 0, h: 0, l: 0, c: 0, v: 0 }, // invalid timestamp
      { ts: 1720003600, o: NaN, h: 25200, l: 25000, c: 25150, v: 1200 }, // NaN OHLC
      { ts: 1720007200, o: 25150, h: 25100, l: 25000, c: 25200, v: 900 }, // high < max
    ];
    const nowMs = Date.now();
    const result = normalizeIndstocksCandles(raw, nowMs);
    expect(result.candles).toHaveLength(1);
    expect(result.rejected).toHaveLength(3);
    expect(result.rejected[0].reason).toBe("invalid timestamp");
    expect(result.rejected[1].reason).toBe("non-finite OHLC");
  });

  it("rejects duplicate timestamps", () => {
    const raw = [
      { ts: 1720000000, o: 25000, h: 25100, l: 24900, c: 25050, v: 1000 },
      { ts: 1720000000, o: 25050, h: 25200, l: 25000, c: 25150, v: 1200 },
    ];
    const result = normalizeIndstocksCandles(raw, Date.now());
    expect(result.candles).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("duplicate timestamp");
  });

  it("rejects future candles", () => {
    const futureTs = Math.floor(Date.now() / 1000) + 120; // 2 minutes in future
    const raw = [{ ts: futureTs, o: 25000, h: 25100, l: 24900, c: 25050, v: 1000 }];
    const result = normalizeIndstocksCandles(raw, Date.now());
    expect(result.candles).toHaveLength(0);
    expect(result.rejected[0].reason).toBe("future candle");
  });

  it("converts Unix seconds to ISO time", () => {
    const raw = [{ ts: 1720000000, o: 25000, h: 25100, l: 24900, c: 25050, v: 1000 }];
    const result = normalizeIndstocksCandles(raw, Date.now());
    expect(result.candles[0].time).toBe(new Date(1720000000000).toISOString());
  });

  it("sorts candles ascending", () => {
    const raw = [
      { ts: 1720007200, o: 25150, h: 25200, l: 25000, c: 25200, v: 900 },
      { ts: 1720000000, o: 25000, h: 25100, l: 24900, c: 25050, v: 1000 },
    ];
    const result = normalizeIndstocksCandles(raw, Date.now());
    expect(result.candles[0].time < result.candles[1].time).toBe(true);
  });

  it("mergeCandleChunks deduplicates across chunks", () => {
    const chunk1 = [
      {
        time: "2024-07-03T00:00:00.000Z",
        open: 25000,
        high: 25100,
        low: 24900,
        close: 25050,
        volume: 1000,
        closed: true as const,
      },
      {
        time: "2024-07-04T00:00:00.000Z",
        open: 25050,
        high: 25200,
        low: 25000,
        close: 25150,
        volume: 1200,
        closed: true as const,
      },
    ];
    const chunk2 = [
      {
        time: "2024-07-04T00:00:00.000Z",
        open: 25050,
        high: 25200,
        low: 25000,
        close: 25150,
        volume: 1200,
        closed: true as const,
      },
      {
        time: "2024-07-05T00:00:00.000Z",
        open: 25150,
        high: 25300,
        low: 25100,
        close: 25250,
        volume: 1100,
        closed: true as const,
      },
    ];
    const merged = mergeIndstocksCandleChunks([chunk1, chunk2]);
    expect(merged).toHaveLength(3);
  });

  it("computeIndstocksDataQuality reports correctly", () => {
    const candles = [
      {
        time: "2024-07-03T00:00:00.000Z",
        open: 25000,
        high: 25100,
        low: 24900,
        close: 25050,
        volume: 1000,
        closed: true as const,
      },
    ];
    const dq = computeIndstocksDataQuality("2024-07-01", "2024-07-10", candles, []);
    expect(dq.candleCount).toBe(1);
    expect(dq.provider).toBe("INDSTOCKS");
    expect(dq.actualFrom).toBe("2024-07-03T00:00:00.000Z");
  });
});

// ────────────────────── Range Policy ───────────────────────────────

describe("indstocks range policy", () => {
  it("plans 1m range within 7-day window", () => {
    const plan = planIndstocksRange("1m", "2024-07-01", "2024-07-05");
    expect(plan.ok).toBe(true);
    expect(plan.chunks).toHaveLength(1);
  });

  it("splits 1m range exceeding 7 days", () => {
    const plan = planIndstocksRange("1m", "2024-07-01", "2024-07-20");
    expect(plan.ok).toBe(true);
    expect(plan.chunks.length).toBeGreaterThan(1);
  });

  it("1d range allows up to 365 days in one chunk", () => {
    const plan = planIndstocksRange("1d", "2024-01-01", "2024-12-31");
    expect(plan.ok).toBe(true);
    expect(plan.chunks).toHaveLength(1);
  });

  it("1h maximum window = 15 days (official INDstocks limit)", () => {
    const plan = planIndstocksRange("1h", "2024-07-01", "2024-07-16");
    expect(plan.ok).toBe(true);
    // 15 days = exactly 1 chunk
    expect(plan.chunks).toHaveLength(1);
  });

  it("1h range exceeding 15 days splits into multiple chunks", () => {
    const plan = planIndstocksRange("1h", "2024-07-01", "2024-07-20");
    expect(plan.ok).toBe(true);
    expect(plan.chunks.length).toBeGreaterThan(1);
  });

  it("rejects from > to", () => {
    const plan = planIndstocksRange("1d", "2024-07-10", "2024-07-01");
    expect(plan.ok).toBe(false);
  });

  it("rejects invalid date format", () => {
    const plan = planIndstocksRange("1d", "invalid", "2024-07-01");
    expect(plan.ok).toBe(false);
  });
});

// ────────────────────── HTTP Client ────────────────────────────────

describe("indstocks http client", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns AUTH_REQUIRED on 401", async () => {
    const client = new IndstocksHttpClient({
      token: "test-token",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
        headers: { get: () => null },
      }),
    });
    const res = await client.request({ path: "/test" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INDSTOCKS_AUTH_REQUIRED");
  });

  it("returns FORBIDDEN on 403", async () => {
    const client = new IndstocksHttpClient({
      token: "test-token",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Forbidden"),
        headers: { get: () => null },
      }),
    });
    const res = await client.request({ path: "/test" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INDSTOCKS_FORBIDDEN");
  });

  it("retries on 502/503/504", async () => {
    let calls = 0;
    const client = new IndstocksHttpClient({
      token: "test-token",
      maxRetries: 1,
      backoffBaseMs: 1,
      fetchImpl: vi.fn().mockImplementation(async () => {
        calls++;
        if (calls < 2) {
          return {
            ok: false,
            status: 502,
            text: () => Promise.resolve("Bad Gateway"),
            headers: { get: () => null },
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve({ success: true }),
          headers: { get: () => null },
        };
      }),
    });
    const res = await client.request({ path: "/test" });
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("retries on 429", async () => {
    let calls = 0;
    const client = new IndstocksHttpClient({
      token: "test-token",
      maxRetries: 1,
      backoffBaseMs: 1,
      fetchImpl: vi.fn().mockImplementation(async () => {
        calls++;
        if (calls < 2) {
          return {
            ok: false,
            status: 429,
            text: () => Promise.resolve("Rate Limited"),
            headers: { get: () => "5" },
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve({ success: true }),
          headers: { get: () => null },
        };
      }),
    });
    const res = await client.request({ path: "/test" });
    expect(res.ok).toBe(true);
  });

  it("does NOT retry on 400", async () => {
    let calls = 0;
    const client = new IndstocksHttpClient({
      token: "test-token",
      maxRetries: 2,
      backoffBaseMs: 1,
      fetchImpl: vi.fn().mockImplementation(async () => {
        calls++;
        return {
          ok: false,
          status: 400,
          text: () => Promise.resolve("Bad Request"),
          headers: { get: () => null },
        };
      }),
    });
    const res = await client.request({ path: "/test" });
    expect(res.ok).toBe(false);
    expect(calls).toBe(1); // no retry
  });

  it("handles network timeout", async () => {
    const client = new IndstocksHttpClient({
      token: "test-token",
      timeoutMs: 50,
      maxRetries: 0,
      fetchImpl: vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        return new Promise((_, reject) => {
          const signal = init.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      }),
    });
    const res = await client.request({ path: "/test" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INDSTOCKS_TIMEOUT");
  });

  it("handles network error", async () => {
    const client = new IndstocksHttpClient({
      token: "test-token",
      maxRetries: 0,
      fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });
    const res = await client.request({ path: "/test" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INDSTOCKS_NETWORK");
  });

  it("never exposes token in error messages", async () => {
    const client = new IndstocksHttpClient({
      token: "super-secret-token-12345",
      maxRetries: 0,
      fetchImpl: vi.fn().mockRejectedValue(new Error("Bearer super-secret-token-12345 failed")),
    });
    const res = await client.request({ path: "/test" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).not.toContain("super-secret-token-12345");
  });
});

// ────────────────────── Adapter Integration ────────────────────────

describe("indstocks adapter", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("fetchQuote returns UNSUPPORTED_SYMBOL for GOLD", async () => {
    const adapter = new IndstocksAdapter({ token: "test", fetchImpl: vi.fn() });
    const res = await adapter.fetchQuote("GOLD", new Date().toISOString());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("UNSUPPORTED_SYMBOL");
  });

  it("fetchQuote returns SCHEMA_ERROR when response missing last_price", async () => {
    const adapter = new IndstocksAdapter({
      token: "test",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
        headers: { get: () => null },
      }),
    });
    const res = await adapter.fetchQuote("NIFTY50", new Date().toISOString());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SCHEMA_ERROR");
  });

  it("fetchQuote returns data on success", async () => {
    const adapter = new IndstocksAdapter({
      token: "test",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              NSE_26000: {
                last_price: 25000,
                ohlc: { open: 24900, high: 25100, low: 24800, close: 24950 },
                volume: 100000,
                prev_close: 24950,
              },
            },
          }),
        headers: { get: () => null },
      }),
    });
    const res = await adapter.fetchQuote("NIFTY50", new Date().toISOString());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.symbol).toBe("NIFTY50");
      expect(res.data.last).toBe(25000);
      expect(res.data.prevClose).toBe(24950);
      expect(res.data.change).toBe(50);
    }
  });

  it("fetchHistorical returns UNSUPPORTED_SYMBOL for unsupported", async () => {
    const adapter = new IndstocksAdapter({ token: "test", fetchImpl: vi.fn() });
    const res = await adapter.fetchHistorical("GOLD", "1d", 30, new Date().toISOString());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("UNSUPPORTED_SYMBOL");
  });

  it("fetchHistorical returns UNSUPPORTED_TIMEFRAME for invalid tf", async () => {
    const adapter = new IndstocksAdapter({ token: "test", fetchImpl: vi.fn() });
    const res = await adapter.fetchHistorical(
      "NIFTY50",
      "2m" as never,
      30,
      new Date().toISOString(),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("UNSUPPORTED_TIMEFRAME");
  });

  it("fetchHistorical returns data on success", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const adapter = new IndstocksAdapter({
      token: "test",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              candles: [
                { ts: nowSec - 86400, o: 25000, h: 25100, l: 24900, c: 25050, v: 1000 },
                { ts: nowSec - 43200, o: 25050, h: 25200, l: 25000, c: 25150, v: 1200 },
              ],
            },
          }),
        headers: { get: () => null },
      }),
    });
    const res = await adapter.fetchHistorical("NIFTY50", "1d", 2, new Date().toISOString());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.symbol).toBe("NIFTY50");
      expect(res.data.timeframe).toBe("1d");
      expect(res.data.candles.length).toBeGreaterThan(0);
      expect(res.data.candles[0].close).toBe(25050);
    }
  });

  it("buildIndstocksProviderAdapter returns correct capability", () => {
    const adapter = buildIndstocksProviderAdapter({ token: "test" });
    expect(adapter.id).toBe("INDSTOCKS_V1");
    expect(adapter.label).toBe("INDstocks REST V1");
    expect(adapter.role).toBe("SECONDARY");
    expect(adapter.capability.domain).toBe("HISTORICAL");
    expect(adapter.capability.quotes).toContain("NIFTY50");
    expect(adapter.capability.historical).toContain("1d");
  });

  it("token never exposed in provider result errors", async () => {
    const adapter = new IndstocksAdapter({
      token: "super-secret-token-12345",
      maxRetries: 0,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized: Bearer super-secret-token-12345"),
        headers: { get: () => null },
      }),
    });
    const res = await adapter.fetchQuote("NIFTY50", new Date().toISOString());
    expect(res.ok).toBe(false);
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("super-secret-token-12345");
  });

  it("telemetry role = SECONDARY on successful quote", async () => {
    const adapter = new IndstocksAdapter({
      token: "test",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { NSE_26000: { last_price: 25000 } } }),
        headers: { get: () => null },
      }),
    });
    const res = await adapter.fetchQuote("NIFTY50", new Date().toISOString());
    expect(res.telemetry.role).toBe("SECONDARY");
  });

  it("telemetry role = SECONDARY on quote failure", async () => {
    const adapter = new IndstocksAdapter({
      token: "test",
      maxRetries: 0,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
        headers: { get: () => null },
      }),
    });
    const res = await adapter.fetchQuote("NIFTY50", new Date().toISOString());
    expect(res.telemetry.role).toBe("SECONDARY");
  });

  it("telemetry role = SECONDARY on unsupported symbol", async () => {
    const adapter = new IndstocksAdapter({ token: "test", fetchImpl: vi.fn() });
    const res = await adapter.fetchQuote("GOLD", new Date().toISOString());
    expect(res.telemetry.role).toBe("SECONDARY");
  });

  it("telemetry role = SECONDARY on successful historical", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const adapter = new IndstocksAdapter({
      token: "test",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              candles: [{ ts: nowSec - 86400, o: 25000, h: 25100, l: 24900, c: 25050, v: 1000 }],
            },
          }),
        headers: { get: () => null },
      }),
    });
    const res = await adapter.fetchHistorical("NIFTY50", "1d", 1, new Date().toISOString());
    expect(res.telemetry.role).toBe("SECONDARY");
  });

  it("telemetry role = SECONDARY on historical failure", async () => {
    const adapter = new IndstocksAdapter({
      token: "test",
      maxRetries: 0,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate Limited"),
        headers: { get: () => "5" },
      }),
    });
    const res = await adapter.fetchHistorical("NIFTY50", "1d", 1, new Date().toISOString());
    expect(res.telemetry.role).toBe("SECONDARY");
  });

  it("REST scripCode NSE_26000 unchanged for NIFTY50", () => {
    const i = resolveIndstocksInstrument("NIFTY50");
    expect(i?.scripCode).toBe("NSE_26000");
  });
});
