// Server-only live market stream singleton.
// Manages IndstocksWsAdapter + CandleAggregator for production use.
// Runs server-side only. Token never exposed to client.

import { IndstocksWsAdapter } from "./indstocks/indstocks-ws-adapter.server";
import type { MarketTick } from "./indstocks/indstocks-ws-types";
import {
  aggregateTick,
  createAggregatorState,
  mergeHistoricalAndLive,
  type CandleAggregatorState,
  type AggregationIntervalMs,
} from "./indstocks/candle-aggregator";
import { buildIndstocksWsTelemetry } from "./indstocks/indstocks-ws-adapter.server";
import type { QuoteSymbol } from "./types";

export interface LiveStreamSnapshot {
  readonly instrument: string;
  readonly connectionState: string;
  readonly lastTick: MarketTick | null;
  readonly currentCandle: import("./indstocks/candle-aggregator").LiveCandle | null;
  readonly completedCandleCount: number;
  readonly telemetry: import("./types").ProviderTelemetry;
  readonly subscriptionActive: boolean;
}

class LiveMarketStreamManager {
  private adapter: IndstocksWsAdapter | null = null;
  private aggregators = new Map<string, CandleAggregatorState>();
  private lastTicks = new Map<string, MarketTick | null>();
  private tickUnsubscribers = new Map<string, () => void>();
  private started = false;
  private defaultIntervalMs: AggregationIntervalMs = 60_000; // 1m

  start(): void {
    if (this.started) return;
    this.started = true;
    this.adapter = new IndstocksWsAdapter();
    this.adapter.onTick((tick) => this.handleTick(tick));
    this.adapter.connect();
  }

  stop(): void {
    for (const unsub of this.tickUnsubscribers.values()) unsub();
    this.tickUnsubscribers.clear();
    this.adapter?.close();
    this.adapter = null;
    this.aggregators.clear();
    this.lastTicks.clear();
    this.started = false;
  }

  subscribe(symbol: QuoteSymbol, intervalMs: AggregationIntervalMs = 60_000): boolean {
    if (!this.adapter) return false;
    const key = `${symbol}:${intervalMs}`;
    if (this.aggregators.has(key)) return true; // already subscribed

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
    this.adapter?.unsubscribe(symbol);
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
        connSnap ?? { state: "DISCONNECTED", connectedAt: null, lastMessageAt: null, reconnectAttempt: 0, lastError: null },
        agg ? 1 : 0,
      ),
      subscriptionActive: subActive,
    };
  }

  getCandleSeries(
    symbol: QuoteSymbol,
    intervalMs: AggregationIntervalMs = 60_000,
    historical: readonly { readonly time: string; readonly open: number; readonly high: number; readonly low: number; readonly close: number; readonly volume: number | null }[] = [],
  ): Array<{ x: number; y: [number, number, number, number] }> {
    const key = `${symbol}:${intervalMs}`;
    const agg = this.aggregators.get(key);
    return mergeHistoricalAndLive(
      historical,
      agg?.completed ?? [],
      agg?.current ?? null,
    );
  }

  private handleTick(tick: MarketTick): void {
    this.lastTicks.set(tick.instrument as string, tick);

    // Update all aggregators for this instrument
    for (const [key, agg] of this.aggregators) {
      if (agg.instrument === tick.instrument) {
        this.aggregators.set(key, aggregateTick(agg, tick));
      }
    }
  }
}

// Module-level singleton (server-side only)
let instance: LiveMarketStreamManager | null = null;

export function getLiveMarketStream(): LiveMarketStreamManager {
  if (!instance) {
    instance = new LiveMarketStreamManager();
  }
  return instance;
}
