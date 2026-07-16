// Server-only smoke-test harness for the Upstox live provider.
// Read-only. Never returns tokens, API keys, secrets, or Authorization
// headers — every returned message passes through `redactUpstoxMessage`.

import { UpstoxHistoricalAdapter } from "./upstox-historical.adapter.server";
import { UpstoxIntradayAdapter } from "./upstox-intraday.adapter.server";
import { UpstoxHttpClient, redactUpstoxMessage } from "./upstox-http.server";
import {
  evaluateUpstoxTokenPolicy,
  type TokenPolicyEnv,
  type UpstoxTokenStatus,
} from "./upstox-token-policy.server";
import { resolveInstrument, UPSTOX_SUPPORTED_SYMBOLS, type UpstoxSupportedSymbol } from "./upstox-instruments.server";
import type { QuoteSymbol, Timeframe } from "../types";
import type { UpstoxErrorCode } from "./upstox-types";

export type SmokeErrorSource =
  | "APPLICATION_AUTH"
  | "SERVER_FUNCTION"
  | "SERIALIZATION"
  | "UPSTOX_AUTH"
  | "UPSTOX_API"
  | "PROVIDER_CONFIG"
  | "NETWORK"
  | "SCHEMA";

export const UPSTOX_FORBIDDEN_SAFE_MESSAGE = "Upstox denied this request";

/** Strict JSON-serializable checklist surfaced at the top of the report. */
export interface SmokeChecklist {
  readonly authentication: "PASS" | "FAIL" | "NOT_CONFIGURED";
  readonly instrumentMaster: "PASS" | "PARTIAL" | "FAIL" | "NOT_CONFIGURED";
  readonly quoteApi: "PASS" | "PARTIAL" | "FAIL" | "NOT_CONFIGURED";
  readonly historicalApi: "PASS" | "PARTIAL" | "FAIL" | "NOT_CONFIGURED";
  readonly intradayApi: "PASS" | "PARTIAL" | "FAIL" | "NOT_CONFIGURED";
  readonly cache: "PASS" | "NOT_CONFIGURED";
  readonly health: "PASS" | "PARTIAL" | "FAIL" | "NOT_CONFIGURED";
}

export interface SmokeSymbolResult {
  readonly symbol: string;
  readonly resolved: boolean;
  readonly quoteOk: boolean;
  readonly historicalOk: boolean;
  readonly intradayOk: boolean;
  readonly errorSource: SmokeErrorSource | null;
  readonly safeError: string | null;
}

// Sensitive substrings that must never appear in a serialized report.
const SECRET_KEY_NAMES = new Set([
  "authorization",
  "access_token",
  "accesstoken",
  "api_key",
  "apikey",
  "api_secret",
  "apisecret",
  "token",
  "secret",
  "cookie",
  "set-cookie",
  "bearer",
]);

/**
 * Convert any input to a JSON-only value:
 *  - Error → { message } (redacted)
 *  - Date → ISO string
 *  - Map/Set → array/object of values
 *  - Headers/Response/Request/AbortSignal/function → dropped ("[unserializable]")
 *  - BigInt → string
 *  - NaN/Infinity → null
 *  - circular references → "[circular]"
 *  - keys matching secret names → removed
 */
