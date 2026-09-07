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

// Provider-neutral candle event emitted when a tick modifies the aggregator.
export interface LiveCandleEvent {
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
}

export type LiveCandleListener = (event: LiveCandleEvent) => void;

class LiveMarketStreamManager {
  private adapter: IndstocksWsAdapter | null = null;
  private aggregators = new Map<string, CandleAggregatorState>();
  private lastTicks = new Map<string, MarketTick | null>();
  private started = false;

  // Subscriber mechanism — tick-driven, no polling
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
    this.started = false;
  }

  subscribe(symbol: QuoteSymbol, intervalMs: AggregationIntervalMs = 60_000): boolean {
    if (!this.adapter) return false;
    const key = `${symbol}:${intervalMs}`;
    if (this.aggregators.has(key)) return true;

    const ok = this.adapter.subscribe(symbol);
    if (!ok) return false;

    this.aggregators.set(key, createAggregatorState(symbol, intervalMs));
    this.lastTicks.set(symbol, null);
    return true;
  }

  unsubscribe(symbol: QuoteSymbol, intervalMs: AggregationIntervalMs = 60_000): void {
    const key = `${symbol}:${intervalMs}`;
    this.aggregators.delete(key);
    this.lastTicks.delete(symbol);
    this.candleListeners.delete(key);
    this.adapter?.unsubscribe(symbol);
  }

  /**
   * Register a listener for candle updates on a specific symbol+interval.
   * Returns an unsubscribe function.
   * Listener fires ONLY when a provider tick actually modifies the candle.
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
          notifyAttempt: 0,
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

    // Update all aggregators for this instrument and emit candle events
    for (const [key, agg] of this.aggregators) {
      if (agg.instrument !== tick.instrument) continue;

      const prev = agg;
      const next = aggregateTick(agg, tick);
      this.aggregators.set(key, next);

      // Determine what changed
      const completed = next.completed.length > prev.completed.length;
      const currentCandle = next.current;

      if (currentCandle) {
        const connSnap = this.adapter?.connectionSnapshot();
        const freshness = connSnap?.state === "CONNECTED" ? "LIVE" :
          connSnap?.state === "RECONNECTING" ? "STALE" : "NO_DATA";

        const event: LiveCandleEvent = {
          symbol: tick.instrument as string,
          intervalMs: next.intervalMs,
          candle: {
            time: currentCandle.bucketMs,
            open: currentCandle.open,
            high: currentCandle.high,
            low: currentCandle.low,
            close: currentCandle.close,
            volume: currentCandle.volume,
          },
          completed: false,
          provider: "INDSTOCKS_V1_WS",
          freshness,
          timestamp: new Date().toISOString(),
        };

        // Emit to all listeners for this symbol+interval
        const listeners = this.candleListeners.get(key);
        if (listeners) {
          for (const listener of listeners) {
            try { listener(event); } catch { /* listener error must not crash stream */ }
          }
        }

        // If a candle was completed, also emit the completed candle event
        if (completed && next.completed.length > 0) {
          const completedCandle = next.completed[next.completed.length - 1];
          const completedEvent: LiveCandleEvent = {
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
          };
          if (listeners) {
            for (const listener of listeners) {
              try { listener(completedEvent); } catch { /* listener error */ }
            }
          }
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
