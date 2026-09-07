// Server-Sent Events endpoint for live candle streaming.
// Replaces 2s polling with real-time push from server to browser.
// Token never exposed. Provider-neutral.

import { createServerFn } from "@tanstack/react-start";
import type { QuoteSymbol } from "./provider-foundation/types";
import { INDSTOCKS_SUPPORTED_SYMBOLS } from "./provider-foundation/indstocks/indstocks-instruments.server";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";
import { SUPPORTED_INTERVALS } from "./provider-foundation/indstocks/candle-aggregator";

const VALID_SYMBOLS: ReadonlySet<string> = new Set(INDSTOCKS_SUPPORTED_SYMBOLS);

export interface LiveCandleUpdate {
  readonly type: "candle_update";
  readonly symbol: string;
  readonly interval: string;
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

export interface LiveStatusUpdate {
  readonly type: "status";
  readonly symbol: string;
  readonly connectionState: string;
  readonly provider: string;
  readonly freshness: string;
  readonly lastTick: string | null;
}

// Server function that returns historical + current candle snapshot
// Used for initial chart bootstrap
export const getLiveCandleBootstrap = createServerFn({ method: "GET" })
  .validator((data: { symbol: string; intervalMs?: number }) => data)
  .handler(async ({ data }) => {
    const symbol = data.symbol;
    const intervalMs = data.intervalMs ?? 60_000;

    if (!VALID_SYMBOLS.has(symbol)) {
      return { error: `Unsupported symbol: ${symbol}`, series: [], status: null };
    }

    const { getLiveMarketStream } = await import("./live-market-stream.server");
    const stream = getLiveMarketStream();
    stream.start();
    stream.subscribe(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);

    // Fetch historical candles
    let historical: readonly { readonly time: string; readonly open: number; readonly high: number; readonly low: number; readonly close: number; readonly volume: number | null }[] = [];
    try {
      const { buildIndstocksProviderAdapter } = await import("./provider-foundation/indstocks/indstocks-historical.adapter.server");
      const adapter = buildIndstocksProviderAdapter();
      if (adapter.fetchHistorical) {
        const tf = intervalToTimeframe(intervalMs);
        const limit = intervalToLimit(intervalMs);
        const result = await adapter.fetchHistorical(symbol as QuoteSymbol, tf, limit, new Date().toISOString());
        if (result.ok) historical = result.data.candles;
      }
    } catch { /* historical unavailable — continue with live only */ }

    const snap = stream.getSnapshot(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);
    const series = stream.getCandleSeries(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs, historical);

    return {
      error: null,
      series,
      status: {
        symbol,
        connectionState: snap.connectionState,
        provider: snap.telemetry.providerId,
        freshness: snap.telemetry.status === "LIVE" ? "LIVE" : snap.telemetry.status === "STALE" ? "STALE" : "NO_DATA",
        lastTick: snap.lastTick?.timestamp ?? null,
        lastLtp: snap.lastTick?.ltp ?? null,
        currentCandle: snap.currentCandle,
        completedCount: snap.completedCandleCount,
        historicalCount: historical.length,
      },
    };
  });

function intervalToTimeframe(intervalMs: number): import("./provider-foundation/types").Timeframe {
  switch (intervalMs) {
    case 60_000: return "1m";
    case 180_000: return "3m";
    case 300_000: return "5m";
    case 900_000: return "15m";
    case 3_600_000: return "1h";
    case 86_400_000: return "1d";
    default: return "1m";
  }
}

function intervalToLimit(intervalMs: number): number {
  switch (intervalMs) {
    case 60_000: return 375;
    case 180_000: return 125;
    case 300_000: return 75;
    case 900_000: return 25;
    case 3_600_000: return 6;
    case 86_400_000: return 30;
    default: return 375;
  }
}
