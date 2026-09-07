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

    // Update all aggregators for this instrument
    for (const [key, agg] of this.aggregators) {
      if (agg.instrument === tick.instrument) {
        this.aggregators.set(key, aggregateTick(agg, tick));
      }
    }
  }
}

// Module-level singleton (server-side only).
//
// Cloudflare Workers runtime note:
// In Cloudflare Workers, each V8 isolate maintains its own module-level state.
// This means the singleton is per-isolate, NOT globally durable across all
// requests. Multiple isolates may each have their own WebSocket connection.
// This is acceptable for a research terminal because:
// 1. Each isolate's connection is independently managed
// 2. The subscription manager prevents duplicate subscriptions within an isolate
// 3. Cold starts will re-establish connections via the start() call
// 4. No critical state is lost — historical data is fetched from REST on demand
//
// Do NOT claim this is a globally durable singleton. It is isolate-local.
let instance: LiveMarketStreamManager | null = null;

export function getLiveMarketStream(): LiveMarketStreamManager {
  if (!instance) {
    instance = new LiveMarketStreamManager();
  }
  return instance;
}

/**
 * Reset the singleton (for testing only).
 * Not safe for production use — breaks other references to the old instance.
 */
export function resetLiveMarketStream(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
