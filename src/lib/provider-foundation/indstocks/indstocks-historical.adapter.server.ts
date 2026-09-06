// Provider-foundation adapter for INDstocks historical + quote REST endpoints.
// Server-only. Token never logged or returned.

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
  INDSTOCKS_ADAPTER_ID,
  INDSTOCKS_ADAPTER_VERSION,
  INDSTOCKS_CACHE_NAMESPACE,
  TIMEFRAME_TO_INDSTOCKS,
  type IndstocksErrorCode,
  type IndstocksHistoricalResponse,
  type IndstocksQuoteResponse,
} from "./indstocks-types";
import {
  IndstocksHttpClient,
  type IndstocksHttpConfig,
  type IndstocksHttpResult,
} from "./indstocks-http.server";
import { resolveIndstocksInstrument, INDSTOCKS_SUPPORTED_SYMBOLS } from "./indstocks-instruments.server";
import { planIndstocksRange } from "./indstocks-range-policy";
import {
  computeIndstocksDataQuality,
  mergeIndstocksCandleChunks,
  normalizeIndstocksCandles,
  parseIndstocksCandles,
} from "./indstocks-normalizer";

export interface IndstocksAdapterOptions extends IndstocksHttpConfig {
  readonly httpClient?: IndstocksHttpClient;
}

function providerTelemetry(input: {
  ok: boolean;
  code?: IndstocksErrorCode;
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
    : input.code === "INDSTOCKS_RATE_LIMITED"
      ? "RATE_LIMITED"
      : input.code === "INDSTOCKS_AUTH_REQUIRED" || input.code === "INDSTOCKS_FORBIDDEN"
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
    providerId: INDSTOCKS_ADAPTER_ID,
    role: input.role,
  };
}

