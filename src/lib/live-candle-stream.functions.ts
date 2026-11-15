// Server-Sent Events endpoint for live candle streaming.
// Replaces 2s polling with real-time push from server to browser.
// Token never exposed. Provider-neutral.

import { createServerFn } from "@tanstack/react-start";
import type { QuoteSymbol } from "./provider-foundation/types";
import { validSelection } from "./live-candle-contract";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";
import { SUPPORTED_INTERVALS } from "./provider-foundation/indstocks/candle-aggregator";

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

    const { isCoindcxSymbol } = await import("./brokers/coindcx/coindcx-socket.server");

    if (isCoindcxSymbol(symbol)) {
      const { fetchCoindcxHistoricalCandles } = await import(
        "./brokers/coindcx/coindcx-historical.server"
      );
      const { getCoindcxSocketStream } = await import(
        "./brokers/coindcx/coindcx-socket.server"
      );
      const series = await fetchCoindcxHistoricalCandles({ symbol, intervalMs });
      const coindcxStream = getCoindcxSocketStream();
      const statusEvent = coindcxStream.getStatusEvent(symbol, intervalMs);

      return {
        error: null,
        series,
        status: {
          symbol,
          connectionState: statusEvent.connectionState,
          provider: "COINDCX",
          freshness: statusEvent.freshness,
          lastTick: statusEvent.lastTick,
          lastLtp:
            statusEvent.lastLtp ?? (series.length > 0 ? series[series.length - 1].y[3] : null),
          currentCandle: statusEvent.currentCandle,
          completedCount: series.length,
          historicalCount: series.length,
        },
      };
    }

    const { getDeepMultiTimeframeCandles } = await import(
      "./provider-foundation/upstox/upstox-historical-deep.server"
    );

    const deepData = await getDeepMultiTimeframeCandles(symbol, intervalMs);
    let series: import("./provider-foundation/indstocks/candle-aggregator").MergedCandlePoint[] =
      deepData.candles.map((c) => ({
        x: c.x,
        y: c.y,
        volume: c.volume ?? null,
      }));

    let lastLtp =
      deepData.spotPrice ?? (series.length > 0 ? series[series.length - 1].y[3] : null);
    let lastTick = series.length > 0 ? new Date(series[series.length - 1].x).toISOString() : null;
    let connectionState = "CONNECTED";
    let provider = deepData.provider;
    let freshness: "LIVE" | "STALE" | "NO_DATA" = series.length > 0 ? "LIVE" : "NO_DATA";
    let currentCandle: import("./provider-foundation/indstocks/candle-aggregator").LiveCandle | null =
      null;

    try {
      const { getLiveMarketStream } = await import("./live-market-stream.server");
      const stream = getLiveMarketStream();
      const snap = stream.getSnapshot(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);

      if (snap.lastTick?.ltp) {
        lastLtp = snap.lastTick.ltp;
        lastTick = snap.lastTick.timestamp;
      }
      if (snap.connectionState === "CONNECTED") {
        connectionState = "CONNECTED";
      }
      if (snap.currentCandle) {
        currentCandle = snap.currentCandle;
      }
      if (snap.telemetry?.providerId) {
        provider = snap.telemetry.providerId;
      }
    } catch {
      // Live stream snapshot optional
    }

    return {
      error: null,
      series,
      status: {
        symbol,
        connectionState,
        provider,
        freshness,
        lastTick,
        lastLtp,
        currentCandle,
        completedCount: series.length,
        historicalCount: series.length,
      },
    };
  });

function intervalToTimeframe(intervalMs: number): import("./provider-foundation/types").Timeframe {
  switch (intervalMs) {
    case 60_000:
      return "1m";
    case 180_000:
      return "3m";
    case 300_000:
      return "5m";
    case 900_000:
      return "15m";
    case 3_600_000:
      return "1h";
    case 86_400_000:
      return "1d";
    default:
      return "1m";
  }
}

function intervalToLimit(intervalMs: number): number {
  switch (intervalMs) {
    case 60_000:
      return 375;
    case 180_000:
      return 125;
    case 300_000:
      return 75;
    case 900_000:
      return 25;
    case 3_600_000:
      return 6;
    case 86_400_000:
      return 30;
    default:
      return 375;
  }
}
