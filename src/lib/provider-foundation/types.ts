// Phase 26 · Stage 1 — Live Market Data Provider Foundation types.
// Additive-only. Consumer engines and dashboards are NOT wired to this
// module in Stage 1 — it becomes production-ready ahead of Stage 2
// (Historical API), Stage 3 (Breadth + Options), Stage 4 (WebSocket).
//
// No broker paths, no formula changes, no cache-namespace collisions.

export const PROVIDER_FOUNDATION_VERSION = "PROVIDER_FOUNDATION_V1";
export const PROVIDER_SESSION_PREFIX = "PROVIDER_SESSION_V1";

export type ProviderStatus =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "FAILED"
  | "RATE_LIMITED"
  | "OFFLINE";

export type ProviderRole = "PRIMARY" | "SECONDARY" | "OFFLINE";

export type ProviderDomain =
  | "QUOTES"
  | "HISTORICAL"
  | "OPTIONS"
  | "BREADTH";

export type QuoteSymbol =
  | "NIFTY50"
  | "BANKNIFTY"
  | "INDIA_VIX"
  | "GOLD"
  | "SILVER"
  | "XAUUSD"
  | "BTC"
  | "CRUDEOIL"
  | "NATURAL_GAS"
  | "USDINR";

export const ALL_QUOTE_SYMBOLS: readonly QuoteSymbol[] = [
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
] as const;

export type Timeframe = "1m" | "3m" | "5m" | "15m" | "1h" | "1d";

export const ALL_TIMEFRAMES: readonly Timeframe[] = [
  "1m",
  "3m",
  "5m",
  "15m",
  "1h",
  "1d",
] as const;

export type MarketSession =
  | "PRE_OPEN"
  | "REGULAR"
  | "POST_CLOSE"
  | "CLOSED"
  | "TWENTY_FOUR_SEVEN"
  | "UNKNOWN";

export interface ProviderTelemetry {
  readonly status: ProviderStatus;
  readonly latencyMs: number;
  readonly receivedAt: string; // ISO
  readonly providerTime: string | null; // ISO or null when provider omits
  readonly marketSession: MarketSession;
  readonly rateLimit: RateLimitState | null;
  readonly retryAfterMs: number | null;
  readonly staleReason: string | null;
  readonly providerId: string;
  readonly role: ProviderRole;
}

export interface RateLimitState {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string; // ISO
}

export interface QuoteTick {
  readonly symbol: QuoteSymbol;
  readonly last: number;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly prevClose: number | null;
  readonly change: number | null;
  readonly changePct: number | null;
  readonly volume: number | null;
  readonly currency: string;
  readonly telemetry: ProviderTelemetry;
}

export interface HistoricalCandle {
  readonly time: string; // ISO close time
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null;
  readonly closed: true;
}

export interface HistoricalSeries {
  readonly symbol: QuoteSymbol | string;
  readonly timeframe: Timeframe;
  readonly candles: readonly HistoricalCandle[];
  readonly telemetry: ProviderTelemetry;
}

export interface OptionsChainRow {
  readonly strike: number;
  readonly ceOi: number;
  readonly peOi: number;
  readonly ceOiChange: number;
  readonly peOiChange: number;
  readonly ceIv: number | null;
  readonly peIv: number | null;
}

export interface OptionsChainSnapshot {
  readonly underlying: string;
  readonly expiry: string;
  readonly rows: readonly OptionsChainRow[];
  readonly pcr: number;
  readonly maxPain: number | null;
  readonly telemetry: ProviderTelemetry;
}

export interface BreadthSnapshot {
  readonly universe: "NIFTY50" | "NIFTY500" | "SECTOR";
  readonly advances: number;
  readonly declines: number;
  readonly unchanged: number;
  readonly sectors?: Readonly<Record<string, { adv: number; dec: number }>>;
  readonly telemetry: ProviderTelemetry;
}

// ---- Fetch result envelope ------------------------------------------

export type ProviderFailure =
  | "UNAVAILABLE"
  | "RATE_LIMITED"
  | "AUTH_REQUIRED"
  | "UNSUPPORTED_SYMBOL"
  | "UNSUPPORTED_TIMEFRAME"
  | "SCHEMA_ERROR"
  | "TIMEOUT"
  | "NETWORK"
  | "UNKNOWN";

export type ProviderResult<T> =
  | { readonly ok: true; readonly data: T; readonly telemetry: ProviderTelemetry }
  | {
      readonly ok: false;
      readonly reason: ProviderFailure;
      readonly detail?: string;
      readonly telemetry: ProviderTelemetry;
      /**
       * Provider-specific diagnostic metadata for admin surfaces. Never
       * contains tokens, API keys, secrets, or raw response bodies.
       */
      readonly providerDiagnostics?: {
        readonly httpStatus?: number;
        readonly upstoxErrorCode?: string;
        readonly endpointPath?: string;
        readonly requestId?: string;
        readonly requestTimestamp?: string;
        readonly instrumentKey?: string;
      };
    };

// ---- Adapter capability ---------------------------------------------

export interface ProviderCapability {
  readonly domain: ProviderDomain;
  readonly quotes?: readonly QuoteSymbol[];
  readonly historical?: readonly Timeframe[];
  readonly historicalSymbols?: readonly (QuoteSymbol | string)[];
  readonly options?: readonly string[]; // underlyings
  readonly breadth?: readonly BreadthSnapshot["universe"][];
}

// ---- Freshness policy -----------------------------------------------

export interface FreshnessPolicy {
  readonly liveMaxSec: number;
  readonly delayedMaxSec: number;
}

export const DEFAULT_FRESHNESS: Readonly<Record<ProviderDomain, FreshnessPolicy>> = {
  QUOTES: { liveMaxSec: 30, delayedMaxSec: 900 },
  HISTORICAL: { liveMaxSec: 120, delayedMaxSec: 3600 },
  OPTIONS: { liveMaxSec: 60, delayedMaxSec: 900 },
  BREADTH: { liveMaxSec: 60, delayedMaxSec: 900 },
};

export function classifyFreshness(
  ageSec: number,
  policy: FreshnessPolicy,
): ProviderStatus {
  if (!Number.isFinite(ageSec) || ageSec < 0) return "OFFLINE";
  if (ageSec <= policy.liveMaxSec) return "LIVE";
  if (ageSec <= policy.delayedMaxSec) return "DELAYED";
  return "STALE";
}

// ---- Adapter interface ----------------------------------------------

export interface ProviderAdapter {
  readonly id: string;
  readonly label: string;
  readonly role: ProviderRole;
  readonly capability: ProviderCapability;
  readonly freshness: FreshnessPolicy;
  fetchQuote?(symbol: QuoteSymbol, nowIso: string): Promise<ProviderResult<QuoteTick>>;
  fetchHistorical?(
    symbol: QuoteSymbol | string,
    timeframe: Timeframe,
    limit: number,
    nowIso: string,
  ): Promise<ProviderResult<HistoricalSeries>>;
  fetchOptionsChain?(
    underlying: string,
    expiry: string,
    nowIso: string,
  ): Promise<ProviderResult<OptionsChainSnapshot>>;
  fetchBreadth?(
    universe: BreadthSnapshot["universe"],
    nowIso: string,
  ): Promise<ProviderResult<BreadthSnapshot>>;
}
