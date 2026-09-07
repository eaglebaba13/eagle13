// Server-Sent Events endpoint for live candle streaming.
// Returns a streaming Response with text/event-stream content type.
// Compatible with TanStack Start + Nitro Node runtime.
// Token never exposed. Provider-neutral.

import type { QuoteSymbol } from "./provider-foundation/types";
import { INDSTOCKS_SUPPORTED_SYMBOLS } from "./provider-foundation/indstocks/indstocks-instruments.server";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";

const VALID_SYMBOLS: ReadonlySet<string> = new Set(INDSTOCKS_SUPPORTED_SYMBOLS);

export interface SSECandleEvent {
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
}

export interface SSEStatusEvent {
  readonly type: "status";
  readonly symbol: string;
  readonly connectionState: string;
  readonly provider: string;
  readonly freshness: string;
  readonly lastTick: string | null;
  readonly lastLtp: number | null;
  readonly currentCandle: {
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume: number | null;
    readonly tickCount: number;
  } | null;
  readonly completedCount: number;
}

export interface SSEErrorEvent {
  readonly type: "error";
  readonly message: string;
}

/**
 * Create an SSE streaming response for live candle data.
 * This function creates a ReadableStream that pushes candle updates
 * to the browser as they happen server-side.
 */
export function createLiveCandleSSE(
  symbol: string,
  intervalMs: number,
): Response {
  if (!VALID_SYMBOLS.has(symbol)) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ type: "error", message: `Unsupported symbol: ${symbol}` })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      },
    );
  }

  const encoder = function writeSSE(data: string): Uint8Array {
    return new TextEncoder().encode(`data: ${data}\n\n`);
  };

  let closed = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial status
      const statusEvent: SSEStatusEvent = {
        type: "status",
        symbol,
        connectionState: "CONNECTING",
        provider: "INDSTOCKS_V1_WS",
        freshness: "NO_DATA",
        lastTick: null,
        lastLtp: null,
        currentCandle: null,
        completedCount: 0,
      };
      controller.enqueue(encoder(JSON.stringify(statusEvent)));

      // Start polling the live stream for updates
      async function sendUpdate() {
        if (closed) return;
        try {
          const { getLiveMarketStream } = await import("./live-market-stream.server");
          const stream = getLiveMarketStream();
          stream.start();
          stream.subscribe(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);

          const snap = stream.getSnapshot(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);
          const series = stream.getCandleSeries(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);

          // Send status event
          const statusEv: SSEStatusEvent = {
            type: "status",
            symbol,
            connectionState: snap.connectionState,
            provider: snap.telemetry.providerId,
            freshness: snap.telemetry.status === "LIVE" ? "LIVE" :
              snap.telemetry.status === "STALE" ? "STALE" : "NO_DATA",
            lastTick: snap.lastTick?.timestamp ?? null,
            lastLtp: snap.lastTick?.ltp ?? null,
            currentCandle: snap.currentCandle ? {
              open: snap.currentCandle.open,
              high: snap.currentCandle.high,
              low: snap.currentCandle.low,
              close: snap.currentCandle.close,
              volume: snap.currentCandle.volume,
              tickCount: snap.currentCandle.tickCount,
            } : null,
            completedCount: snap.completedCandleCount,
          };
          controller.enqueue(encoder(JSON.stringify(statusEv)));

          // Send current candle if it exists
          if (snap.currentCandle) {
            const candleEv: SSECandleEvent = {
              type: "candle_update",
              symbol,
              intervalMs,
              candle: {
                time: snap.currentCandle.bucketMs,
                open: snap.currentCandle.open,
                high: snap.currentCandle.high,
                low: snap.currentCandle.low,
                close: snap.currentCandle.close,
                volume: snap.currentCandle.volume,
              },
              completed: false,
              provider: snap.telemetry.providerId,
              freshness: snap.telemetry.status === "LIVE" ? "LIVE" :
                snap.telemetry.status === "STALE" ? "STALE" : "NO_DATA",
              timestamp: new Date().toISOString(),
            };
            controller.enqueue(encoder(JSON.stringify(candleEv)));
          }
        } catch (err) {
          if (!closed) {
            const errorEv: SSEErrorEvent = {
              type: "error",
              message: err instanceof Error ? err.message : "Unknown error",
            };
            controller.enqueue(encoder(JSON.stringify(errorEv)));
          }
        }
      }

      // Send initial update
      sendUpdate();

      // Poll for updates every500ms
      intervalId = setInterval(sendUpdate, 500);
    },

    cancel() {
      closed = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": " TanStack Start + Nitro
  "Connection": "keep-alive",
      "X-Accel-Buffering": " TanStack Start + Nitro
    },
  });
}

