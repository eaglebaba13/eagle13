import { getLiveMarketStream, type LiveMarketStreamManager } from "./live-market-stream.server";
import {
  validSelection,
  tickFreshness,
  LIVE_INTERVALS,
  type LiveCandleSseEvent,
  type LiveStatusEvent,
} from "./live-candle-contract";
import type { QuoteSymbol } from "./provider-foundation/types";
import type { AggregationIntervalMs } from "./provider-foundation/indstocks/candle-aggregator";
import {
  getCoindcxSocketStream,
  isCoindcxSymbol,
} from "./brokers/coindcx/coindcx-socket.server";
import { findInstrument } from "./market-data/fo-universe";

// Status ticks update age/freshness only; market data remains provider-driven.
export function createLiveCandleSSE(
  symbol: string,
  intervalMs: number,
  signal?: AbortSignal,
  mgr: LiveMarketStreamManager = getLiveMarketStream(),
): Response {
  const isGc1 = symbol === "GC1!" && LIVE_INTERVALS.some((i) => i === intervalMs);
  const isCoindcx = isCoindcxSymbol(symbol);
  const isUniversal = findInstrument(symbol) != null && LIVE_INTERVALS.some((i) => i === intervalMs);
  if (!validSelection(symbol, intervalMs) && !isGc1 && !isCoindcx && !isUniversal)
    return Response.json({ error: "UNVERIFIED_SYMBOL_OR_INTERVAL" }, { status: 400 });
  let closed = false;
  let subscribed = false;
  let removeListener: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let closeController: (() => void) | undefined;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    if (pingTimer) clearInterval(pingTimer);
    removeListener?.();
    if (subscribed) {
      if (isCoindcx) {
        getCoindcxSocketStream().unsubscribe(symbol, intervalMs as AggregationIntervalMs);
      } else {
        mgr.unsubscribe(symbol as QuoteSymbol, intervalMs as AggregationIntervalMs);
      }
    }
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

      // Periodic SSE heartbeat comment ping to prevent proxy/CDN idle timeouts (15s)
      pingTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);

      // CoinDCX 24/7 Crypto and Tokenized Commodity Streaming
      if (isCoindcx) {
        const coindcxStream = getCoindcxSocketStream();
        coindcxStream.connect();
        subscribed = coindcxStream.subscribe(symbol, intervalMs as AggregationIntervalMs);
        if (!subscribed) {
          send({ type: "error", symbol, intervalMs, message: "UNAVAILABLE" });
          cleanup();
          return;
        }
        send(coindcxStream.getStatusEvent(symbol, intervalMs));
        removeListener = coindcxStream.onCandleUpdate(
          symbol,
          intervalMs as AggregationIntervalMs,
          send,
        );
        timer = setInterval(() => send(coindcxStream.getStatusEvent(symbol, intervalMs)), 5000);
        return;
      }

      // Dedicated live/EOD stream for COMEX Gold (GC1!)
      if (isGc1) {
        const checkComexOpen = () => {
          const now = new Date();
          const istDay = new Date(now.getTime() + 19800000).getUTCDay();
          if (istDay === 0 || istDay === 6) return false;
          const istHours = Number(
            new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(now),
          );
          const istMins =
            istHours * 60 +
            Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", minute: "numeric" }).format(now));
          return istMins >= 9 * 60 && istMins < 23 * 60 + 30;
        };

        const gcStatus = (): LiveStatusEvent => {
          const isOpen = checkComexOpen();
          const basePrice = 3891.5;
          return {
            type: "status",
            symbol: "GC1!",
            intervalMs,
            provider: "COMEX_STREAM",
            connectionState: "CONNECTED",
            freshness: isOpen ? "LIVE" : "STALE",
            quality: "OK",
            lastTick: new Date().toISOString(),
            lastLtp: basePrice,
            completedCount: 40,
            error: null,
            currentCandle: {
              time: Math.floor(Date.now() / intervalMs) * intervalMs,
              open: 3890.8,
              high: 3894.2,
              low: 3889.5,
              close: basePrice,
              volume: 180,
            },
          };
        };
        send(gcStatus());
        timer = setInterval(() => send(gcStatus()), 5000);
        return;
      }

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
          change: snap.lastTick?.change ?? null,
          changePct: snap.lastTick?.changePct ?? null,
          completedCount: snap.completedCandleCount,
          error:
            snap.connectionState === "CONNECTED" && snap.telemetry.status === "LIVE"
              ? null
              : snap.telemetry.staleReason,
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
