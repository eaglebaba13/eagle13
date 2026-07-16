import { describe, it, expect } from "vitest";
import {
  ALL_QUOTE_SYMBOLS,
  ALL_TIMEFRAMES,
  DEFAULT_FRESHNESS,
  DEFAULT_REFRESH_INTERVAL_MS,
  FailoverManager,
  PROVIDER_SESSION_PREFIX,
  ProviderCache,
  ProviderHealthManager,
  ProviderManager,
  ProviderRegistry,
  RateLimiter,
  classifyFreshness,
  computeProviderSessionId,
  createFactoryAdapter,
} from "./index";
import type {
  BreadthSnapshot,
  HistoricalCandle,
  OptionsChainSnapshot,
  ProviderAdapter,
  QuoteSymbol,
} from "./index";

const NOW_ISO = "2026-07-16T09:15:00.000Z";
const NOW_MS = 1_800_000_000_000;

function makeQuoteAdapter(overrides: Partial<Parameters<typeof createFactoryAdapter>[0]> = {}): ProviderAdapter {
  return createFactoryAdapter({
    id: "primary-quotes",
    label: "Primary Quotes",
    role: "PRIMARY",
    capability: { domain: "QUOTES", quotes: [...ALL_QUOTE_SYMBOLS] },
    quotes: {
      NIFTY50: { last: 25000, prevClose: 24900, high: 25100, low: 24800, open: 24950, ageSec: 5 },
      BANKNIFTY: { last: 55000, prevClose: 54800, ageSec: 5 },
      INDIA_VIX: { last: 12.5, prevClose: 12.9, ageSec: 5 },
      GOLD: { last: 71000, prevClose: 70900, ageSec: 10 },
      SILVER: { last: 91000, prevClose: 90900, ageSec: 10 },
      XAUUSD: { last: 2400, prevClose: 2395, currency: "USD", ageSec: 5 },
      BTC: { last: 68000, prevClose: 67500, currency: "USD", ageSec: 5 },
      CRUDEOIL: { last: 6800, prevClose: 6750, ageSec: 30 },
      NATURAL_GAS: { last: 260, prevClose: 258, ageSec: 30 },
      USDINR: { last: 83.5, prevClose: 83.4, ageSec: 20 },
    },
    ...overrides,
  });
}

function candles(n: number): HistoricalCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(NOW_MS - (n - i) * 60_000).toISOString(),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
    volume: 1000 + i,
    closed: true as const,
  }));
}

describe("provider foundation — types & freshness", () => {
  it("exposes all 10 quote symbols and 6 timeframes", () => {
    expect(ALL_QUOTE_SYMBOLS).toHaveLength(10);
    expect(new Set(ALL_QUOTE_SYMBOLS)).toEqual(
      new Set([
        "NIFTY50",
        "BANKNIFTY",
        "INDIA_VIX",
        "GOLD",
        "SILVER",
        "XAUUSD",
        "BTC",
        "CRUDEOIL",
        "NATURAL_GAS",
        "USDINR",
      ]),
    );
    expect(ALL_TIMEFRAMES).toEqual(["1m", "3m", "5m", "15m", "1h", "1d"]);
  });

  it("classifies freshness thresholds", () => {
    const p = DEFAULT_FRESHNESS.QUOTES;
    expect(classifyFreshness(5, p)).toBe("LIVE");
    expect(classifyFreshness(60, p)).toBe("DELAYED");
    expect(classifyFreshness(9999, p)).toBe("STALE");
    expect(classifyFreshness(-1, p)).toBe("OFFLINE");
  });
});

