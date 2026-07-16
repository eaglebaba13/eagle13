import { FailoverManager, type FailoverDecision } from "./failover-manager";
import { ProviderHealthManager, type HealthSummary } from "./health-manager";
import { ProviderCache, type CacheStats } from "./provider-cache";
import { RateLimiter, type RateLimiterConfig } from "./rate-limiter";
import { ProviderRegistry } from "./provider-registry";
import { computeProviderSessionId } from "./provider-run-id";
import type {
  BreadthSnapshot,
  HistoricalSeries,
  OptionsChainSnapshot,
  ProviderAdapter,
  ProviderDomain,
  ProviderResult,
  ProviderStatus,
  QuoteSymbol,
  QuoteTick,
  Timeframe,
} from "./types";

export interface FetchOptions {
  readonly nowIso: string;
  readonly nowMs: number;
  readonly cacheTtlMs?: number;
  readonly bypassCache?: boolean;
}

export interface DomainWiring {
  readonly domain: ProviderDomain;
  readonly primaryId: string | null;
  readonly secondaryId: string | null;
  readonly rateLimit?: RateLimiterConfig;
}

export interface ManagerDiagnostics {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly cache: CacheStats;
  readonly health: readonly HealthSummary[];
  readonly wirings: readonly {
    domain: ProviderDomain;
    primary: string | null;
    secondary: string | null;
    refreshIntervalMs: number;
  }[];
  readonly lastDecisions: readonly {
    domain: ProviderDomain;
    role: string;
    chosen: string | null;
    reason: string;
    at: string;
  }[];
}

export const DEFAULT_REFRESH_INTERVAL_MS: Record<ProviderDomain, number> = {
  QUOTES: 5_000,
  HISTORICAL: 60_000,
  OPTIONS: 15_000,
  BREADTH: 30_000,
};

const HEALTHY: ReadonlySet<ProviderStatus> = new Set(["LIVE", "DELAYED"]);

export class ProviderManager {
  readonly registry = new ProviderRegistry();
  private readonly failover = new FailoverManager();
  private readonly cache = new ProviderCache();
  private readonly health = new Map<string, ProviderHealthManager>();
  private readonly rateLimiters = new Map<ProviderDomain, RateLimiter>();
  private readonly wirings = new Map<ProviderDomain, DomainWiring>();
  private readonly lastDecisions: {
    domain: ProviderDomain;
    role: string;
    chosen: string | null;
    reason: string;
    at: string;
  }[] = [];

  readonly sessionId: string;
  readonly startedAt: string;

  constructor(readonly seed: { startedAt: string; primary: string; secondary?: string | null }) {
    this.startedAt = seed.startedAt;
    this.sessionId = computeProviderSessionId({
      primary: seed.primary,
      secondary: seed.secondary ?? null,
      domain: "ALL",
      symbols: [],
      timeframes: [],
      startedAt: seed.startedAt,
    });
  }

  register(adapter: ProviderAdapter): void {
    this.registry.register(adapter);
    if (!this.health.has(adapter.id)) {
      this.health.set(adapter.id, new ProviderHealthManager(adapter.id));
    }
  }

  wire(w: DomainWiring): void {
    this.wirings.set(w.domain, w);
    if (w.rateLimit) this.rateLimiters.set(w.domain, new RateLimiter(w.rateLimit));
  }

  async getQuote(symbol: QuoteSymbol, opts: FetchOptions): Promise<ProviderResult<QuoteTick>> {
    return this.exec("QUOTES", `quote:${symbol}`, opts, (a) =>
      a.fetchQuote?.(symbol, opts.nowIso) ??
      Promise.resolve({ ok: false, reason: "UNAVAILABLE", telemetry: this.failTelemetry(a.id, opts.nowIso, "no fetchQuote") } as const),
    );
  }

  async getHistorical(
    symbol: QuoteSymbol | string,
    timeframe: Timeframe,
    limit: number,
    opts: FetchOptions,
  ): Promise<ProviderResult<HistoricalSeries>> {
    return this.exec("HISTORICAL", `hist:${symbol}:${timeframe}:${limit}`, opts, (a) =>
      a.fetchHistorical?.(symbol, timeframe, limit, opts.nowIso) ??
      Promise.resolve({ ok: false, reason: "UNAVAILABLE", telemetry: this.failTelemetry(a.id, opts.nowIso, "no fetchHistorical") } as const),
    );
  }

  async getOptionsChain(
    underlying: string,
    expiry: string,
    opts: FetchOptions,
  ): Promise<ProviderResult<OptionsChainSnapshot>> {
    return this.exec("OPTIONS", `opt:${underlying}:${expiry}`, opts, (a) =>
      a.fetchOptionsChain?.(underlying, expiry, opts.nowIso) ??
      Promise.resolve({ ok: false, reason: "UNAVAILABLE", telemetry: this.failTelemetry(a.id, opts.nowIso, "no fetchOptionsChain") } as const),
    );
  }

  async getBreadth(
    universe: BreadthSnapshot["universe"],
    opts: FetchOptions,
  ): Promise<ProviderResult<BreadthSnapshot>> {
    return this.exec("BREADTH", `bre:${universe}`, opts, (a) =>
      a.fetchBreadth?.(universe, opts.nowIso) ??
      Promise.resolve({ ok: false, reason: "UNAVAILABLE", telemetry: this.failTelemetry(a.id, opts.nowIso, "no fetchBreadth") } as const),
    );
  }