export function sanitizeForJson(input: unknown): unknown {
  const seen = new WeakSet<object>();
  const walk = (value: unknown): unknown => {
    if (value == null) return value ?? null;
    const t = typeof value;
    if (t === "string") {
      return redactUpstoxMessage(value as string);
    }
    if (t === "number") {
      return Number.isFinite(value as number) ? value : null;
    }
    if (t === "boolean") return value;
    if (t === "bigint") return String(value);
    if (t === "function") return "[unserializable:function]";
    if (t === "symbol") return "[unserializable:symbol]";
    if (t !== "object") return null;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
      return { message: redactUpstoxMessage(value.message ?? "error").slice(0, 240) };
    }
    // Runtime objects we must never leak.
    if (
      typeof Response !== "undefined" && value instanceof Response
    ) return "[unserializable:Response]";
    if (
      typeof Request !== "undefined" && value instanceof Request
    ) return "[unserializable:Request]";
    if (
      typeof Headers !== "undefined" && value instanceof Headers
    ) return "[unserializable:Headers]";
    if (
      typeof AbortSignal !== "undefined" && value instanceof AbortSignal
    ) return "[unserializable:AbortSignal]";
    if (value instanceof ArrayBuffer) return "[unserializable:ArrayBuffer]";
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);
    if (value instanceof Map) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of value.entries()) {
        const key = typeof k === "string" ? k : String(k);
        if (SECRET_KEY_NAMES.has(key.toLowerCase())) continue;
        out[key] = walk(v);
      }
      return out;
    }
    if (value instanceof Set) return Array.from(value.values()).map(walk);
    if (Array.isArray(value)) return value.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_NAMES.has(k.toLowerCase())) continue;
      if (typeof v === "undefined") continue;
      out[k] = walk(v);
    }
    return out;
  };
  try {
    const sanitized = walk(input);
    // Final defensive round-trip guarantees JSON-only output.
    return JSON.parse(JSON.stringify(sanitized ?? null));
  } catch {
    return null;
  }
}

/** Map an Upstox HTTP-error code to a SmokeErrorSource. Never leaks bodies. */
export function errorSourceFromUpstoxCode(code: UpstoxErrorCode): SmokeErrorSource {
  switch (code) {
    case "UPSTOX_AUTH_REQUIRED":
      return "UPSTOX_AUTH";
    case "UPSTOX_FORBIDDEN":
      return "UPSTOX_API";
    case "UPSTOX_TIMEOUT":
    case "UPSTOX_NETWORK":
      return "NETWORK";
    case "UPSTOX_SCHEMA_ERROR":
      return "SCHEMA";
    case "UPSTOX_UNSUPPORTED_RANGE":
    case "UPSTOX_UNSUPPORTED_TIMEFRAME":
      return "PROVIDER_CONFIG";
    case "UPSTOX_RATE_LIMITED":
    case "UPSTOX_DATA_UNAVAILABLE":
    case "UPSTOX_UNKNOWN":
    default:
      return "UPSTOX_API";
  }
}

/** Map an adapter's ProviderResult failure reason to a SmokeErrorSource. */
export function errorSourceFromAdapterReason(reason: string): SmokeErrorSource {
  switch (reason) {
    case "AUTH_REQUIRED":
      return "UPSTOX_AUTH";
    case "TIMEOUT":
    case "NETWORK":
      return "NETWORK";
    case "SCHEMA_ERROR":
      return "SCHEMA";
    case "UNSUPPORTED_SYMBOL":
    case "UNSUPPORTED_TIMEFRAME":
      return "PROVIDER_CONFIG";
    default:
      return "UPSTOX_API";
  }
}

export interface EndpointResult {
  readonly endpoint: "quote" | "historical" | "intraday";
  readonly symbol: string;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly requestId: string | null;
  readonly candleCount?: number;
  readonly firstCandleTime?: string | null;
  readonly lastCandleTime?: string | null;
  readonly providerStatus: string;
  readonly marketSession: string;
  readonly cacheHit: boolean;
  readonly safeError: string | null;
  readonly errorSource: SmokeErrorSource | null;
  readonly dataQuality: {
    readonly coveragePct: number | null;
    readonly insufficient: boolean;
  } | null;
}

