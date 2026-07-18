// Phase 3F — CoinDCX server-side fetch layer.
// Server-only: never import from a client bundle. Uses the public
// allowlisted endpoints. NO authentication, NO private keys.

import { COINDCX_ENDPOINTS, COINDCX_INTERVAL_MAP, assertAllowlistedEndpoint, type CoindcxSupportedInterval } from "./endpoints";
import { parseMarketsDetails } from "./market-discovery";
import { indexTickers } from "./ticker";
import { parseCandles } from "./candles";
import { classifyCoindcxFreshness } from "./freshness";
import { assertExecutionGuardIntact } from "./execution-guard";
import type {
  CoindcxCandleSnapshot,
  CoindcxDataSnapshotMeta,
  CoindcxMarket,
  CoindcxMarketSnapshot,
  MarketSourceStatus,
} from "./types";

const DEFAULT_TIMEOUT_MS = 8_000;

// ─── In-memory cache (server-instance scoped) ────────────────────────
interface CacheEntry<T> {
  readonly value: T;
  readonly fetchedAt: number;
}

const CACHE = {
  markets: null as CacheEntry<readonly CoindcxMarket[]> | null,
  tickers: null as CacheEntry<{ readonly rows: unknown; readonly nowIso: string }> | null,
};

const CACHE_TTL_MS = {
  markets: 15 * 60_000, // discovery — 15 min
  tickers: 10_000,      // tickers — 10s
};

let LAST_DISCOVERY: { readonly at: string; readonly latencyMs: number } | null = null;
let LAST_ERROR: string | null = null;

function safeError(err: unknown): string {
  if (err instanceof Error) return err.name === "AbortError" ? "TIMEOUT" : err.message.slice(0, 200);
  return "UNKNOWN_ERROR";
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<{
  readonly ok: boolean;
  readonly json: unknown;
  readonly status: number;
  readonly latencyMs: number;
  readonly error: string | null;
  readonly requestId: string | null;
}> {
  assertAllowlistedEndpoint(url);
  assertExecutionGuardIntact();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    const latency = Date.now() - started;
    const requestId = res.headers.get("x-request-id");
    if (!res.ok) {
      return { ok: false, json: null, status: res.status, latencyMs: latency, error: `HTTP_${res.status}`, requestId };
    }
    const json = await res.json();
    return { ok: true, json, status: res.status, latencyMs: latency, error: null, requestId };
  } catch (err) {
    return { ok: false, json: null, status: 0, latencyMs: Date.now() - started, error: safeError(err), requestId: null };
  } finally {
    clearTimeout(timer);
  }
}

function buildMeta(
  endpoint: string,
  latencyMs: number,
  fetchedAtMs: number,
  nowMs: number,
  status: MarketSourceStatus,
  error: string | null,
  requestId: string | null,
): CoindcxDataSnapshotMeta {
  const ageSec = Math.max(0, (nowMs - fetchedAtMs) / 1000);
  return {
    providerId: "COINDCX",
    endpoint,
    status,
    latencyMs,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    ageSec,
    safeError: error,
    upstreamCode: null,
    requestId,
    tradingEnabledFlag: false,
    sessionSemantics: "24x7",
  };
}

// ─── Discovery ───────────────────────────────────────────────────────
export async function discoverMarkets(nowIso: string): Promise<{
  readonly markets: readonly CoindcxMarket[];
  readonly meta: CoindcxDataSnapshotMeta;
}> {
  const nowMs = Date.parse(nowIso) || Date.now();
  const cached = CACHE.markets;
  if (cached && nowMs - cached.fetchedAt < CACHE_TTL_MS.markets) {
    const meta = buildMeta(
      COINDCX_ENDPOINTS.marketsDetails,
      0,
      cached.fetchedAt,
      nowMs,
      classifyCoindcxFreshness((nowMs - cached.fetchedAt) / 1000),
      null,
      null,
    );
    return { markets: cached.value, meta };
  }
  const res = await fetchJson(COINDCX_ENDPOINTS.marketsDetails);
  if (!res.ok) {
    LAST_ERROR = res.error;
    const meta = buildMeta(COINDCX_ENDPOINTS.marketsDetails, res.latencyMs, nowMs, nowMs, "UNAVAILABLE", res.error, res.requestId);
    return { markets: cached?.value ?? [], meta };
  }
  const markets = parseMarketsDetails(res.json);
  const at = Date.now();
  CACHE.markets = { value: markets, fetchedAt: at };
  LAST_DISCOVERY = { at: new Date(at).toISOString(), latencyMs: res.latencyMs };
  LAST_ERROR = null;
  return {
    markets,
    meta: buildMeta(COINDCX_ENDPOINTS.marketsDetails, res.latencyMs, at, nowMs, "LIVE", null, res.requestId),
  };
}

