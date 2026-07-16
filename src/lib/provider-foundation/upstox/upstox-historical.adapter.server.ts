// Provider-foundation adapter that speaks the official Upstox V3
// historical + intraday candle endpoints. Server-only.

import type {
  HistoricalSeries,
  ProviderAdapter,
  ProviderResult,
  ProviderTelemetry,
  QuoteSymbol,
  QuoteTick,
  Timeframe,
} from "../types";
import { DEFAULT_FRESHNESS, classifyFreshness } from "../types";
import {
  TIMEFRAME_TO_UPSTOX,
  UPSTOX_ADAPTER_ID,
  UPSTOX_ADAPTER_VERSION,
  UPSTOX_CACHE_NAMESPACE,
  type UpstoxErrorCode,
} from "./upstox-types";
import {
  UpstoxHttpClient,
  type UpstoxHttpConfig,
  type UpstoxHttpResult,
} from "./upstox-http.server";
import { resolveInstrument, UPSTOX_SUPPORTED_SYMBOLS } from "./upstox-instruments.server";
import { planRange, policyFor } from "./upstox-range-policy";
import {
  computeDataQuality,
  mergeCandleChunks,
  normalizeCandles,
  parseUpstoxCandles,
  tupleToRaw,
} from "./upstox-normalizer";

export interface UpstoxAdapterOptions extends UpstoxHttpConfig {
  readonly httpClient?: UpstoxHttpClient;
}

function providerTelemetry(input: {
  ok: boolean;
  code?: UpstoxErrorCode;
  latencyMs: number;
  nowIso: string;
  ageSec: number;
  retryAfterMs?: number;
  role: "PRIMARY" | "SECONDARY" | "OFFLINE";
  providerTime: string | null;
  reason: string | null;
}): ProviderTelemetry {
  const status: ProviderTelemetry["status"] = input.ok
    ? classifyFreshness(input.ageSec, DEFAULT_FRESHNESS.HISTORICAL)
    : input.code === "UPSTOX_RATE_LIMITED"
      ? "RATE_LIMITED"
      : input.code === "UPSTOX_AUTH_REQUIRED" || input.code === "UPSTOX_FORBIDDEN"
        ? "OFFLINE"
        : input.code === "UPSTOX_DATA_UNAVAILABLE" || input.code === "UPSTOX_UNSUPPORTED_RANGE" || input.code === "UPSTOX_UNSUPPORTED_TIMEFRAME"
          ? "OFFLINE"
          : "FAILED";
  return {
    status,
    latencyMs: input.latencyMs,
    receivedAt: input.nowIso,
    providerTime: input.providerTime,
    marketSession: "UNKNOWN",
    rateLimit: null,
    retryAfterMs: input.retryAfterMs ?? null,
    staleReason: input.reason,
    providerId: UPSTOX_ADAPTER_ID,
    role: input.role,
  };
}

function errorToReason(code: UpstoxErrorCode): "UNAVAILABLE" | "RATE_LIMITED" | "AUTH_REQUIRED" | "UNSUPPORTED_SYMBOL" | "UNSUPPORTED_TIMEFRAME" | "SCHEMA_ERROR" | "TIMEOUT" | "NETWORK" | "UNKNOWN" {
  switch (code) {
    case "UPSTOX_AUTH_REQUIRED": return "AUTH_REQUIRED";
    case "UPSTOX_FORBIDDEN": return "UNAVAILABLE";
    case "UPSTOX_RATE_LIMITED": return "RATE_LIMITED";
    case "UPSTOX_TIMEOUT": return "TIMEOUT";
    case "UPSTOX_SCHEMA_ERROR": return "SCHEMA_ERROR";
    case "UPSTOX_DATA_UNAVAILABLE": return "UNAVAILABLE";
    case "UPSTOX_UNSUPPORTED_RANGE": return "UNAVAILABLE";
    case "UPSTOX_UNSUPPORTED_TIMEFRAME": return "UNSUPPORTED_TIMEFRAME";
    case "UPSTOX_NETWORK": return "NETWORK";
    default: return "UNKNOWN";
  }
}

function buildHistoricalPath(
  instrumentKey: string,
  tf: Timeframe,
  from: string,
  to: string,
): string | null {
  const mapped = TIMEFRAME_TO_UPSTOX[tf];
  if (!mapped) return null;
  const encInstr = encodeURIComponent(instrumentKey);
  return `v3/historical-candle/${encInstr}/${mapped.unit}/${mapped.interval}/${to}/${from}`;
}

function buildIntradayPath(instrumentKey: string, tf: Timeframe): string | null {
  const mapped = TIMEFRAME_TO_UPSTOX[tf];
  if (!mapped) return null;
  const encInstr = encodeURIComponent(instrumentKey);
  return `v3/historical-candle/intraday/${encInstr}/${mapped.unit}/${mapped.interval}`;
}