export interface UpstoxSmokeReport {
  readonly at: string;
  readonly generatedAt: string;
  readonly requestStartedAt: string;
  readonly requestCompletedAt: string;
  readonly durationMs: number;
  readonly status: "PASS" | "PARTIAL" | "FAIL" | "NOT_CONFIGURED";
  readonly errorSource: SmokeErrorSource | null;
  readonly safeError: string | null;
  readonly httpStatus: number | null;
  readonly endpointFailed: string | null;
  readonly serializationStatus: "OK" | "PARTIAL" | "FAIL";
  readonly checklist: SmokeChecklist;
  readonly symbolResults: readonly SmokeSymbolResult[];
  readonly configured: boolean;
  readonly authenticated: boolean;
  readonly tokenStatus: UpstoxTokenStatus;
  readonly instrumentResolved: readonly {
    readonly symbol: string;
    readonly resolved: boolean;
    readonly instrumentKey?: string;
    readonly exchange?: string;
    readonly instrumentType?: string;
  }[];
  readonly quoteResults: readonly EndpointResult[];
  readonly historicalResults: readonly EndpointResult[];
  readonly intradayResults: readonly EndpointResult[];
  readonly summary: {
    readonly quoteSuccess: boolean;
    readonly historicalSuccess: boolean;
    readonly intradaySuccess: boolean;
    readonly overall: "PASS" | "PARTIAL" | "FAIL" | "NOT_CONFIGURED";
    readonly errorSource?: SmokeErrorSource | null;
    readonly safeError?: string | null;
  };
  readonly cache: { hits: number; misses: number; writes: number };
  readonly health: {
    readonly totalCalls: number;
    readonly errors: number;
    readonly avgLatencyMs: number;
  };
}

const REQUIRED_SYMBOLS: readonly UpstoxSupportedSymbol[] = ["NIFTY50", "BANKNIFTY", "INDIA_VIX"];
const OPTIONAL_SYMBOLS: readonly UpstoxSupportedSymbol[] = ["GOLD", "SILVER", "CRUDEOIL", "NATURAL_GAS"];

interface QuoteApiResult {
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly requestId: string | null;
  readonly safeError: string | null;
  readonly errorSource: SmokeErrorSource | null;
  readonly providerStatus: string;
  readonly last?: number;
}

async function fetchQuote(
  http: UpstoxHttpClient,
  instrumentKey: string,
): Promise<QuoteApiResult> {
  const res = await http.request<{ status: string; data: Record<string, { last_price?: number }> }>({
    path: "v2/market-quote/quotes",
    query: { instrument_key: instrumentKey },
  });
  if (!res.ok) {
    const source = errorSourceFromUpstoxCode(res.error.code);
    const safeError =
      res.error.code === "UPSTOX_FORBIDDEN"
        ? UPSTOX_FORBIDDEN_SAFE_MESSAGE
        : redactUpstoxMessage(`${res.error.code}: ${res.error.message}`);
    return {
      ok: false,
      latencyMs: res.latencyMs,
      requestId: res.error.requestId ?? null,
      safeError,
      errorSource: source,
      providerStatus: res.error.code === "UPSTOX_RATE_LIMITED" ? "RATE_LIMITED" : res.error.code === "UPSTOX_AUTH_REQUIRED" ? "OFFLINE" : "FAILED",
    };
  }
  const entries = res.data?.data ? Object.values(res.data.data) : [];
  const last = entries[0]?.last_price;
  return {
    ok: true,
    latencyMs: res.latencyMs,
    requestId: res.requestId,
    safeError: null,
    errorSource: null,
    providerStatus: "LIVE",
    last: typeof last === "number" ? last : undefined,
  };
}

function toEndpointResult(
  endpoint: EndpointResult["endpoint"],
  symbol: string,
  q: QuoteApiResult,
): EndpointResult {
  return {
    endpoint,
    symbol,
    ok: q.ok,
    latencyMs: q.latencyMs,
    requestId: q.requestId,
    providerStatus: q.providerStatus,
    marketSession: "UNKNOWN",
    cacheHit: false,
    safeError: q.safeError,
    errorSource: q.errorSource,
    dataQuality: null,
  };
}