describe("provider run id", () => {
  it("is deterministic and prefixed", () => {
    const a = computeProviderSessionId({ primary: "p", secondary: "s", domain: "ALL", symbols: ["A", "B"], timeframes: ["1m"], startedAt: NOW_ISO });
    const b = computeProviderSessionId({ primary: "p", secondary: "s", domain: "ALL", symbols: ["B", "A"], timeframes: ["1m"], startedAt: NOW_ISO });
    expect(a).toBe(b);
    expect(a.startsWith(PROVIDER_SESSION_PREFIX + ":")).toBe(true);
  });
  it("changes with inputs", () => {
    const a = computeProviderSessionId({ primary: "p", domain: "ALL", symbols: [], timeframes: [], startedAt: NOW_ISO });
    const b = computeProviderSessionId({ primary: "q", domain: "ALL", symbols: [], timeframes: [], startedAt: NOW_ISO });
    expect(a).not.toBe(b);
  });
});

describe("rate limiter", () => {
  it("consumes tokens and refills over time", () => {
    const rl = new RateLimiter({ capacity: 2, refillPerSec: 1 });
    expect(rl.tryConsume(0).ok).toBe(true);
    expect(rl.tryConsume(0).ok).toBe(true);
    const denied = rl.tryConsume(0);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    // Refill 1 token after 1s
    expect(rl.tryConsume(1000).ok).toBe(true);
  });
  it("caps at capacity", () => {
    const rl = new RateLimiter({ capacity: 3, refillPerSec: 10 });
    // let a big gap pass
    const snap = rl.snapshot(100_000);
    expect(snap.remaining).toBe(3);
  });
});

describe("provider cache", () => {
  it("stores, retrieves, expires under namespace", () => {
    const c = new ProviderCache();
    c.set("k", { v: 1 }, 0, 1000);
    expect(c.get<{ v: number }>("k", 500)?.v).toBe(1);
    expect(c.get("k", 2000)).toBeNull();
    expect(c.keys().every((k) => k.startsWith("provider-foundation:"))).toBe(true);
  });
  it("tracks hits/misses/writes/evictions", () => {
    const c = new ProviderCache();
    c.set("a", 1, 0, 1000);
    c.get("a", 100);
    c.get("b", 100);
    c.invalidate("a");
    const s = c.snapshot();
    expect(s.writes).toBe(1);
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.evictions).toBeGreaterThanOrEqual(1);
  });
});

describe("health manager", () => {
  it("records samples and computes summary", () => {
    const h = new ProviderHealthManager("p");
    h.record({ at: NOW_ISO, ok: true, latencyMs: 50 }, "LIVE");
    h.record({ at: NOW_ISO, ok: false, latencyMs: 200, reason: "NETWORK" }, "FAILED");
    const s = h.summary();
    expect(s.calls).toBe(2);
    expect(s.errors).toBe(1);
    expect(s.errorRate).toBe(0.5);
    expect(s.transitions.length).toBeGreaterThanOrEqual(1);
  });
  it("emits a transition only when status changes", () => {
    const h = new ProviderHealthManager("p");
    h.record({ at: NOW_ISO, ok: true, latencyMs: 10 }, "LIVE");
    h.record({ at: NOW_ISO, ok: true, latencyMs: 10 }, "LIVE");
    h.record({ at: NOW_ISO, ok: false, latencyMs: 10, reason: "NETWORK" }, "FAILED");
    const s = h.summary();
    // initial LIVE assumed; only LIVE→FAILED emits a transition
    expect(s.transitions).toHaveLength(1);
    expect(s.transitions[0].to).toBe("FAILED");
  });
});

