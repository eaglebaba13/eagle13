// Server function for live market candle data.
// Exposes candle aggregation state to client components.
// Token never exposed — only normalized candle data and telemetry returned.

import { createServerFn } from "@tanstack/react-start";
import type { QuoteSymbol } from "./provider-foundation/types";

export interface LiveCandleResponse {
  readonly instrument: string;
  readonly connectionState: string;
  readonly subscriptionActive: boolean;
  readonly provider: string;
  readonly providerStatus: string;
  readonly freshness: string;
  readonly lastTickTimestamp: string | null;
  readonly lastTickLtp: number | null;
  readonly series: ReadonlyArray<{ readonly x: number; readonly y: readonly [number, number, number, number] }>;
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
}

export const getLiveCandles = createServerFn({ method: "GET" })
  .validator((data: { symbol: string; intervalMs?: number }) => data)
  .handler(async ({ data }): Promise<LiveCandleResponse> => {
    const { getLiveMarketStream } = await import("./live-market-stream.server");
    const stream = getLiveMarketStream();
    stream.start();

    const symbol = data.symbol as QuoteSymbol;
    const intervalMs = (data.intervalMs ?? 60_000) as 60_000 | 180_000 | 300_000 | 900_000 | 3_600_000 | 86_400_000;

    // Subscribe if not already
    stream.subscribe(symbol, intervalMs);

    const snap = stream.getSnapshot(symbol, intervalMs);
    const series = stream.getCandleSeries(symbol, intervalMs);

    return {
      instrument: snap.instrument,
      connectionState: snap.connectionState,
      subscriptionActive: snap.subscriptionActive,
      provider: snap.telemetry.providerId,
      providerStatus: snap.telemetry.status,
      freshness: snap.telemetry.status === "LIVE" ? "LIVE" : snap.telemetry.status === "STALE" ? "STALE" : "NO_DATA",
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
    };
  });