export interface UpstoxSmokeOptions {
  readonly env?: TokenPolicyEnv;
  readonly fetchImpl?: typeof fetch;
  readonly nowIso?: string;
  readonly historicalTimeframe?: Timeframe;
  readonly historicalFromIso?: string;
  readonly historicalToIso?: string;
  readonly intradayTimeframe?: Timeframe;
}

function envFromProcess(): TokenPolicyEnv {
  const p = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return {
    UPSTOX_MARKET_DATA_MODE: p.UPSTOX_MARKET_DATA_MODE ?? "live",
    UPSTOX_API_KEY: p.UPSTOX_API_KEY,
    UPSTOX_API_SECRET: p.UPSTOX_API_SECRET,
    UPSTOX_ACCESS_TOKEN: p.UPSTOX_ACCESS_TOKEN,
  };
}

function emptyChecklist(status: SmokeChecklist["authentication"] = "NOT_CONFIGURED"): SmokeChecklist {
  return {
    authentication: status,
    instrumentMaster: status === "FAIL" ? "FAIL" : "NOT_CONFIGURED",
    quoteApi: status === "FAIL" ? "FAIL" : "NOT_CONFIGURED",
    historicalApi: status === "FAIL" ? "FAIL" : "NOT_CONFIGURED",
    intradayApi: status === "FAIL" ? "FAIL" : "NOT_CONFIGURED",
    cache: "NOT_CONFIGURED",
    health: status === "FAIL" ? "FAIL" : "NOT_CONFIGURED",
  };
}

function endpointChecklistStatus(rs: readonly EndpointResult[]): SmokeChecklist["quoteApi"] {
  const required = rs.filter((r) => REQUIRED_SYMBOLS.includes(r.symbol as UpstoxSupportedSymbol));
  if (required.length === 0) return rs.length === 0 ? "NOT_CONFIGURED" : "FAIL";
  const okCount = required.filter((r) => r.ok).length;
  if (okCount === required.length) return "PASS";
  if (okCount === 0) return "FAIL";
  return "PARTIAL";
}

/** Build a SERVER_FUNCTION-source failure report for outer-boundary throws. */
export function buildServerFunctionFailureReport(
  error: unknown,
  opts: Pick<UpstoxSmokeOptions, "nowIso"> = {},
): UpstoxSmokeReport {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const raw = error instanceof Error ? (error.message ?? "server function failed") : String(error ?? "server function failed");
  const safeError = redactUpstoxMessage(raw).slice(0, 240);
  const base = buildApplicationAuthFailureReport(safeError, { nowIso });
  return sanitizeForJson({
    ...base,
    status: "FAIL",
    errorSource: "SERVER_FUNCTION",
    safeError,
    endpointFailed: null,
    httpStatus: null,
    serializationStatus: "OK",
    checklist: { ...emptyChecklist("FAIL") },
    symbolResults: [],
    summary: { ...base.summary, errorSource: "SERVER_FUNCTION", safeError },
    quoteResults: [
      {
        endpoint: "quote",
        symbol: "SYSTEM",
        ok: false,
        latencyMs: 0,
        requestId: null,
        providerStatus: "FAILED",
        marketSession: "UNKNOWN",
        cacheHit: false,
        safeError,
        errorSource: "SERVER_FUNCTION",
        dataQuality: null,
      },
    ],
  }) as UpstoxSmokeReport;
}