// ─── Ticker snapshots ────────────────────────────────────────────────
export async function fetchAllTickers(nowIso: string): Promise<{
  readonly tickers: ReturnType<typeof indexTickers>;
  readonly meta: CoindcxDataSnapshotMeta;
}> {
  const nowMs = Date.parse(nowIso) || Date.now();
  const cached = CACHE.tickers;
  if (cached && nowMs - cached.fetchedAt < CACHE_TTL_MS.tickers) {
    const meta = buildMeta(
      COINDCX_ENDPOINTS.ticker,
      0,
      cached.fetchedAt,
      nowMs,
      classifyCoindcxFreshness((nowMs - cached.fetchedAt) / 1000),
      null,
      null,
    );
    return { tickers: indexTickers(cached.value.rows, cached.value.nowIso), meta };
  }
  const res = await fetchJson(COINDCX_ENDPOINTS.ticker);
  if (!res.ok) {
    LAST_ERROR = res.error;
    return {
      tickers: new Map(),
      meta: buildMeta(COINDCX_ENDPOINTS.ticker, res.latencyMs, nowMs, nowMs, "UNAVAILABLE", res.error, res.requestId),
    };
  }
  const at = Date.now();
  CACHE.tickers = { value: { rows: res.json, nowIso }, fetchedAt: at };
  return {
    tickers: indexTickers(res.json, nowIso),
    meta: buildMeta(COINDCX_ENDPOINTS.ticker, res.latencyMs, at, nowMs, "LIVE", null, res.requestId),
  };
}

export async function getMarketSnapshots(nowIso: string): Promise<readonly CoindcxMarketSnapshot[]> {
  const [{ markets }, { tickers }] = await Promise.all([discoverMarkets(nowIso), fetchAllTickers(nowIso)]);
  const nowMs = Date.parse(nowIso) || Date.now();
  return markets.map((market) => {
    const t = tickers.get(market.pair) ?? null;
    const status: MarketSourceStatus = t ? "LIVE" : "DELAYED";
    const meta = buildMeta(COINDCX_ENDPOINTS.ticker, 0, nowMs, nowMs, status, null, null);
    return { market, ticker: t, meta };
  });
}

// ─── Candles ─────────────────────────────────────────────────────────
export async function getCandleSnapshot(input: {
  pair: string;
  interval: CoindcxSupportedInterval;
  nowIso: string;
}): Promise<CoindcxCandleSnapshot | null> {
  const { markets } = await discoverMarkets(input.nowIso);
  const market = markets.find((m) => m.pair === input.pair);
  if (!market) return null;
  const nowMs = Date.parse(input.nowIso) || Date.now();
  const interval = COINDCX_INTERVAL_MAP[input.interval];
  const url = `${COINDCX_ENDPOINTS.candles}?pair=${encodeURIComponent(input.pair)}&interval=${encodeURIComponent(interval)}`;
  const res = await fetchJson(url);
  if (!res.ok) {
    return {
      market,
      interval,
      candles: [],
      meta: buildMeta(COINDCX_ENDPOINTS.candles, res.latencyMs, nowMs, nowMs, "UNAVAILABLE", res.error, res.requestId),
    };
  }
  const at = Date.now();
  return {
    market,
    interval,
    candles: parseCandles(res.json),
    meta: buildMeta(COINDCX_ENDPOINTS.candles, res.latencyMs, at, nowMs, "LIVE", null, res.requestId),
  };
}

// ─── Diagnostics accessors ───────────────────────────────────────────
export function getLastDiscovery(): { at: string; latencyMs: number } | null {
  return LAST_DISCOVERY;
}

export function getLastError(): string | null {
  return LAST_ERROR;
}

/** Test-only reset. Do not call from application code. */
export function _resetCoindcxCaches(): void {
  CACHE.markets = null;
  CACHE.tickers = null;
  LAST_DISCOVERY = null;
  LAST_ERROR = null;
}