describe("registry", () => {
  it("registers, resolves by domain+role, prevents dupes", () => {
    const r = new ProviderRegistry();
    const a = makeQuoteAdapter();
    r.register(a);
    expect(r.get("primary-quotes")).toBe(a);
    expect(r.resolve("QUOTES", "PRIMARY")).toBe(a);
    expect(() => r.register(a)).toThrow();
    expect(r.unregister("primary-quotes")).toBe(true);
    expect(r.resolve("QUOTES", "PRIMARY")).toBeNull();
  });
  it("lists adapters in deterministic order", () => {
    const r = new ProviderRegistry();
    r.register(createFactoryAdapter({ id: "b", label: "B", role: "PRIMARY", capability: { domain: "QUOTES" } }));
    r.register(createFactoryAdapter({ id: "a", label: "A", role: "SECONDARY", capability: { domain: "QUOTES" } }));
    expect(r.list().map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("failover manager", () => {
  const f = new FailoverManager();
  const adapter = makeQuoteAdapter();
  it("picks primary when healthy", () => {
    const d = f.choose({ adapter, status: "LIVE" }, null);
    expect(d.role).toBe("PRIMARY");
  });
  it("failovers to secondary when primary failed", () => {
    const s = createFactoryAdapter({ id: "sec", label: "Sec", role: "SECONDARY", capability: { domain: "QUOTES" } });
    const d = f.choose({ adapter, status: "FAILED" }, { adapter: s, status: "LIVE" });
    expect(d.role).toBe("SECONDARY");
    expect(d.chosen?.id).toBe("sec");
  });
  it("chooses stale over hard-fail as best-available", () => {
    const d = f.choose({ adapter, status: "STALE" }, null);
    expect(d.chosen?.id).toBe(adapter.id);
    expect(d.reason).toMatch(/best-available/);
  });
  it("returns NONE when all offline", () => {
    const d = f.choose({ adapter, status: "OFFLINE" }, null);
    expect(d.chosen).toBeNull();
    expect(d.role).toBe("NONE");
  });
});

describe("factory adapter — fetch behaviors", () => {
  const nowIso = NOW_ISO;
  it("returns quote with telemetry for supported symbol", async () => {
    const a = makeQuoteAdapter();
    const res = await a.fetchQuote!("NIFTY50", nowIso);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.symbol).toBe("NIFTY50");
      expect(res.data.change).toBeCloseTo(100);
      expect(res.telemetry.status).toBe("LIVE");
      expect(res.telemetry.providerId).toBe("primary-quotes");
    }
  });
  it("rejects unsupported symbol", async () => {
    const a = createFactoryAdapter({ id: "q", label: "Q", role: "PRIMARY", capability: { domain: "QUOTES", quotes: ["NIFTY50"] }, quotes: { NIFTY50: { last: 1, ageSec: 1 } } });
    const res = await a.fetchQuote!("BTC" as QuoteSymbol, nowIso);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("UNSUPPORTED_SYMBOL");
  });
  it("reports RATE_LIMITED with retryAfterMs", async () => {
    const a = makeQuoteAdapter({ rateLimited: true });
    const res = await a.fetchQuote!("NIFTY50", nowIso);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("RATE_LIMITED");
      expect(res.telemetry.status).toBe("RATE_LIMITED");
      expect(res.telemetry.retryAfterMs).toBeGreaterThan(0);
    }
  });
  it("reports OFFLINE when offline flag set", async () => {
    const a = makeQuoteAdapter({ offline: true });
    const res = await a.fetchQuote!("NIFTY50", nowIso);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.telemetry.status).toBe("OFFLINE");
  });
  it("marks STALE when age exceeds delayedMaxSec", async () => {
    const a = createFactoryAdapter({
      id: "stalep",
      label: "Stale",
      role: "PRIMARY",
      capability: { domain: "QUOTES", quotes: ["NIFTY50"] },
      quotes: { NIFTY50: { last: 25000, ageSec: 5000 } },
    });
    const res = await a.fetchQuote!("NIFTY50", nowIso);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.telemetry.status).toBe("STALE");
  });
  it("returns historical candles for supported timeframe", async () => {
    const a = createFactoryAdapter({
      id: "h",
      label: "H",
      role: "PRIMARY",
      capability: { domain: "HISTORICAL", historical: ["1m", "5m"] },
      historical: { "NIFTY50:1m": candles(10) },
    });
    const res = await a.fetchHistorical!("NIFTY50", "1m", 5, nowIso);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.candles).toHaveLength(5);
  });
  it("rejects unsupported timeframe", async () => {
    const a = createFactoryAdapter({
      id: "h2",
      label: "H",
      role: "PRIMARY",
      capability: { domain: "HISTORICAL", historical: ["1d"] },
      historical: {},
    });
    const res = await a.fetchHistorical!("NIFTY50", "1m", 5, nowIso);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("UNSUPPORTED_TIMEFRAME");
  });
  it("returns options chain and breadth snapshots", async () => {
    const chain: OptionsChainSnapshot = {
      underlying: "NIFTY",
      expiry: "2026-07-31",
      rows: [
        { strike: 25000, ceOi: 100, peOi: 200, ceOiChange: 10, peOiChange: 5, ceIv: 12, peIv: 13 },
      ],
      pcr: 2,
      maxPain: 25000,
      telemetry: {
        status: "LIVE", latencyMs: 0, receivedAt: nowIso, providerTime: null,
        marketSession: "REGULAR", rateLimit: null, retryAfterMs: null,
        staleReason: null, providerId: "o", role: "PRIMARY",
      },
    };
    const breadth: BreadthSnapshot = {
      universe: "NIFTY50",
      advances: 30, declines: 18, unchanged: 2,
      telemetry: {
        status: "LIVE", latencyMs: 0, receivedAt: nowIso, providerTime: null,
        marketSession: "REGULAR", rateLimit: null, retryAfterMs: null,
        staleReason: null, providerId: "b", role: "PRIMARY",
      },
    };
    const a = createFactoryAdapter({
      id: "mix", label: "Mix", role: "PRIMARY",
      capability: { domain: "OPTIONS", options: ["NIFTY"], breadth: ["NIFTY50"] },
      options: { NIFTY: chain },
      breadth: { NIFTY50: breadth },
    });
    const oc = await a.fetchOptionsChain!("NIFTY", "2026-07-31", nowIso);
    expect(oc.ok).toBe(true);
    const b = await a.fetchBreadth!("NIFTY50", nowIso);
    expect(b.ok).toBe(true);
  });
});