export function buildUpstoxSmokeFailureReport(
  error: unknown,
  opts: Pick<UpstoxSmokeOptions, "env" | "nowIso"> = {},
): UpstoxSmokeReport {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const envSource = opts.env ?? envFromProcess();
  const tokenStatus = evaluateUpstoxTokenPolicy(envSource);
  const configured = tokenStatus.tokenPresent && envSource.UPSTOX_API_KEY != null && envSource.UPSTOX_API_SECRET != null;
  const safeError = redactUpstoxMessage(error instanceof Error ? error.message : String(error ?? "smoke test failed"));
  const errorSource: SmokeErrorSource = tokenStatus.tokenUsable ? "UPSTOX_API" : "PROVIDER_CONFIG";
  const instrumentResolved = REQUIRED_SYMBOLS.map((sym) => {
    const inst = resolveInstrument(sym as QuoteSymbol);
    return inst
      ? { symbol: sym, resolved: true, instrumentKey: inst.instrumentKey, exchange: inst.exchange, instrumentType: inst.instrumentType }
      : { symbol: sym, resolved: false };
  });
  return {
    at: nowIso,
    generatedAt: nowIso,
    requestStartedAt: nowIso,
    requestCompletedAt: nowIso,
    durationMs: 0,
    status: tokenStatus.tokenUsable ? "FAIL" : "NOT_CONFIGURED",
    errorSource,
    safeError,
    httpStatus: null,
    endpointFailed: null,
    serializationStatus: "OK",
    checklist: emptyChecklist(tokenStatus.tokenUsable ? "FAIL" : "NOT_CONFIGURED"),
    symbolResults: [],
    configured,
    authenticated: tokenStatus.tokenUsable,
    tokenStatus,
    instrumentResolved,
    quoteResults: [
      {
        endpoint: "quote",
        symbol: "SYSTEM",
        ok: false,
        latencyMs: 0,
        requestId: null,
        providerStatus: "FAILED",
        marketSession: "UNKNOWN",
        cacheHit: false,
        safeError,
        errorSource,
        dataQuality: null,
      },
    ],
    historicalResults: [],
    intradayResults: [],
    summary: {
      quoteSuccess: false,
      historicalSuccess: false,
      intradaySuccess: false,
      overall: tokenStatus.tokenUsable ? "FAIL" : "NOT_CONFIGURED",
      errorSource,
      safeError,
    },
    cache: { hits: 0, misses: 0, writes: 0 },
    health: { totalCalls: 0, errors: 1, avgLatencyMs: 0 },
  };
}

