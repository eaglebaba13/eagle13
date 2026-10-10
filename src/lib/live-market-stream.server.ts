// Server-only live market stream singleton.
// Manages IndstocksWsAdapter + CandleAggregator for production use.
// Runs server-side only. Token never exposed to client.

import {
  createLiveMarketProvider,
  type LiveMarketStreamProvider,
} from "./live-market-provider.server";
import {
  tickFreshness,
  validSelection,
  candleSchema,
  type LiveCandleEvent,
} from "./live-candle-contract";
export type { LiveCandleEvent } from "./live-candle-contract";
import type { MarketTick } from "./provider-foundation/indstocks/indstocks-ws-types";
import {
  aggregateTick,
  createAggregatorState,
  mergeHistoricalAndLive,
  type CandleAggregatorState,
  type AggregationIntervalMs,
  type MergedCandlePoint,
} from "./provider-foundation/indstocks/candle-aggregator";
import type { QuoteSymbol } from "./provider-foundation/types";

export interface LiveStreamSnapshot {
  readonly instrument: string;
  readonly connectionState: string;
  readonly lastTick: MarketTick | null;
  readonly currentCandle:
    import("./provider-foundation/indstocks/candle-aggregator").LiveCandle | null;
  readonly completedCandleCount: number;
  readonly telemetry: import("./provider-foundation/types").ProviderTelemetry;
  readonly subscriptionActive: boolean;
}

export type LiveCandleListener = (event: LiveCandleEvent) => void;

export class LiveMarketStreamManager {
  constructor(
    private readonly factory: () => LiveMarketStreamProvider = createLiveMarketProvider,
  ) {}
  private intervalRefs = new Map<string, number>();
  private adapter: LiveMarketStreamProvider | null = null;
  private aggregators = new Map<string, CandleAggregatorState>();
  private lastTicks = new Map<string, MarketTick | null>();
  private started = false;

  // Symbol-level provider subscription reference counting
  private symbolRefCount = new Map<string, number>();

  // Interval-level candle listeners: key = symbol:intervalMs
  private candleListeners = new Map<string, Set<LiveCandleListener>>();

  start(): void {
    if (this.started) return;
    this.started = true;
    this.adapter = this.factory();
    this.adapter.onTick((tick) => this.handleTick(tick));
    this.adapter.connect();
  }

  stop(): void {
    this.adapter?.close();
    this.adapter = null;
    this.aggregators.clear();
    this.lastTicks.clear();
    this.candleListeners.clear();
    this.symbolRefCount.clear();
    this.intervalRefs.clear();
    this.started = false;
  }

  /**
   * Subscribe to a symbol+interval combination.
   * Provider subscription is symbol-level and reference counted.
   * Aggregator/listener state is symbol:interval-level.
   */
  subscribe(symbol: QuoteSymbol, intervalMs: AggregationIntervalMs = 60_000): boolean {
    if (!this.adapter || !validSelection(symbol, intervalMs)) return false;

    const aggKey = `${symbol}:${intervalMs}`;

    // Create aggregator if not exists (interval-level)
    if (!this.aggregators.has(aggKey)) {
      this.aggregators.set(aggKey, createAggregatorState(symbol, intervalMs));
    }

    // Symbol-level provider subscription (reference counted)
    const refCount = this.symbolRefCount.get(symbol) ?? 0;
    if (refCount === 0) {
      const ok = this.adapter.subscribe(symbol);
      if (!ok) return false;
      this.lastTicks.set(symbol, null);
    }
    this.symbolRefCount.set(symbol, refCount + 1);
    this.intervalRefs.set(aggKey, (this.intervalRefs.get(aggKey) ?? 0) + 1);
    return true;
  }

  /**
   * Unsubscribe from a symbol+interval combination.
   * Provider subscription is only removed when ALL intervals for that symbol
   * have zero subscribers.
   */
  unsubscribe(symbol: QuoteSymbol, intervalMs: AggregationIntervalMs = 60_000): void {
    const aggKey = `${symbol}:${intervalMs}`;

    const refs = this.intervalRefs.get(aggKey) ?? 0;
    if (refs === 0) return;
    if (refs === 1) {
      this.intervalRefs.delete(aggKey);
      this.aggregators.delete(aggKey);
      this.candleListeners.delete(aggKey);
    } else this.intervalRefs.set(aggKey, refs - 1);

    // Decrement symbol-level ref count
    const refCount = (this.symbolRefCount.get(symbol) ?? 1) - 1;
    if (refCount <= 0) {
      // Last subscriber for this symbol — remove provider subscription
      this.symbolRefCount.delete(symbol);
      this.lastTicks.delete(symbol);
      this.adapter?.unsubscribe(symbol);
    } else {
      this.symbolRefCount.set(symbol, refCount);
    }
    if (this.symbolRefCount.size === 0) this.stop();
  }

  /**
   * Register a listener for candle updates on a specific symbol+interval.
   * Returns an unsubscribe function that only removes THIS listener.
   */
  onCandleUpdate(
    symbol: QuoteSymbol,
    intervalMs: AggregationIntervalMs,
    listener: LiveCandleListener,
  ): () => void {
    const key = `${symbol}:${intervalMs}`;
    if (!this.candleListeners.has(key)) {
      this.candleListeners.set(key, new Set());
    }
    this.candleListeners.get(key)!.add(listener);
    return () => {
      this.candleListeners.get(key)?.delete(listener);
    };
  }

