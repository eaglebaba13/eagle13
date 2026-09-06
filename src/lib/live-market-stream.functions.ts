// Server function for live market candle data.
// Fetches historical REST candles, merges with live WebSocket aggregated state.
// Token never exposed — only normalized candle data and telemetry returned.

import { createServerFn } from "@tanstack/react-start";
import type { QuoteSymbol } from "./provider-foundation/types";
import { INDSTOCKS_SUPPORTED_SYMBOLS } from "./provider-foundation/indstocks/indstocks-instruments.server";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";
import { SUPPORTED_INTERVALS } from "./provider-foundation/indstocks/candle-aggregator";

const VALID_SYMBOLS: ReadonlySet<string> = new Set(INDSTOCKS_SUPPORTED_SYMBOLS);

function isValidSymbol(s: string): s is QuoteSymbol {
  return VALID_SYMBOLS.has(s);
}

function isValidInterval(ms: number): ms is AggregationIntervalMs {
  return (SUPPORTED_INTERVALS as readonly number[]).includes(ms);
}

export interface LiveCandleResponse {
  readonly instrument: string;
  readonly connectionState: string;
  readonly subscriptionActive: boolean;
  readonly provider: string;
  readonly providerStatus: string;
  readonly freshness: string;
  readonly lastTickTimestamp: string | null;
  readonly lastTickLtp: number | null;
  readonly series: ReadonlyArray<{ readonly x: number; readonly y: readonly [number, number, number, number]; readonly volume: number | null }>;
  readonly currentCandle: {
    readonly bucketMs: number;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume: number | null;
    readonly tickCount: number;
  } | null;
  readonly completedCount: number;
  readonly historicalCandleCount: number;
  readonly error: string | null;
}

export const getLiveCandles = createServerFn({ method: "GET" })
  .validator((data: { symbol: string; intervalMs?: number }) => data)
  .handler(async ({ data }): Promise<LiveCandleResponse> => {
    const symbol = data.symbol;
    const intervalMs = data.intervalMs ?? 60_000;

    // Validate symbol
    if (!isValidSymbol(symbol)) {
      return errorResponse(symbol, `Unsupported symbol: ${symbol}`);
    }

    // Validate interval
    if (!isValidInterval(intervalMs)) {
      return errorResponse(symbol, `Unsupported interval: ${intervalMs}`);
    }

    const { getLiveMarketStream } = await import("./live-market-stream.server");
    const stream = getLiveMarketStream();
    stream.start();

    // Subscribe to live WebSocket stream
    stream.subscribe(symbol, intervalMs);

    // Fetch historical candles via existing INDstocks REST adapter
    let historical: readonly { readonly time: string; readonly open: number; readonly high: number; readonly low: number; readonly close: number; readonly volume: number | null }[] = [];
    try {
      const { buildIndstocksProviderAdapter } = await import("./provider-foundation/indstocks/indstocks-historical.adapter.server");
      const adapter = buildIndstocksProviderAdapter();
      if (adapter.fetchHistorical) {
        const tf = intervalToTimeframe(intervalMs);
        const limit = intervalToLimit(intervalMs);
        const nowIso = new Date().toISOString();
        const result = await adapter.fetchHistorical(symbol, tf, limit, nowIso);
        if (result.ok) {
          historical = result.data.candles;
        }
        // If fetch fails, continue with empty historical — live data still works
      }
    } catch {
      // Historical fetch failed — continue with live-only data
    }

    const snap = stream.getSnapshot(symbol, intervalMs);
    const series = stream.getCandleSeries(symbol, intervalMs, historical);

    return {
      instrument: snap.instrument,
      connectionState: snap.connectionState,
      subscriptionActive: snap.subscriptionActive,
      provider: snap.telemetry.providerId,
      providerStatus: snap.telemetry.status,
      freshness: snap.telemetry.status === "LIVE" ? "LIVE" : snap.telemetry.status === "STALE" ? "STALE" : snap.telemetry.status === "DELAYED" ? "DELAYED" : "NO_DATA",
      lastTickTimestamp: snap.lastTick?.timestamp ?? null,
      lastTickLtp: snap.lastTick?.ltp ?? null,
      series,
      currentCandle: snap.currentCandle ? {
        bucketMs: snap.currentCandle.bucketMs,
        open: snap.currentCandle.open,
        high: snap.currentCandle.high,
        low: snap.currentCandle.low,
        close: snap.currentCandle.close,
        volume: snap.currentCandle.volume,
        tickCount: snap.currentCandle.tickCount,
      } : null,
      completedCount: snap.completedCandleCount,
      historicalCandleCount: historical.length,
      error: null,
    };
  });

function errorResponse(symbol: string, message: string): LiveCandleResponse {
  return {
    instrument: symbol,
    connectionState: "DISCONNECTED",
    subscriptionActive: false,
    provider: "NONE",
    providerStatus: "OFFLINE",
    freshness: "NO_DATA",
    lastTickTimestamp: null,
    lastTickLtp: null,
    series: [],
    currentCandle: null,
    completedCount: 0,
    historicalCandleCount: 0,
    error: message,
  };
}

function intervalToTimeframe(intervalMs: AggregationIntervalMs): import("./provider-foundation/types").Timeframe {
  switch (intervalMs) {
    case 60_000: return "1m";
    case 180_000: return "3m";
    case 300_000: return "5m";
    case 900_000: return "15m";
    case 3_600_000: return "1h";
    case 86_400_000: return "1d";
  }
}

function intervalToLimit(intervalMs: AggregationIntervalMs): number {
  // Fetch enough candles for a reasonable chart bootstrap
  switch (intervalMs) {
    case 60_000: return 375; // 1 trading day of 1m candles
    case 180_000: return 125; // 1 day of 3m
    case 300_000: return 75;  // 1 day of 5m
    case 900_000: return 25;  // 1 day of 15m
    case 3_600_000: return 6;  // 1 day of 1h
    case 86_400_000: return 30; // 30 days of 1d
  }
}
