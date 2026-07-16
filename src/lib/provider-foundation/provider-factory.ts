import type {
  BreadthSnapshot,
  HistoricalCandle,
  HistoricalSeries,
  OptionsChainSnapshot,
  ProviderAdapter,
  ProviderCapability,
  ProviderResult,
  ProviderRole,
  ProviderTelemetry,
  QuoteSymbol,
  QuoteTick,
  Timeframe,
} from "./types";
import { DEFAULT_FRESHNESS, classifyFreshness } from "./types";

export interface FactoryQuote {
  readonly last: number;
  readonly open?: number | null;
  readonly high?: number | null;
  readonly low?: number | null;
  readonly prevClose?: number | null;
  readonly volume?: number | null;
  readonly currency?: string;
  readonly providerTime?: string | null;
  readonly ageSec?: number;
}

export interface FactoryConfig {
  readonly id: string;
  readonly label: string;
  readonly role: ProviderRole;
  readonly capability: ProviderCapability;
  readonly quotes?: Readonly<Partial<Record<QuoteSymbol, FactoryQuote>>>;
  readonly historical?: Readonly<Record<string, readonly HistoricalCandle[]>>; // key = `${symbol}:${tf}`
  readonly options?: Readonly<Record<string, OptionsChainSnapshot>>; // key underlying
  readonly breadth?: Readonly<Record<string, BreadthSnapshot>>; // key universe
  readonly latencyMs?: number;
  readonly rateLimited?: boolean;
  readonly offline?: boolean;
  readonly failReason?: "AUTH_REQUIRED" | "NETWORK" | "SCHEMA_ERROR" | "TIMEOUT";
}

function baseTelemetry(cfg: FactoryConfig, nowIso: string, ageSec: number): ProviderTelemetry {
  const domain = cfg.capability.domain;
  const policy = DEFAULT_FRESHNESS[domain];
  const status = classifyFreshness(ageSec, policy);
  return {
    status,
    latencyMs: cfg.latencyMs ?? 0,
    receivedAt: nowIso,
    providerTime: null,
    marketSession: "UNKNOWN",
    rateLimit: null,
    retryAfterMs: null,
    staleReason: status === "STALE" ? `age=${ageSec}s > ${policy.delayedMaxSec}s` : null,
    providerId: cfg.id,
    role: cfg.role,
  };
}

function failTelemetry(cfg: FactoryConfig, nowIso: string, status: "OFFLINE" | "RATE_LIMITED" | "FAILED", reason: string, retryAfterMs?: number): ProviderTelemetry {
  return {
    status,
    latencyMs: cfg.latencyMs ?? 0,
    receivedAt: nowIso,
    providerTime: null,
    marketSession: "UNKNOWN",
    rateLimit: null,
    retryAfterMs: retryAfterMs ?? null,
    staleReason: reason,
    providerId: cfg.id,
    role: cfg.role,
  };
}

/**
 * Build a deterministic in-memory adapter from a static config.
 * Real-network adapters (Yahoo/NSE/Broker WS) will replace these
 * factories in Stage 2–4 without changing the ProviderAdapter contract.
 */