function quoteTelemetry(input: {
  ok: boolean;
  code?: UpstoxErrorCode;
  latencyMs: number;
  nowIso: string;
  retryAfterMs?: number;
  reason: string | null;
}): ProviderTelemetry {
  const status = input.ok
    ? "LIVE"
    : input.code === "UPSTOX_RATE_LIMITED"
      ? "RATE_LIMITED"
      : input.code === "UPSTOX_AUTH_REQUIRED" || input.code === "UPSTOX_FORBIDDEN"
        ? "OFFLINE"
        : input.code === "UPSTOX_DATA_UNAVAILABLE"
          ? "OFFLINE"
          : "FAILED";
  return {
    status,
    latencyMs: input.latencyMs,
    receivedAt: input.nowIso,
    providerTime: null,
    marketSession: "UNKNOWN",
    rateLimit: null,
    retryAfterMs: input.retryAfterMs ?? null,
    staleReason: input.reason,
    providerId: UPSTOX_ADAPTER_ID,
    role: "PRIMARY",
  };
}

function isoToday(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function ageSecFromIso(iso: string | null, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - t) / 1000);
}

/** Deterministic cache key builder. */
export function upstoxHistoricalCacheKey(input: {
  instrumentKey: string;
  timeframe: Timeframe;
  from: string;
  to: string;
}): string {
  return `${UPSTOX_CACHE_NAMESPACE}:historical:${UPSTOX_ADAPTER_VERSION}:${input.instrumentKey}:${input.timeframe}:${input.from}:${input.to}`;
}

export interface FetchHistoricalRangeInput {
  readonly symbol: QuoteSymbol | string;
  readonly timeframe: Timeframe;
  readonly from: string;
  readonly to: string;
  readonly nowIso: string;
  readonly nowMs: number;
}

export class UpstoxHistoricalAdapter {
  readonly id = UPSTOX_ADAPTER_ID;
  readonly version = UPSTOX_ADAPTER_VERSION;

  private readonly http: UpstoxHttpClient;

  constructor(opts: UpstoxAdapterOptions = {}) {
    this.http = opts.httpClient ?? new UpstoxHttpClient(opts);
  }

  tokenStatus() {
    return this.http.tokenStatus();
  }

  /** Fetch a read-only quote through Upstox market quote API. */
  async fetchQuote(symbol: QuoteSymbol, nowIso: string): Promise<ProviderResult<QuoteTick>> {
    const instr = resolveInstrument(symbol);
    if (!instr) {
      return {
        ok: false,
        reason: "UNSUPPORTED_SYMBOL",
        detail: `${symbol} is not in the Upstox instrument master`,
        telemetry: quoteTelemetry({
          ok: false,
          code: "UPSTOX_DATA_UNAVAILABLE",
          latencyMs: 0,
          nowIso,
          reason: "unsupported symbol",
        }),
      };
    }
    const res = await this.http.request<{
      status?: string;
      data?: Record<
        string,
        {
          last_price?: number;
          ohlc?: { open?: number; high?: number; low?: number; close?: number };
          volume?: number;
        }
      >;
    }>({
      path: "v2/market-quote/quotes",
      query: { instrument_key: instr.instrumentKey },
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: errorToReason(res.error.code),
        detail: res.error.message,
        telemetry: quoteTelemetry({
          ok: false,
          code: res.error.code,
          latencyMs: res.latencyMs,
          nowIso,
          reason: res.error.message,
          retryAfterMs: res.error.retryAfterMs,
        }),
      };
    }
    const row = res.data?.data ? Object.values(res.data.data)[0] : undefined;
    const last = row?.last_price;
    if (typeof last !== "number" || !Number.isFinite(last)) {
      return {
        ok: false,
        reason: "SCHEMA_ERROR",
        detail: "missing quote last_price",
        telemetry: quoteTelemetry({
          ok: false,
          code: "UPSTOX_SCHEMA_ERROR",
          latencyMs: res.latencyMs,
          nowIso,
          reason: "missing quote last_price",
        }),
      };
    }
    const prevClose = row?.ohlc?.close ?? null;
    const telemetry = quoteTelemetry({ ok: true, latencyMs: res.latencyMs, nowIso, reason: null });
    const tick: QuoteTick = {
      symbol,
      last,
      open: row?.ohlc?.open ?? null,
      high: row?.ohlc?.high ?? null,
      low: row?.ohlc?.low ?? null,
      prevClose,
      change: prevClose != null ? last - prevClose : null,
      changePct: prevClose != null && prevClose !== 0 ? ((last - prevClose) / prevClose) * 100 : null,
      volume: row?.volume ?? null,
      currency: "INR",
      telemetry,
    };
    return { ok: true, data: tick, telemetry };
  }

