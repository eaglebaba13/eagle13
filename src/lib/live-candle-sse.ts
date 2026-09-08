// Server-Sent Events endpoint for live candle streaming.
// Tick-driven: subscribes to LiveMarketStreamManager candle events.
// NO polling. NO setInterval for data. Token never exposed.

import type { QuoteSymbol } from "./provider-foundation/types";
import { INDSTOCKS_SUPPORTED_SYMBOLS } from "./provider-foundation/indstocks/indstocks-instruments.server";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";
import type { LiveCandleEvent } from "./live-market-stream.server";

const VALID_SYMBOLS: ReadonlySet<string> = new Set(INDSTOCKS_SUPPORTED_SYMBOLS);

function writeSSE(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

function writeSSEComment(comment: string): Uint8Array {
  return new TextEncoder().encode(`: ${comment}\n\n`);
}

/**
 * Create an SSE streaming response for live candle data.
 * Tick-driven: subscribes to LiveMarketStreamManager candle events.
 * NO polling. NO setInterval for data. Token never exposed.
 */
export function createLiveCandleSSE(symbol: string, intervalMs: number): Response {
  if (!VALID_SYMBOLS.has(symbol)) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: `Unsupported symbol: ${symbol}` })}\n\n`,
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  }

  let closed = false;
  let unsubCandle: (() => void) | null = null;
  let keepaliveId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const { getLiveMarketStream } = await import("./live-market-stream.server");
      const mgr = getLiveMarketStream();
      mgr.start();
      mgr.subscribe(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);

      // Send initial status
      const snap = mgr.getSnapshot(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);
      controller.enqueue(
        writeSSE(
          JSON.stringify({
            type: "status",
            symbol,
            connectionState: snap.connectionState,
            provider: snap.telemetry.providerId,
            freshness:
              snap.telemetry.status === "LIVE"
                ? "LIVE"
                : snap.telemetry.status === "STALE"
                  ? "STALE"
                  : "NO_DATA",
            lastTick: snap.lastTick?.timestamp ?? null,
            lastLtp: snap.lastTick?.ltp ?? null,
            currentCandle: snap.currentCandle
              ? {
                  open: snap.currentCandle.open,
                  high: snap.currentCandle.high,
                  low: snap.currentCandle.low,
                  close: snap.currentCandle.close,
                  volume: snap.currentCandle.volume,
                  tickCount: snap.currentCandle.tickCount,
                }
              : null,
            completedCount: snap.completedCandleCount,
          }),
        ),
      );

      // Send current candle snapshot if it exists
      if (snap.currentCandle) {
        controller.enqueue(
          writeSSE(
            JSON.stringify({
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
              freshness:
                snap.telemetry.status === "LIVE"
                  ? "LIVE"
                  : snap.telemetry.status === "STALE"
                    ? "STALE"
                    : "NO_DATA",
              timestamp: new Date().toISOString(),
            }),
          ),
        );
      }

      // Subscribe to tick-driven candle events — NO POLLING
      unsubCandle = mgr.onCandleUpdate(
        symbol as QuoteSymbol,
        intervalMs as AggregationIntervalMs,
        (event: LiveCandleEvent) => {
          if (closed) return;
          try {
            controller.enqueue(writeSSE(JSON.stringify(event)));
          } catch {
            closed = true;
          }
        },
      );

      // Keepalive comment every 30s to prevent proxy timeout
      // SSE comment frames (: text) are NOT data events
      keepaliveId = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(writeSSEComment("keepalive"));
          } catch {
            closed = true;
          }
        }
      }, 30_000);
    },
    cancel() {
      closed = true;
      unsubCandle?.();
      unsubCandle = null;
      if (keepaliveId) {
        clearInterval(keepaliveId);
        keepaliveId = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}