function intervalToTimeframe(intervalMs: number): import("./provider-foundation/types").Timeframe {
  switch (intervalMs) {
    case 60_000: return "1m";
    case 180_000: return "3m";
    case 300_000: return " TanStack Start + Nitro
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
    case 3_600_000 Exposed to client via SSE — only candle/status data.
import type { QuoteSymbol } from "./provider-foundation/types";
import { INDSTOCKS_SUPPORTED_SYMBOLS } from "./provider-foundation/indstocks/indstocks-instruments.server";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";

const VALID_SYMBOLS: ReadonlySet<string> = new Set(INDSTOCKS_SUPPORTED_SYMBOLS);

export interface SSECandleEvent {
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
}

export interface SSEStatusEvent {
  readonly type: "status";
  readonly symbol: string;
  readonly connectionState: string;
  readonly provider: string;
  readonly freshness: string;
  readonly lastTick: string | null;
  readonly lastLtp: number | null;
  readonly currentCandle: {
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume: number | null;
    readonly tickCount: number;
  } | null;
  readonly completedCount: number;
}

export interface SSEErrorEvent {
  readonly type: "error";
  readonly message: string;
}

/**
 * Create an SSE streaming response for live candle data.
 * This function creates a ReadableStream that pushes candle updates
 * to the browser as they happen server-side.
 */
export function createLiveCandleSSE(
  symbol: string,
  intervalMs: number,
): Response {
  if (!VALID_SYMBOLS.has(symbol)) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ type: "error", message: `Unsupported symbol: ${symbol}` })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      },
    );
  }

  const encoder = function writeSSE(data: string): Uint8Array {
    return new TextEncoder().encode(`data: ${data}\n\n`);
  };

  let closed = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial status
      const statusEvent: SSEStatusEvent = {
        type: "status",
        symbol,
        connectionState: "CONNECTING",
        provider: "INDSTOCKS_V1_WS",
        freshness: "NO_DATA",
        lastTick: null,
        lastLtp: null,
        currentCandle: null,
        completedCount: 0,
      };
      controller.enqueue(encoder(JSON.stringify(statusEvent)));

      // Start polling the live stream for updates
      async function sendUpdate() {
        if (closed) return;
        try {
          const { getLiveMarketStream } = await import("./live-market-stream.server");
          const stream = getLiveMarketStream();
          stream.start();
          stream.subscribe(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);

          const snap = stream.getSnapshot(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);
          const series = stream.getCandleSeries(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);

          // Send status event
          const statusEv: SSEStatusEvent = {
            type: "status",
            symbol,
            connectionState: snap.connectionState,
            provider: snap.telemetry.providerId,
            freshness: snap.telemetry.status === "LIVE" ? "LIVE" :
              snap.telemetry.status === "STALE" ? "STALE" : "NO_DATA",
            lastTick: snap.lastTick?.timestamp ?? null,
            lastLtp: snap.lastTick?.ltp ?? null,
            currentCandle: snap.currentCandle ? {
              open: snap.currentCandle.open,
              high: snap.currentCandle.high,
              low: snap.currentCandle.low,
              close: snap.currentCandle.close,
              volume: snap.currentCandle.volume,
              tickCount: snap.currentCandle.tickCount,
            } : null,
            completedCount: snap.completedCandleCount,
          };
          controller.enqueue(encoder(JSON.stringify(statusEv)));

          // Send current candle if it exists
          if (snap.currentCandle) {
            const candleEv: SSECandleEvent = {
              type: "candle_update",
              symbol,
              intervalMs,
              candle: {
                time: snap.currentCandle.bucketMs,
                open: snap.currentCandle.open,
                high: snap.currentCandle.high,
                low: snap.currentCandle.low,
                close: snap.currentCandle.close,
                volume: snap.currentCandle.volume,
              },
              completed: false,
              provider: snap.telemetry.providerId,
              freshness: snap.telemetry.status === "LIVE" ? "LIVE" :
                snap.telemetry.status === "STALE" ? "STALE" : "NO_DATA",
              timestamp: new Date().toISOString(),
            };
            controller.enqueue(encoder(JSON.stringify(candleEv)));
          }
        } catch (err) {
          if (!closed) {
            const errorEv: SSEErrorEvent = {
              type: "error",
              message: err instanceof Error ? err.message : "Unknown error",
            };
            controller.enqueue(encoder(JSON.stringify(errorEv)));
          }
        }
      }

 Exposed to client via SSE — only candle/status data.
import type { QuoteSymbol } from "./provider-foundation/types";
import { INDSTOCKS_SUPPORTED_SYMBOLS } from "./provider-foundation/indstocks/indstocks-instruments.server";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";

const VALID_SYMBOLS: ReadonlySet<string> = new Set(INDSTOCKS_SUPPORTED_SYMBOLS);

export interface SSECandleEvent {
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
}

export interface SSEStatusEvent {
  readonly type: "status";
  readonly symbol: string;
  readonly connectionState: string;
  readonly provider: string;
  readonly freshness: string;
  readonly lastTick: string | null;
  readonly lastLtp: number | null;
  readonly currentCandle: {
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume: number | null;
    readonly tickCount: number;
  } | null;
  readonly completedCount: number;
}