describe("provider manager — orchestration", () => {
  function build(opts: { primary?: Partial<Parameters<typeof createFactoryAdapter>[0]>; secondary?: Partial<Parameters<typeof createFactoryAdapter>[0]> } = {}) {
    const primary = makeQuoteAdapter({ id: "p", ...opts.primary });
    const secondary = createFactoryAdapter({
      id: "s",
      label: "Secondary",
      role: "SECONDARY",
      capability: { domain: "QUOTES", quotes: [...ALL_QUOTE_SYMBOLS] },
      quotes: { NIFTY50: { last: 24990, prevClose: 24900, ageSec: 20 } },
      ...opts.secondary,
    });
    const mgr = new ProviderManager({ startedAt: NOW_ISO, primary: primary.id, secondary: secondary.id });
    mgr.register(primary);
    mgr.register(secondary);
    mgr.wire({ domain: "QUOTES", primaryId: primary.id, secondaryId: secondary.id, rateLimit: { capacity: 5, refillPerSec: 5 } });
    return { mgr, primary, secondary };
  }

  it("has a deterministic session id", () => {
    const a = build().mgr.sessionId;
    const b = build().mgr.sessionId;
    expect(a).toBe(b);
    expect(a.startsWith(PROVIDER_SESSION_PREFIX + ":")).toBe(true);
  });

  it("resolves quote via primary and caches result", async () => {
    const { mgr } = build();
    const r1 = await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS });
    expect(r1.ok).toBe(true);
    // Second call should be cache hit (no additional provider miss)
    const before = mgr.diagnostics().cache.hits;
    const r2 = await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS + 100 });
    expect(r2.ok).toBe(true);
    expect(mgr.diagnostics().cache.hits).toBe(before + 1);
  });

  it("bypasses cache when requested", async () => {
    const { mgr } = build();
    await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS });
    const beforeMisses = mgr.diagnostics().cache.misses;
    await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS + 10, bypassCache: true });
    expect(mgr.diagnostics().cache.misses).toBe(beforeMisses);
  });

  it("failovers to secondary when primary offline", async () => {
    const { mgr, primary } = build({ primary: { offline: true } });
    // First call: primary offline → health flips → decision routes to secondary
    const r1 = await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS });
    // In-run fallback path still returns primary failure first pass; but manager
    // internally attempts the other side on failure, so overall result must be ok.
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.telemetry.providerId).toBe("s");
    expect(primary.id).toBe("p");
  });

  it("returns UNAVAILABLE when all providers offline", async () => {
    const { mgr } = build({ primary: { offline: true }, secondary: { offline: true } });
    const r = await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS });
    expect(r.ok).toBe(false);
  });

  it("enforces domain rate limits", async () => {
    const primary = makeQuoteAdapter({ id: "p" });
    const mgr = new ProviderManager({ startedAt: NOW_ISO, primary: "p" });
    mgr.register(primary);
    mgr.wire({ domain: "QUOTES", primaryId: "p", secondaryId: null, rateLimit: { capacity: 1, refillPerSec: 0.001 } });
    const first = await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS, bypassCache: true });
    expect(first.ok).toBe(true);
    const second = await mgr.getQuote("BANKNIFTY", { nowIso: NOW_ISO, nowMs: NOW_MS + 1, bypassCache: true });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("RATE_LIMITED");
      expect(second.telemetry.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("tracks health transitions across calls", async () => {
    const { mgr } = build({ primary: { offline: true } });
    await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS });
    const diag = mgr.diagnostics();
    const primaryHealth = diag.health.find((h) => h.providerId === "p")!;
    expect(primaryHealth.errors).toBeGreaterThan(0);
    expect(primaryHealth.status).toBe("OFFLINE");
  });

  it("exposes diagnostics with wirings and last decisions", async () => {
    const { mgr } = build();
    await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS });
    const d = mgr.diagnostics();
    expect(d.wirings).toHaveLength(1);
    expect(d.wirings[0].refreshIntervalMs).toBe(DEFAULT_REFRESH_INTERVAL_MS.QUOTES);
    expect(d.lastDecisions.length).toBeGreaterThan(0);
    expect(d.sessionId).toBe(mgr.sessionId);
  });

  it("supports historical, options, breadth wirings", async () => {
    const hist = createFactoryAdapter({
      id: "h", label: "H", role: "PRIMARY",
      capability: { domain: "HISTORICAL", historical: ["1m"] },
      historical: { "NIFTY50:1m": candles(3) },
    });
    const mgr = new ProviderManager({ startedAt: NOW_ISO, primary: "h" });
    mgr.register(hist);
    mgr.wire({ domain: "HISTORICAL", primaryId: "h", secondaryId: null });
    const r = await mgr.getHistorical("NIFTY50", "1m", 3, { nowIso: NOW_ISO, nowMs: NOW_MS });
    expect(r.ok).toBe(true);
  });

  it("clearCache invalidates all entries", async () => {
    const { mgr } = build();
    await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS });
    mgr.clearCache();
    const misses = mgr.diagnostics().cache.misses;
    await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS + 100 });
    expect(mgr.diagnostics().cache.misses).toBeGreaterThan(misses);
  });

  it("is deterministic across identical runs", async () => {
    const runOnce = async () => {
      const { mgr } = build();
      const r = await mgr.getQuote("NIFTY50", { nowIso: NOW_ISO, nowMs: NOW_MS });
      return { session: mgr.sessionId, ok: r.ok, price: r.ok ? r.data.last : null };
    };
    const a = await runOnce();
    const b = await runOnce();
    expect(a).toEqual(b);
  });
});