export function createFactoryAdapter(cfg: FactoryConfig): ProviderAdapter {
  return {
    id: cfg.id,
    label: cfg.label,
    role: cfg.role,
    capability: cfg.capability,
    freshness: DEFAULT_FRESHNESS[cfg.capability.domain],
    async fetchQuote(symbol, nowIso): Promise<ProviderResult<QuoteTick>> {
      if (cfg.offline) return fail("UNAVAILABLE", cfg, nowIso);
      if (cfg.rateLimited) return fail("RATE_LIMITED", cfg, nowIso, 1000);
      if (cfg.failReason) return fail(cfg.failReason, cfg, nowIso);
      if (!cfg.capability.quotes?.includes(symbol)) return fail("UNSUPPORTED_SYMBOL", cfg, nowIso);
      const q = cfg.quotes?.[symbol];
      if (!q) return fail("UNAVAILABLE", cfg, nowIso);
      const telemetry = baseTelemetry(cfg, nowIso, q.ageSec ?? 0);
      const tick: QuoteTick = {
        symbol,
        last: q.last,
        open: q.open ?? null,
        high: q.high ?? null,
        low: q.low ?? null,
        prevClose: q.prevClose ?? null,
        change: q.prevClose != null ? q.last - q.prevClose : null,
        changePct:
          q.prevClose != null && q.prevClose !== 0
            ? ((q.last - q.prevClose) / q.prevClose) * 100
            : null,
        volume: q.volume ?? null,
        currency: q.currency ?? "INR",
        telemetry: { ...telemetry, providerTime: q.providerTime ?? null },
      };
      return { ok: true, data: tick, telemetry: tick.telemetry };
    },
    async fetchHistorical(symbol, timeframe: Timeframe, limit, nowIso): Promise<ProviderResult<HistoricalSeries>> {
      if (cfg.offline) return fail("UNAVAILABLE", cfg, nowIso);
      if (cfg.rateLimited) return fail("RATE_LIMITED", cfg, nowIso, 1000);
      if (cfg.failReason) return fail(cfg.failReason, cfg, nowIso);
      if (!cfg.capability.historical?.includes(timeframe)) return fail("UNSUPPORTED_TIMEFRAME", cfg, nowIso);
      const key = `${symbol}:${timeframe}`;
      const candles = cfg.historical?.[key];
      if (!candles) return fail("UNAVAILABLE", cfg, nowIso);
      const telemetry = baseTelemetry(cfg, nowIso, 0);
      const series: HistoricalSeries = {
        symbol,
        timeframe,
        candles: candles.slice(-Math.max(1, limit)),
        telemetry,
      };
      return { ok: true, data: series, telemetry };
    },
    async fetchOptionsChain(underlying, expiry, nowIso): Promise<ProviderResult<OptionsChainSnapshot>> {
      if (cfg.offline) return fail("UNAVAILABLE", cfg, nowIso);
      if (cfg.rateLimited) return fail("RATE_LIMITED", cfg, nowIso, 1000);
      if (cfg.failReason) return fail(cfg.failReason, cfg, nowIso);
      const chain = cfg.options?.[underlying];
      if (!chain) return fail("UNAVAILABLE", cfg, nowIso);
      const telemetry = baseTelemetry(cfg, nowIso, 0);
      const snap: OptionsChainSnapshot = { ...chain, underlying, expiry, telemetry };
      return { ok: true, data: snap, telemetry };
    },
    async fetchBreadth(universe, nowIso): Promise<ProviderResult<BreadthSnapshot>> {
      if (cfg.offline) return fail("UNAVAILABLE", cfg, nowIso);
      if (cfg.rateLimited) return fail("RATE_LIMITED", cfg, nowIso, 1000);
      if (cfg.failReason) return fail(cfg.failReason, cfg, nowIso);
      const b = cfg.breadth?.[universe];
      if (!b) return fail("UNAVAILABLE", cfg, nowIso);
      const telemetry = baseTelemetry(cfg, nowIso, 0);
      const snap: BreadthSnapshot = { ...b, universe, telemetry };
      return { ok: true, data: snap, telemetry };
    },
  };
}

function fail<T>(
  reason:
    | "UNAVAILABLE"
    | "RATE_LIMITED"
    | "UNSUPPORTED_SYMBOL"
    | "UNSUPPORTED_TIMEFRAME"
    | "AUTH_REQUIRED"
    | "NETWORK"
    | "SCHEMA_ERROR"
    | "TIMEOUT",
  cfg: FactoryConfig,
  nowIso: string,
  retryAfterMs?: number,
): ProviderResult<T> {
  const status = reason === "RATE_LIMITED" ? "RATE_LIMITED" : reason === "UNAVAILABLE" ? "OFFLINE" : "FAILED";
  return {
    ok: false,
    reason,
    telemetry: failTelemetry(cfg, nowIso, status, reason, retryAfterMs),
  };
}