  getSnapshot(symbol: QuoteSymbol, intervalMs: AggregationIntervalMs = 60_000): LiveStreamSnapshot {
    const key = `${symbol}:${intervalMs}`;
    const agg = this.aggregators.get(key) ?? null;
    const lastTick = this.lastTicks.get(symbol) ?? null;
    const connSnap = this.adapter?.connectionSnapshot();
    const subActive = this.adapter?.isConnected ?? false;

    return {
      instrument: symbol,
      connectionState: connSnap?.state ?? "DISCONNECTED",
      lastTick,
      currentCandle: agg?.current ?? null,
      completedCandleCount: agg?.completed.length ?? 0,
      telemetry: {
        providerId: this.adapter?.id ?? "INDSTOCKS_V1",
        status: lastTick
          ? tickFreshness(lastTick.timestamp) === "LIVE" && connSnap?.state === "CONNECTED"
            ? "LIVE"
            : "STALE"
          : connSnap?.state === "FAILED"
            ? "FAILED"
            : "OFFLINE",
        latencyMs: lastTick ? Math.max(0, Date.now() - Date.parse(lastTick.timestamp)) : 0,
        receivedAt: connSnap?.lastMessageAt ?? new Date().toISOString(),
        providerTime: lastTick?.timestamp ?? null,
        marketSession: "UNKNOWN",
        rateLimit: null,
        retryAfterMs: null,
        staleReason: connSnap?.lastError ?? null,
        role: "PRIMARY",
      },
      subscriptionActive: subActive,
    };
  }

  getCandleSeries(
    symbol: QuoteSymbol,
    intervalMs: AggregationIntervalMs = 60_000,
    historical: readonly {
      readonly time: string;
      readonly open: number;
      readonly high: number;
      readonly low: number;
      readonly close: number;
      readonly volume: number | null;
    }[] = [],
  ): MergedCandlePoint[] {
    const key = `${symbol}:${intervalMs}`;
    const agg = this.aggregators.get(key);
    return mergeHistoricalAndLive(historical, agg?.completed ?? [], agg?.current ?? null).filter(
      (c) =>
        candleSchema.safeParse({
          time: c.x,
          open: c.y[0],
          high: c.y[1],
          low: c.y[2],
          close: c.y[3],
          volume: c.volume,
        }).success,
    );
  }

  private handleTick(tick: MarketTick): void {
    if (
      !validSelection(tick.instrument, 60000) ||
      !Number.isFinite(Date.parse(tick.timestamp)) ||
      Date.parse(tick.timestamp) > Date.now() + 5000 ||
      !Number.isFinite(tick.ltp) ||
      tick.ltp <= 0 ||
      (tick.volume !== null && (!Number.isFinite(tick.volume) || tick.volume < 0))
    )
      return;
    const previous = this.lastTicks.get(tick.instrument);
    if (previous && Date.parse(tick.timestamp) <= Date.parse(previous.timestamp)) return;
    this.lastTicks.set(tick.instrument, tick);

    // Update ALL aggregators for this instrument (different intervals)
    for (const [key, agg] of this.aggregators) {
      if (agg.instrument !== tick.instrument) continue;

      const prevCompletedCount = agg.completed.length;
      const next = aggregateTick(agg, tick);
      this.aggregators.set(key, next);

      const candleCompleted =
        next.current?.bucketMs !== agg.current?.bucketMs && agg.current !== null;
      const connSnap = this.adapter?.connectionSnapshot();
      const freshness = tickFreshness(tick.timestamp);
      const connectionState = connSnap?.state ?? "DISCONNECTED";
      const lastTickIso = tick.timestamp;
      const lastLtp = tick.ltp;

      const listeners = this.candleListeners.get(key);
      if (!listeners || listeners.size === 0) continue;

      // ORDER: emit completed candle FIRST, then new current candle
      // This prevents browser from clearing new candle at boundary

      // 1. Completed previous candle
      if (candleCompleted && next.completed.length > 0) {
        const completedCandle = next.completed[next.completed.length - 1];
        const completedEvent: LiveCandleEvent = {
          type: "candle_update",
          symbol: tick.instrument as string,
          intervalMs: next.intervalMs,
          candle: {
            time: completedCandle.bucketMs,
            open: completedCandle.open,
            high: completedCandle.high,
            low: completedCandle.low,
            close: completedCandle.close,
            volume: completedCandle.volume,
          },
          completed: true,
          provider: tick.provider,
          quality: tick.quality,
          freshness,
          timestamp: tick.timestamp,
          lastLtp,
          lastTick: lastTickIso,
          connectionState,
          tickCount: null,
        };
        for (const listener of listeners) {
          try {
            listener(completedEvent);
          } catch {
            /* listener error */
          }
        }
      }

      // 2. New current candle
      if (next.current) {
        const currentEvent: LiveCandleEvent = {
          type: "candle_update",
          symbol: tick.instrument as string,
          intervalMs: next.intervalMs,
          candle: {
            time: next.current.bucketMs,
            open: next.current.open,
            high: next.current.high,
            low: next.current.low,
            close: next.current.close,
            volume: next.current.volume,
          },
          completed: false,
          provider: tick.provider,
          quality: tick.quality,
          freshness,
          timestamp: tick.timestamp,
          lastLtp,
          lastTick: lastTickIso,
          connectionState,
          tickCount: next.current.tickCount,
        };
        for (const listener of listeners) {
          try {
            listener(currentEvent);
          } catch {
            /* listener error */
          }
        }
      }
    }
  }
}

// Module-level singleton (server-side only).
// One bounded subscription manager per Node process.
let instance: LiveMarketStreamManager | null = null;

export function getLiveMarketStream(): LiveMarketStreamManager {
  if (!instance) {
    instance = new LiveMarketStreamManager();
  }
  return instance;
}

export function resetLiveMarketStream(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