/** Read-only Upstox smoke test. Never touches order/broker paths. */
export async function runUpstoxSmokeTest(opts: UpstoxSmokeOptions = {}): Promise<UpstoxSmokeReport> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);

  const envSource: TokenPolicyEnv =
    opts.env ?? envFromProcess();

  const tokenStatus = evaluateUpstoxTokenPolicy(envSource);
  const configured = tokenStatus.tokenPresent && envSource.UPSTOX_API_KEY != null && envSource.UPSTOX_API_SECRET != null;

  const targetSymbols = [...REQUIRED_SYMBOLS, ...OPTIONAL_SYMBOLS];
  const instrumentResolved = targetSymbols.map((sym) => {
    const inst = resolveInstrument(sym as QuoteSymbol);
    return inst
      ? { symbol: sym, resolved: true, instrumentKey: inst.instrumentKey, exchange: inst.exchange, instrumentType: inst.instrumentType }
      : { symbol: sym, resolved: false };
  });

  if (!tokenStatus.tokenUsable) {
    return {
      at: nowIso,
      generatedAt: nowIso,
      requestStartedAt: nowIso,
      requestCompletedAt: nowIso,
      durationMs: 0,
      status: "NOT_CONFIGURED",
      errorSource: "PROVIDER_CONFIG",
      safeError: redactUpstoxMessage(tokenStatus.reason).slice(0, 240),
      httpStatus: null,
      endpointFailed: null,
      serializationStatus: "OK",
      checklist: emptyChecklist("NOT_CONFIGURED"),
      symbolResults: [],
      configured,
      authenticated: false,
      tokenStatus,
      instrumentResolved,
      quoteResults: [],
      historicalResults: [],
      intradayResults: [],
      summary: {
        quoteSuccess: false,
        historicalSuccess: false,
        intradaySuccess: false,
        overall: "NOT_CONFIGURED",
      },
      cache: { hits: 0, misses: 0, writes: 0 },
      health: { totalCalls: 0, errors: 0, avgLatencyMs: 0 },
    };
  }

  const http = new UpstoxHttpClient({ env: envSource, fetchImpl: opts.fetchImpl, maxRetries: 1, backoffBaseMs: 100 });
  const histAdapter = new UpstoxHistoricalAdapter({ env: envSource, fetchImpl: opts.fetchImpl, maxRetries: 1, backoffBaseMs: 100 });
  const intraAdapter = new UpstoxIntradayAdapter({ env: envSource, fetchImpl: opts.fetchImpl, maxRetries: 1, backoffBaseMs: 100 });

  const histTf = opts.historicalTimeframe ?? "1d";
  const toIso = opts.historicalToIso ?? nowIso.slice(0, 10);
  const fromIso = opts.historicalFromIso ?? (() => {
    const d = new Date(nowMs);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const intraTf = opts.intradayTimeframe ?? "5m";

  const quoteResults: EndpointResult[] = [];
  const historicalResults: EndpointResult[] = [];
  const intradayResults: EndpointResult[] = [];

  let totalCalls = 0;
  let errors = 0;
  let totalLatency = 0;

  for (const entry of instrumentResolved) {
    if (!entry.resolved || !entry.instrumentKey) continue;

    // Quote
    const q = await fetchQuote(http, entry.instrumentKey);
    quoteResults.push(toEndpointResult("quote", entry.symbol, q));
    totalCalls++;
    totalLatency += q.latencyMs;
    if (!q.ok) errors++;

    // Historical
    const hist = await histAdapter.fetchRange({
      symbol: entry.symbol,
      timeframe: histTf,
      from: fromIso,
      to: toIso,
      nowIso,
      nowMs,
    });
    totalCalls++;
    totalLatency += hist.telemetry.latencyMs;
    if (!hist.ok) errors++;
    historicalResults.push({
      endpoint: "historical",
      symbol: entry.symbol,
      ok: hist.ok,
      latencyMs: hist.telemetry.latencyMs,
      requestId: null,
      candleCount: hist.ok ? hist.data.candles.length : 0,
      firstCandleTime: hist.ok ? (hist.data.candles[0]?.time ?? null) : null,
      lastCandleTime: hist.ok ? (hist.data.candles[hist.data.candles.length - 1]?.time ?? null) : null,
      providerStatus: hist.telemetry.status,
      marketSession: hist.telemetry.marketSession,
      cacheHit: false,
      safeError: hist.ok ? null : redactUpstoxMessage(`${hist.reason}${"detail" in hist && hist.detail ? ": " + hist.detail : ""}`),
      errorSource: hist.ok ? null : errorSourceFromAdapterReason(hist.reason),
      dataQuality: hist.ok ? { coveragePct: 100, insufficient: hist.data.candles.length === 0 } : null,
    });

    // Intraday
    const intra = await intraAdapter.fetch(entry.symbol, intraTf, nowIso);
    totalCalls++;
    totalLatency += intra.telemetry.latencyMs;
    if (!intra.ok) errors++;
    intradayResults.push({
      endpoint: "intraday",
      symbol: entry.symbol,
      ok: intra.ok,
      latencyMs: intra.telemetry.latencyMs,
      requestId: null,
      candleCount: intra.ok ? intra.data.candles.length : 0,
      firstCandleTime: intra.ok ? (intra.data.candles[0]?.time ?? null) : null,
      lastCandleTime: intra.ok ? (intra.data.candles[intra.data.candles.length - 1]?.time ?? null) : null,
      providerStatus: intra.telemetry.status,
      marketSession: intra.telemetry.marketSession,
      cacheHit: false,
      safeError: intra.ok ? null : redactUpstoxMessage(`${intra.reason}${"detail" in intra && intra.detail ? ": " + intra.detail : ""}`),
      errorSource: intra.ok ? null : errorSourceFromAdapterReason(intra.reason),
      dataQuality: intra.ok ? { coveragePct: 100, insufficient: intra.data.candles.length === 0 } : null,
    });
  }

  const requiredKeys = new Set<string>(REQUIRED_SYMBOLS);
  const requiredOk = (rs: EndpointResult[]) =>
    REQUIRED_SYMBOLS.every((s) => rs.find((r) => r.symbol === s)?.ok === true);

  const quoteSuccess = requiredOk(quoteResults);
  const historicalSuccess = requiredOk(historicalResults);
  const intradaySuccess = requiredOk(intradayResults);

  const anyOk = quoteResults.some((r) => r.ok) || historicalResults.some((r) => r.ok) || intradayResults.some((r) => r.ok);
  const allRequiredOk = quoteSuccess && historicalSuccess && intradaySuccess;
  const overall: UpstoxSmokeReport["summary"]["overall"] =
    allRequiredOk ? "PASS" : anyOk ? "PARTIAL" : "FAIL";

  // Silence unused-variable lint on the required-set marker.
  void requiredKeys;

  const firstError =
    quoteResults.find((r) => !r.ok && r.errorSource)?.errorSource ??
    historicalResults.find((r) => !r.ok && r.errorSource)?.errorSource ??
    intradayResults.find((r) => !r.ok && r.errorSource)?.errorSource ??
    null;
  const firstErrorMessage =
    quoteResults.find((r) => !r.ok && r.safeError)?.safeError ??
    historicalResults.find((r) => !r.ok && r.safeError)?.safeError ??
    intradayResults.find((r) => !r.ok && r.safeError)?.safeError ??
    null;

  return {
    at: nowIso,
    configured,
    authenticated: true,
    tokenStatus,
    instrumentResolved,
    quoteResults,
    historicalResults,
    intradayResults,
    summary: {
      quoteSuccess,
      historicalSuccess,
      intradaySuccess,
      overall,
      errorSource: firstError,
      safeError: firstErrorMessage,
    },
    cache: { hits: 0, misses: totalCalls, writes: 0 },
    health: {
      totalCalls,
      errors,
      avgLatencyMs: totalCalls === 0 ? 0 : totalLatency / totalCalls,
    },
  };
}

export { REQUIRED_SYMBOLS, OPTIONAL_SYMBOLS };
export { UPSTOX_SUPPORTED_SYMBOLS };

/**
 * Build a report indicating the caller failed the application-side
 * authorization check (Supabase auth or admin `has_role`). Never contains
 * tokens or Upstox response bodies.
 */
export function buildApplicationAuthFailureReport(
  reason: string,
  opts: Pick<UpstoxSmokeOptions, "nowIso"> = {},
): UpstoxSmokeReport {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const safeReason = redactUpstoxMessage(reason).slice(0, 200);
  return {
    at: nowIso,
    configured: false,
    authenticated: false,
    tokenStatus: {
      tokenPresent: false,
      tokenSource: "NONE",
      tokenExpiryStatus: "UNKNOWN",
      tokenUsable: false,
      reason: safeReason,
      mode: "disabled",
      apiKeyConfigured: false,
      apiSecretConfigured: false,
    },
    instrumentResolved: [],
    quoteResults: [
      {
        endpoint: "quote",
        symbol: "SYSTEM",
        ok: false,
        latencyMs: 0,
        requestId: null,
        providerStatus: "FAILED",
        marketSession: "UNKNOWN",
        cacheHit: false,
        safeError: safeReason,
        errorSource: "APPLICATION_AUTH",
        dataQuality: null,
      },
    ],
    historicalResults: [],
    intradayResults: [],
    summary: {
      quoteSuccess: false,
      historicalSuccess: false,
      intradaySuccess: false,
      overall: "FAIL",
      errorSource: "APPLICATION_AUTH",
      safeError: safeReason,
    },
    cache: { hits: 0, misses: 0, writes: 0 },
    health: { totalCalls: 0, errors: 1, avgLatencyMs: 0 },
  };
}