  /** Fetch a bounded historical range with deterministic chunking. */
  async fetchRange(input: FetchHistoricalRangeInput): Promise<ProviderResult<HistoricalSeries>> {
    const instr = resolveInstrument(input.symbol);
    if (!instr) {
      return {
        ok: false,
        reason: "UNSUPPORTED_SYMBOL",
        detail: `${input.symbol} is not in the Upstox instrument master`,
        telemetry: providerTelemetry({
          ok: false, code: "UPSTOX_DATA_UNAVAILABLE", latencyMs: 0,
          nowIso: input.nowIso, ageSec: Infinity, role: "PRIMARY",
          providerTime: null, reason: "unsupported symbol",
        }),
      };
    }
    if (!(input.timeframe in TIMEFRAME_TO_UPSTOX)) {
      return {
        ok: false,
        reason: "UNSUPPORTED_TIMEFRAME",
        telemetry: providerTelemetry({
          ok: false, code: "UPSTOX_UNSUPPORTED_TIMEFRAME", latencyMs: 0,
          nowIso: input.nowIso, ageSec: Infinity, role: "PRIMARY",
          providerTime: null, reason: "unsupported timeframe",
        }),
      };
    }

    const plan = planRange(input.timeframe, input.from, input.to);
    if (!plan.ok) {
      return {
        ok: false,
        reason: "UNAVAILABLE",
        detail: plan.reason,
        telemetry: providerTelemetry({
          ok: false, code: "UPSTOX_UNSUPPORTED_RANGE", latencyMs: 0,
          nowIso: input.nowIso, ageSec: Infinity, role: "PRIMARY",
          providerTime: null, reason: plan.reason,
        }),
      };
    }

    const chunkResults = [] as (readonly import("../types").HistoricalCandle[])[];
    let totalLatency = 0;
    let lastErr: { code: UpstoxErrorCode; message: string; retryAfterMs?: number } | null = null;
    let totalRejected = 0;

    for (const chunk of plan.chunks) {
      const path = buildHistoricalPath(instr.instrumentKey, input.timeframe, chunk.from, chunk.to);
      if (!path) {
        lastErr = { code: "UPSTOX_UNSUPPORTED_TIMEFRAME", message: "cannot map timeframe" };
        break;
      }
      const res: UpstoxHttpResult<unknown> = await this.http.request<unknown>({ path });
      totalLatency += res.latencyMs;
      if (!res.ok) {
        lastErr = res.error;
        break;
      }
      const tuples = parseUpstoxCandles(res.data);
      if (!tuples) {
        lastErr = { code: "UPSTOX_SCHEMA_ERROR", message: "missing data.candles[]" };
        break;
      }
      const raws = tuples.map(tupleToRaw).filter((x): x is NonNullable<typeof x> => x != null);
      const norm = normalizeCandles(raws, input.nowMs);
      totalRejected += norm.rejected.length;
      chunkResults.push(norm.candles);
    }

    if (lastErr) {
      return {
        ok: false,
        reason: errorToReason(lastErr.code),
        detail: lastErr.message,
        telemetry: providerTelemetry({
          ok: false, code: lastErr.code, latencyMs: totalLatency,
          nowIso: input.nowIso, ageSec: Infinity, role: "PRIMARY",
          providerTime: null, reason: lastErr.message,
          retryAfterMs: lastErr.retryAfterMs,
        }),
      };
    }

    const merged = mergeCandleChunks(chunkResults);
    const dq = computeDataQuality(input.from, input.to, merged, [], 0);
    const ageSec = ageSecFromIso(dq.actualTo, input.nowMs);
    const series: HistoricalSeries = {
      symbol: input.symbol,
      timeframe: input.timeframe,
      candles: merged,
      telemetry: providerTelemetry({
        ok: true, latencyMs: totalLatency, nowIso: input.nowIso, ageSec,
        role: "PRIMARY", providerTime: dq.actualTo,
        reason: totalRejected > 0 ? `rejected ${totalRejected} rows` : null,
      }),
    };
    return { ok: true, data: series, telemetry: series.telemetry };
  }