function errorToReason(code: IndstocksErrorCode): import("../types").ProviderFailure {
  switch (code) {
    case "INDSTOCKS_AUTH_REQUIRED":
      return "AUTH_REQUIRED";
    case "INDSTOCKS_FORBIDDEN":
      return "UNAVAILABLE";
    case "INDSTOCKS_RATE_LIMITED":
      return "RATE_LIMITED";
    case "INDSTOCKS_TIMEOUT":
      return "TIMEOUT";
    case "INDSTOCKS_SCHEMA_ERROR":
      return "SCHEMA_ERROR";
    case "INDSTOCKS_DATA_UNAVAILABLE":
      return "UNAVAILABLE";
    case "INDSTOCKS_UNSUPPORTED_RANGE":
      return "UNAVAILABLE";
    case "INDSTOCKS_UNSUPPORTED_TIMEFRAME":
      return "UNSUPPORTED_TIMEFRAME";
    case "INDSTOCKS_NETWORK":
      return "NETWORK";
    default:
      return "UNKNOWN";
  }
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

export class IndstocksAdapter {
  readonly id = INDSTOCKS_ADAPTER_ID;
  readonly version = INDSTOCKS_ADAPTER_VERSION;

  private readonly http: IndstocksHttpClient;

  constructor(opts: IndstocksAdapterOptions = {}) {
    this.http = opts.httpClient ?? new IndstocksHttpClient(opts);
  }

  async fetchQuote(symbol: QuoteSymbol, nowIso: string): Promise<ProviderResult<QuoteTick>> {
    const instr = resolveIndstocksInstrument(symbol);
    if (!instr) {
      return {
        ok: false,
        reason: "UNSUPPORTED_SYMBOL",
        detail: `${symbol} is not in the INDstocks instrument master`,
        telemetry: providerTelemetry({
          ok: false,
          code: "INDSTOCKS_DATA_UNAVAILABLE",
          latencyMs: 0,
          nowIso,
          ageSec: Infinity,
          role: "PRIMARY",
          providerTime: null,
          reason: "unsupported symbol",
        }),
      };
    }

    const res = await this.http.request<IndstocksQuoteResponse>({
      path: "/market/quotes/ltp",
      query: { "scrip-codes": instr.scripCode },
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: errorToReason(res.error.code),
        detail: res.error.message,
        telemetry: providerTelemetry({
          ok: false,
          code: res.error.code,
          latencyMs: res.latencyMs,
          nowIso,
          ageSec: Infinity,
          role: "PRIMARY",
          providerTime: null,
          reason: res.error.message,
          retryAfterMs: res.error.retryAfterMs,
        }),
      };
    }

    const data = res.data?.data;
    const entry = data ? Object.values(data)[0] : undefined;
    const last = entry?.last_price;
    if (typeof last !== "number" || !Number.isFinite(last)) {
      return {
        ok: false,
        reason: "SCHEMA_ERROR",
        detail: "missing quote last_price",
        telemetry: providerTelemetry({
          ok: false,
          code: "INDSTOCKS_SCHEMA_ERROR",
          latencyMs: res.latencyMs,
          nowIso,
          ageSec: Infinity,
          role: "PRIMARY",
          providerTime: null,
          reason: "missing quote last_price",
        }),
      };
    }

    const prevClose = entry?.prev_close ?? entry?.ohlc?.close ?? null;
    const telemetry = providerTelemetry({ ok: true, latencyMs: res.latencyMs, nowIso, ageSec: 0, role: "PRIMARY", providerTime: null, reason: null });
    const tick: QuoteTick = {
      symbol,
      last,
      open: entry?.ohlc?.open ?? null,
      high: entry?.ohlc?.high ?? null,
      low: entry?.ohlc?.low ?? null,
      prevClose,
      change: prevClose != null ? last - prevClose : null,
      changePct: prevClose != null && prevClose !== 0 ? ((last - prevClose) / prevClose) * 100 : null,
      volume: entry?.volume ?? null,
      currency: "INR",
      telemetry,
    };
    return { ok: true, data: tick, telemetry };
  }

  async fetchRange(input: {
    symbol: QuoteSymbol | string;
    timeframe: Timeframe;
    from: string;
    to: string;
    nowIso: string;
    nowMs: number;
  }): Promise<ProviderResult<HistoricalSeries>> {
    const instr = resolveIndstocksInstrument(input.symbol);
    if (!instr) {
      return {
        ok: false,
        reason: "UNSUPPORTED_SYMBOL",
        detail: `${input.symbol} is not in the INDstocks instrument master`,
        telemetry: providerTelemetry({
          ok: false,
          code: "INDSTOCKS_DATA_UNAVAILABLE",
          latencyMs: 0,
          nowIso: input.nowIso,
          ageSec: Infinity,
          role: "PRIMARY",
          providerTime: null,
          reason: "unsupported symbol",
        }),
      };
    }
    if (!(input.timeframe in TIMEFRAME_TO_INDSTOCKS)) {
      return {
        ok: false,
        reason: "UNSUPPORTED_TIMEFRAME",
        telemetry: providerTelemetry({
          ok: false,
          code: "INDSTOCKS_UNSUPPORTED_TIMEFRAME",
          latencyMs: 0,
          nowIso: input.nowIso,
          ageSec: Infinity,
          role: "PRIMARY",
          providerTime: null,
          reason: "unsupported timeframe",
        }),
      };
    }

    const plan = planIndstocksRange(input.timeframe, input.from, input.to);
    if (!plan.ok) {
      return {
        ok: false,
        reason: "UNAVAILABLE",
        detail: plan.reason,
        telemetry: providerTelemetry({
          ok: false,
          code: "INDSTOCKS_UNSUPPORTED_RANGE",
          latencyMs: 0,
          nowIso: input.nowIso,
          ageSec: Infinity,
          role: "PRIMARY",
          providerTime: null,
          reason: plan.reason,
        }),
      };
    }

    const interval = TIMEFRAME_TO_INDSTOCKS[input.timeframe];
    const chunkResults: (readonly import("../types").HistoricalCandle[])[] = [];
    let totalLatency = 0;
    let lastErr: IndstocksError | null = null;
    let totalRejected = 0;

    for (const chunk of plan.chunks) {
      const startMs = new Date(chunk.from + "T00:00:00Z").getTime();
      const endMs = new Date(chunk.to + "T23:59:59Z").getTime();

      const res: IndstocksHttpResult<IndstocksHistoricalResponse> = await this.http.request<IndstocksHistoricalResponse>({
        path: `/market/historical/${interval.label}`,
        query: {
          "scrip-codes": instr.scripCode,
          start_time: startMs,
          end_time: endMs,
        },
      });

      totalLatency += res.latencyMs;
      if (!res.ok) {
        lastErr = res.error;
        break;
      }

      const tuples = parseIndstocksCandles(res.data);
      if (!tuples) {
        lastErr = { code: "INDSTOCKS_SCHEMA_ERROR", message: "missing data.candles[]" };
        break;
      }

      const norm = normalizeIndstocksCandles(tuples, input.nowMs);
      totalRejected += norm.rejected.length;
      chunkResults.push(norm.candles);
    }

    if (lastErr) {
      return {
        ok: false,
        reason: errorToReason(lastErr.code),
        detail: lastErr.message,
        telemetry: providerTelemetry({
          ok: false,
          code: lastErr.code,
          latencyMs: totalLatency,
          nowIso: input.nowIso,
          ageSec: Infinity,
          role: "PRIMARY",
          providerTime: null,
          reason: lastErr.message,
          retryAfterMs: lastErr.retryAfterMs,
        }),
      };
    }

    const merged = mergeIndstocksCandleChunks(chunkResults);
    const dq = computeIndstocksDataQuality(input.from, input.to, merged, []);
    const ageSec = ageSecFromIso(dq.actualTo, input.nowMs);
    const series: HistoricalSeries = {
      symbol: input.symbol,
      timeframe: input.timeframe,
      candles: merged,
      telemetry: providerTelemetry({
        ok: true,
        latencyMs: totalLatency,
        nowIso: input.nowIso,
        ageSec,
        role: "PRIMARY",
        providerTime: dq.actualTo,
        reason: totalRejected > 0 ? `rejected ${totalRejected} rows` : null,
      }),
    };
    return { ok: true, data: series, telemetry: series.telemetry };
  }

  async fetchHistorical(
    symbol: QuoteSymbol | string,
    timeframe: Timeframe,
    limit: number,
    nowIso: string,
  ): Promise<ProviderResult<HistoricalSeries>> {
    const nowMs = Date.parse(nowIso);
    if (!Number.isFinite(nowMs)) {
      return {
        ok: false,
        reason: "UNKNOWN",
        telemetry: providerTelemetry({
          ok: false,
          code: "INDSTOCKS_UNKNOWN",
          latencyMs: 0,
          nowIso,
          ageSec: Infinity,
          role: "PRIMARY",
          providerTime: null,
          reason: "invalid nowIso",
        }),
      };
    }
    const perDay: Record<Timeframe, number> = {
      "1m": 375,
      "3m": 125,
      "5m": 75,
      "15m": 25,
      "1h": 6,
      "1d": 1,
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
}

/** Build a ProviderAdapter-compatible view over the INDstocks adapter. */
export function buildIndstocksProviderAdapter(opts: IndstocksAdapterOptions = {}): ProviderAdapter {
  const impl = new IndstocksAdapter(opts);
  return {
    id: INDSTOCKS_ADAPTER_ID,
    label: "INDstocks REST V1",
    role: "SECONDARY",
    capability: {
      domain: "HISTORICAL",
      quotes: [...INDSTOCKS_SUPPORTED_SYMBOLS],
      historical: ["1m", "3m", "5m", "15m", "1h", "1d"],
      historicalSymbols: [...INDSTOCKS_SUPPORTED_SYMBOLS],
    },
    freshness: DEFAULT_FRESHNESS.HISTORICAL,
    fetchQuote: (symbol, nowIso) => impl.fetchQuote(symbol, nowIso),
    fetchHistorical: (symbol, tf, limit, nowIso) => impl.fetchHistorical(symbol, tf, limit, nowIso),
  };
}

export { isoToday };
