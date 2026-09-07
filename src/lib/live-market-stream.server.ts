// Server-only live market stream singleton.
// Manages IndstocksWsAdapter + CandleAggregator for production use.
// Runs server-side only. Token never exposed to client.

import { IndstocksWsAdapter } from "./provider-foundation/indstocks/indstocks-ws-adapter.server";
import type { MarketTick } from "./provider-foundation/indstocks/indstocks-ws-types";
import {
  aggregateTick,
  createAggregatorState,
  mergeHistoricalAndLive,
  type CandleAggregatorState,
  type AggregationIntervalMs,
  type MergedCandlePoint,
} from "./provider-foundation/indstocks/candle-aggregator";
import { buildIndstocksWsTelemetry } from "./provider-foundation/indstocks/indstocks-ws-adapter.server";
import type { QuoteSymbol } from "./provider-foundation/types";

export interface LiveStreamSnapshot {
  readonly instrument: string;
  readonly connectionState: string;
  readonly lastTick: MarketTick | null;
  readonly currentCandle: import("./provider-foundation/indstocks/candle-aggregator").LiveCandle | null;
  readonly completedCandleCount: number;
  readonly telemetry: import("./provider-foundation/types").ProviderTelemetry;
  readonly subscriptionActive: boolean;
}

export interface LiveCandleEvent {
  readonly type: "candle_update";
  readonly symbol: string;
  readonly intervalMs: number;
  readonly candle: {
    readonly time: number;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume: number | null;
  };
  readonly completed: boolean;
  readonly provider: string;
  readonly freshness: string;
  readonly timestamp: string;
  readonly lastLtp: number | null;
  readonly lastTick: string | null;
  readonly connectionState: string;
  readonly tickCount: number | null;
}

export type LiveCandleListener = (event: LiveCandleEvent) => void;

class LiveMarketStreamManager {
  private adapter: IndstocksWsAdapter | null = null;
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
    this.adapter = new IndstocksWsAdapter();
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
    this.started = false;
  }

  /**
   * Subscribe to a symbol+interval combination.
   * Provider subscription is symbol-level and reference counted.
   * Aggregator/listener state is symbol:interval-level.
   */
  subscribe(symbol: QuoteSymbol, intervalMs: AggregationIntervalMs = 60_000): boolean {
    if (!this.adapter) return false;

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
    return true;
  }

  /**
   * Unsubscribe from a symbol+interval combination.
   * Provider subscription is only removed when ALL intervals for that symbol
   * have zero subscribers.
   */
  unsubscribe(symbol: QuoteSymbol, intervalMs: AggregationIntervalMs = 60_000): void {
    const aggKey = `${symbol}:${intervalMs}`;

    // Remove interval-level state
    this.aggregators.delete(aggKey);
    this.candleListeners.delete(aggKey);

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
      telemetry: buildIndstocksWsTelemetry(
        connSnap ?? {
          state: "DISCONNECTED",
          connectedAt: null,
          lastMessageAt: null,
          reconnectAttempt: 0,
          lastError: null,
        },
        agg ? 1 : 0,
      ),
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
    return mergeHistoricalAndLive(historical, agg?.completed ?? [], agg?.current ?? null);
  }

  private handleTick(tick: MarketTick): void {
    this.lastTicks.set(tick.instrument as string, tick);

    // Update ALL aggregators for this instrument (different intervals)
    for (const [key, agg] of this.aggregators) {
      if (agg.instrument !== tick.instrument) continue;

      const prevCompletedCount = agg.completed.length;
      const next = aggregateTick(agg, tick);
      this.aggregators.set(key, next);

      const candleCompleted = next.completed.length > prevCompletedCount;
      const connSnap = this.adapter?.connectionSnapshot();
      const freshness = connSnap?.state === "CONNECTED" ? "LIVE" :
        connSnap?.state === "RECONNECTING" ? "STALE" : "NO_DATA";
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
          provider: "INDSTOCKS_V1_WS",
          freshness,
          timestamp: new Date().toISOString(),
          lastLtp,
          lastTick: lastTickIso,
          connectionState,
          tickCount: null,
        };
        for (const listener of listeners) {
          try { listener(completedEvent); } catch { /* listener error */ }
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
          provider: "INDSTOCKS_V1_WS",
          freshness,
          timestamp: new Date().toISOString(),
          lastLtp,
          lastTick: lastTickIso,
          connectionState,
          tickCount: next.current.tickCount,
        };
        for (const listener of listeners) {
          try { listener(currentEvent); } catch { /* listener error */ }
        }
      }
    }
  }
}

// Module-level singleton (server-side only).
// Cloudflare Workers: per-isolate, NOT globally durable.
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