  private async exec<T>(
    domain: ProviderDomain,
    cacheKey: string,
    opts: FetchOptions,
    call: (a: ProviderAdapter) => Promise<ProviderResult<T>>,
  ): Promise<ProviderResult<T>> {
    const ttl = opts.cacheTtlMs ?? DEFAULT_REFRESH_INTERVAL_MS[domain];
    if (!opts.bypassCache) {
      const cached = this.cache.get<ProviderResult<T>>(cacheKey, opts.nowMs);
      if (cached) return cached;
    }
    const limiter = this.rateLimiters.get(domain);
    if (limiter) {
      const rc = limiter.tryConsume(opts.nowMs);
      if (!rc.ok) {
        return {
          ok: false,
          reason: "RATE_LIMITED",
          telemetry: this.failTelemetry("manager", opts.nowIso, "rate limited", rc.retryAfterMs, "RATE_LIMITED"),
        };
      }
    }
    const wiring = this.wirings.get(domain);
    if (!wiring) {
      return {
        ok: false,
        reason: "UNAVAILABLE",
        telemetry: this.failTelemetry("manager", opts.nowIso, `no wiring for ${domain}`),
      };
    }
    const primary = wiring.primaryId ? this.registry.get(wiring.primaryId) : null;
    const secondary = wiring.secondaryId ? this.registry.get(wiring.secondaryId) : null;
    const primaryStatus = primary ? this.health.get(primary.id)!.currentStatus() : "OFFLINE";
    const secondaryStatus = secondary ? this.health.get(secondary.id)!.currentStatus() : "OFFLINE";
    const decision: FailoverDecision = this.failover.choose(
      primary ? { adapter: primary, status: primaryStatus } : null,
      secondary ? { adapter: secondary, status: secondaryStatus } : null,
    );
    this.lastDecisions.push({
      domain,
      role: decision.role,
      chosen: decision.chosen?.id ?? null,
      reason: decision.reason,
      at: opts.nowIso,
    });
    if (this.lastDecisions.length > 100) this.lastDecisions.shift();

    if (!decision.chosen) {
      const result: ProviderResult<T> = {
        ok: false,
        reason: "UNAVAILABLE",
        telemetry: this.failTelemetry("manager", opts.nowIso, decision.reason),
      };
      return result;
    }

    // Try chosen, then the other side on failure.
    const first = await this.invoke<T>(decision.chosen, opts, call);
    if (first.ok) {
      this.cache.set(cacheKey, first, opts.nowMs, ttl);
      return first;
    }
    const otherId = decision.chosen.id === primary?.id ? secondary?.id : primary?.id;
    if (otherId) {
      const other = this.registry.get(otherId);
      if (other) {
        const second = await this.invoke<T>(other, opts, call);
        if (second.ok) {
          this.cache.set(cacheKey, second, opts.nowMs, ttl);
          return second;
        }
      }
    }
    return first;
  }

  private async invoke<T>(
    adapter: ProviderAdapter,
    opts: FetchOptions,
    call: (a: ProviderAdapter) => Promise<ProviderResult<T>>,
  ): Promise<ProviderResult<T>> {
    const start = opts.nowMs;
    let res: ProviderResult<T>;
    try {
      res = await call(adapter);
    } catch (err) {
      res = {
        ok: false,
        reason: "UNKNOWN",
        detail: err instanceof Error ? err.message : String(err),
        telemetry: this.failTelemetry(adapter.id, opts.nowIso, "exception"),
      };
    }
    const latency = Math.max(0, opts.nowMs - start);
    const hm = this.health.get(adapter.id)!;
    const newStatus: ProviderStatus = res.ok
      ? HEALTHY.has(res.telemetry.status)
        ? res.telemetry.status
        : res.telemetry.status
      : res.reason === "RATE_LIMITED"
        ? "RATE_LIMITED"
        : res.reason === "UNAVAILABLE"
          ? "OFFLINE"
          : "FAILED";
    hm.record(
      {
        at: opts.nowIso,
        ok: res.ok,
        latencyMs: latency,
        reason: res.ok ? undefined : res.reason,
      },
      newStatus,
    );
    return res;
  }

  private failTelemetry(
    providerId: string,
    nowIso: string,
    reason: string,
    retryAfterMs?: number,
    status: ProviderStatus = "FAILED",
  ) {
    return {
      status,
      latencyMs: 0,
      receivedAt: nowIso,
      providerTime: null,
      marketSession: "UNKNOWN" as const,
      rateLimit: null,
      retryAfterMs: retryAfterMs ?? null,
      staleReason: reason,
      providerId,
      role: "PRIMARY" as const,
    };
  }

  diagnostics(): ManagerDiagnostics {
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cache: this.cache.snapshot(),
      health: Array.from(this.health.values())
        .map((h) => h.summary())
        .sort((a, b) => a.providerId.localeCompare(b.providerId)),
      wirings: Array.from(this.wirings.values()).map((w) => ({
        domain: w.domain,
        primary: w.primaryId,
        secondary: w.secondaryId,
        refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS[w.domain],
      })),
      lastDecisions: [...this.lastDecisions],
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
