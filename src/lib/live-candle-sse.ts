import { getLiveMarketStream, type LiveMarketStreamManager } from "./live-market-stream.server";
import {
  validSelection,
  tickFreshness,
  type LiveCandleSseEvent,
  type LiveStatusEvent,
} from "./live-candle-contract";
import type { QuoteSymbol } from "./provider-foundation/types";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";

// Status ticks update age/freshness only; market data remains provider-driven.
export function createLiveCandleSSE(
  symbol: string,
  intervalMs: number,
  signal?: AbortSignal,
  mgr: LiveMarketStreamManager = getLiveMarketStream(),
): Response {
  if (!validSelection(symbol, intervalMs))
    return Response.json({ error: "UNVERIFIED_SYMBOL_OR_INTERVAL" }, { status: 400 });
  let closed = false;
  let subscribed = false;
  let removeListener: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let closeController: (() => void) | undefined;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    removeListener?.();
    if (subscribed) mgr.unsubscribe(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);
    signal?.removeEventListener("abort", cleanup);
    closeController?.();
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      closeController = () => {
        try {
          controller.close();
        } catch {
          /* Already cancelled. */
        }
      };
      const send = (event: LiveCandleSseEvent) => {
        if (closed) return;
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };
      if (signal?.aborted) {
        cleanup();
        return;
      }
      signal?.addEventListener("abort", cleanup, { once: true });
      mgr.start();
      subscribed = mgr.subscribe(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);
      const status = (): LiveStatusEvent => {
        const snap = mgr.getSnapshot(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);
        const c = snap.currentCandle;
        return {
          type: "status",
          symbol,
          intervalMs,
          provider: snap.telemetry.providerId,
          connectionState: snap.connectionState,
          freshness:
            snap.connectionState === "FAILED"
              ? "UNAVAILABLE"
              : snap.lastTick
                ? snap.connectionState === "CONNECTED"
                  ? tickFreshness(snap.lastTick.timestamp)
                  : "STALE"
                : "NO_DATA",
          quality: snap.lastTick?.quality ?? "UNKNOWN",
          lastTick: snap.lastTick?.timestamp ?? null,
          lastLtp: snap.lastTick?.ltp ?? null,
          completedCount: snap.completedCandleCount,
          error: snap.telemetry.staleReason,
          currentCandle: c
            ? {
                time: c.bucketMs,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume,
              }
            : null,
        };
      };
      if (!subscribed) {
        send({ type: "error", symbol, intervalMs, message: "UNAVAILABLE" });
        cleanup();
        return;
      }
      removeListener = mgr.onCandleUpdate(
        symbol as QuoteSymbol,
        intervalMs as AggregationIntervalMs,
        send,
      );
      send(status());
      timer = setInterval(() => send(status()), 5000);
    },
    cancel: cleanup,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