  /** Provider-foundation adapter contract: fetch a limited window ending "now". */
  async fetchHistorical(
    symbol: QuoteSymbol | string,
    timeframe: Timeframe,
    limit: number,
    nowIso: string,
  ): Promise<ProviderResult<HistoricalSeries>> {
    const nowMs = Date.parse(nowIso);
    if (!Number.isFinite(nowMs)) {
      return {
        ok: false, reason: "UNKNOWN",
        telemetry: providerTelemetry({
          ok: false, code: "UPSTOX_UNKNOWN", latencyMs: 0, nowIso,
          ageSec: Infinity, role: "PRIMARY", providerTime: null,
          reason: "invalid nowIso",
        }),
      };
    }
    // Approximate calendar span from candle count and timeframe.
    const perDay: Record<Timeframe, number> = {
      "1m": 375, "3m": 125, "5m": 75, "15m": 25, "1h": 6, "1d": 1,
    };
    const days = Math.max(1, Math.ceil(limit / (perDay[timeframe] ?? 1)));
    const to = new Date(nowMs);
    const from = new Date(nowMs);
    from.setUTCDate(from.getUTCDate() - days);
    return this.fetchRange({
      symbol,
      timeframe,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      nowIso,
      nowMs,
    });
  }

  /** Fetch current-day intraday candles from the official V3 endpoint. */
  async fetchIntraday(
    symbol: QuoteSymbol | string,
    timeframe: Timeframe,
    nowIso: string,
  ): Promise<ProviderResult<HistoricalSeries>> {
    const instr = resolveInstrument(symbol);
    if (!instr) {
      return {
        ok: false, reason: "UNSUPPORTED_SYMBOL",
        telemetry: providerTelemetry({
          ok: false, code: "UPSTOX_DATA_UNAVAILABLE", latencyMs: 0,
          nowIso, ageSec: Infinity, role: "PRIMARY",
          providerTime: null, reason: "unsupported symbol",
        }),
      };
    }
    const path = buildIntradayPath(instr.instrumentKey, timeframe);
    if (!path) {
      return {
        ok: false, reason: "UNSUPPORTED_TIMEFRAME",
        telemetry: providerTelemetry({
          ok: false, code: "UPSTOX_UNSUPPORTED_TIMEFRAME", latencyMs: 0,
          nowIso, ageSec: Infinity, role: "PRIMARY",
          providerTime: null, reason: "unsupported timeframe",
        }),
      };
    }
    const res = await this.http.request<unknown>({ path });
    if (!res.ok) {
      return {
        ok: false,
        reason: errorToReason(res.error.code),
        detail: res.error.message,
        telemetry: providerTelemetry({
          ok: false, code: res.error.code, latencyMs: res.latencyMs,
          nowIso, ageSec: Infinity, role: "PRIMARY", providerTime: null,
          reason: res.error.message, retryAfterMs: res.error.retryAfterMs,
        }),
      };
    }
    const nowMs = Date.parse(nowIso);
    const tuples = parseUpstoxCandles(res.data) ?? [];
    const raws = tuples.map(tupleToRaw).filter((x): x is NonNullable<typeof x> => x != null);
    const norm = normalizeCandles(raws, Number.isFinite(nowMs) ? nowMs : Date.now());
    const ageSec = ageSecFromIso(norm.candles[norm.candles.length - 1]?.time ?? null, nowMs);
    return {
      ok: true,
      data: {
        symbol,
        timeframe,
        candles: norm.candles,
        telemetry: providerTelemetry({
          ok: true, latencyMs: res.latencyMs, nowIso, ageSec,
          role: "PRIMARY", providerTime: norm.candles[norm.candles.length - 1]?.time ?? null,
          reason: null,
        }),
      },
      telemetry: providerTelemetry({
        ok: true, latencyMs: res.latencyMs, nowIso, ageSec,
        role: "PRIMARY", providerTime: norm.candles[norm.candles.length - 1]?.time ?? null,
        reason: null,
      }),
    };
  }
}

/** Build a ProviderAdapter-compatible view over the Upstox adapter. */
export function buildUpstoxProviderAdapter(opts: UpstoxAdapterOptions = {}): ProviderAdapter {
  const impl = new UpstoxHistoricalAdapter(opts);
  return {
    id: UPSTOX_ADAPTER_ID,
    label: "Upstox Historical V3",
    role: "PRIMARY",
    capability: {
      domain: "HISTORICAL",
      quotes: [...UPSTOX_SUPPORTED_SYMBOLS],
      historical: ["1m", "3m", "5m", "15m", "1h", "1d"],
      historicalSymbols: [
        "NIFTY50", "BANKNIFTY", "INDIA_VIX",
        "GOLD", "SILVER", "CRUDEOIL", "NATURAL_GAS", "USDINR",
      ],
    },
    freshness: DEFAULT_FRESHNESS.HISTORICAL,
    fetchQuote: (symbol, nowIso) => impl.fetchQuote(symbol, nowIso),
    fetchHistorical: (symbol, tf, limit, nowIso) => impl.fetchHistorical(symbol, tf, limit, nowIso),
  };
}

export { policyFor as upstoxPolicyFor, isoToday };