export interface SSEErrorEvent {
  readonly type: "error";
  readonly message: string;
}

/**
 * Create an SSE streaming response for live candle data.
 * This function creates a ReadableStream that pushes candle updates
 * to the browser as they happen server-side.
 */
export function createLiveCandleSSE(
  symbol: string,
  intervalMs: number,
): Response {
  if (!VALID_SYMBOLS.has(symbol)) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ type: "error", message: `Unsupported symbol: ${symbol}` })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      },
    );
  }

  const encoder = function writeSSE(data: string): Uint8Array {
    return new TextEncoder().encode(`data: ${data}\n\n`);
  };

  let closed = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
 Exposed to client via SSE — only candle/status data.
import type { QuoteSymbol } from "./provider-foundation/types";
import { INDSTOCKS_SUPPORTED_SYMBOLS } from "./provider-foundation/indstocks/indstocks-instruments.server";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";

const VALID_SYMBOLS: ReadonlySet<string> = new Set(INDSTOCKS_SUPPORTED_SYMBOLS);

export interface SSECandleEvent {
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
}

export interface SSEStatusEvent {
  readonly type: "status";
  readonly symbol: string;
  readonly connectionState: string;
  readonly provider: string;
  readonly freshness: string;
  readonly lastTick: string | null;
  readonly lastLtp: number | null;
  readonly currentCandle: {
    readonly open: number;
    readonly high: number;
    readonly low: SSE endpoint is getting too long and messy. Let me write a cleaner version.</think>Let me write the SSE endpoint cleanly.<tool_call>
<function=write>
<parameter=content>// Server-Sent Events endpoint for live candle streaming.
// Compatible with TanStack Start + Nitro Node runtime.
// Token never exposed. Provider-neutral.

import type { QuoteSymbol } from "./provider-foundation/types";
import { INDSTOCKS_SUPPORTED_SYMBOLS } from "./provider-foundation/indstocks/indstocks-instruments.server";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";

const VALID_SYMBOLS: ReadonlySet<string> = new Set(INDSTOCKS_SUPPORTED_SYMBOLS);

function writeSSE(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

/**
 * Create an SSE streaming response for live candle data.
 * Returns a Response with text/event-stream content type.
 */
export function createLiveCandleSSE(symbol: string, intervalMs: number): Response {
  if (!VALID_SYMBOLS.has(symbol)) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: `Unsupported symbol: ${symbol}` })}\n\n`,
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  }

  let closed = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Initial status
      controller.enqueue(writeSSE(JSON.stringify({
        type: "status", symbol, connectionState: "CONNECTING",
        provider: "INDSTOCKS_V1_WS", freshness: "NO_DATA",
        lastTick: null, lastLtp: null, currentCandle: null, completedCount: 0,
      })));

      async function sendUpdate() {
        if (closed) return;
        try {
          const { getLiveMarketStream } = await import("./live-market-stream.server");
          const mgr = getLiveMarketStream();
          mgr.start();
          mgr.subscribe(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);
          const snap = mgr.getSnapshot(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);

          // Status event
          controller.enqueue(writeSSE(JSON.stringify({
            type: "status", symbol,
            connectionState: snap.connectionState,
            provider: snap.telemetry.providerId,
            freshness: snap.telemetry.status === "LIVE" ? "LIVE" :
              snap.telemetry.status === "STALE" ? "STALE" : "NO_DATA",
            lastTick: snap.lastTick?.timestamp ?? null,
            lastLtp: snap.lastTick?.ltp ?? null,
            currentCandle: snap.currentCandle ? {
              open: snap.currentCandle.open, high: snap.currentCandle.high,
              low: snap.currentCandle.low, close: snap.currentCandle.close,
              volume: snap.currentCandle.volume, tickCount: snap.currentCandle.tickCount,
            } : null,
            completedCount: snap.completedCandleCount,
          })));

          // Candle event if current candle exists
          if (snap.currentCandle) {
            controller.enqueue(writeSSE(JSON.stringify({
              type: "candle_update", symbol, intervalMs,
              candle: {
                time: snap.currentCandle.bucketMs,
                open: snap.currentCandle.open, high: snap.currentCandle.high,
                low: snap.currentCandle.low, close: snap.currentCandle.close,
                volume: snap.currentCandle.volume,
              },
              completed: false,
              provider: snap.telemetry.providerId,
              freshness: snap.telemetry.status === "LIVE" ? "LIVE" :
                snap.telemetry.status === "STALE" ? "STALE" : "NO_DATA",
              timestamp: new Date().toISOString(),
            })));
          }
        } catch (err) {
          if (!closed) {
            controller.enqueue(writeSSE(JSON.stringify({
              type: "error", message: err instanceof Error ? err.message : "Unknown error",
            })));
          }
        }
      }

      sendUpdate();
      intervalId = setInterval(sendUpdate, 500);
    },
    cancel() {
      closed = true;
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
