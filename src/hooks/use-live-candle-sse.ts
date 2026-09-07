// Browser-side SSE client for live candle streaming.
// Uses native EventSource for server-pushed updates.
// Bounded memory — explicit max completed candles.
// No polling. No token exposure.

import { useEffect, useRef, useState, useCallback } from "react";

export interface LiveSSECandle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
    readonly low: number;
  readonly close: number;
  readonly volume: number | null;
  readonly completed: boolean;
  readonly provider: string;
  readonly freshness: string;
  readonly timestamp: string;
  readonly lastLtp: number | null;
  readonly lastTick: string | null;
  readonly connectionState: string;
  readonly tickCount: number | null;
}

export interface LiveSSEStatus {
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

const MAX_LIVE_COMPLETED_CANDLES = 2000;

export interface LiveSSEState {
  readonly connected: boolean;
  readonly status: LiveSSEStatus | null;
  readonly currentCandle: LiveSSECandle | null;
  readonly completedCandles: Map<number, LiveSSECandle>; // keyed by time — bounded
  readonly error: string | null;
}

/**
 * Bounded Map insert — evicts oldest entries when MAX_LIVE_COMPLETED_CANDLES exceeded.
 */
function boundedInsert(map: Map<number, LiveSSECandle>, key: number, value: LiveSSECandle): Map<number, LiveSSECandle> {
  const newMap = new Map(map);
  newMap.set(key, value);
  if (newMap.size > MAX_LIVE_COMPLETED_CANDLES) {
    // Remove oldest entries (smallest timestamps)
    const sorted = [...newMap.keys()].sort((a, b) => a - b);
    const toRemove = sorted.slice(0, newMap.size - MAX_LIVE_COMPLETED_CANDLES);
    for (const k of toRemove) {
      newMap.delete(k);
    }
  }
  return newMap;
}

/**
 * Hook that connects to SSE and maintains live candle state.
 * Uses bounded Map for completed candles (no unbounded array).
 * Current candle is replaced in-place for same timestamp.
 */
export function useLiveCandleSSE(symbol: string, intervalMs: number = 60_000) {
  const [state, setState] = useState<LiveSSEState>({
    connected: false,
    status: null,
    currentCandle: null,
    completedCandles: new Map(),
    error: null,
  });
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }

    setState((s) => ({ ...s, connected: false, error: null }));

    const url = `/api/live-candles?symbol=${encodeURIComponent(symbol)}&intervalMs=${intervalMs}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setState((s) => ({ ...s, connected: true }));
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "status":
            setState((s) => ({
              ...s,
              status: {
                connectionState: data.connectionState,
                provider: data.provider,
                freshness: data.freshness,
                lastTick: data.lastTick,
                lastLtp: data.lastLtp,
                currentCandle: data.currentCandle,
                completedCount: data.completedCount,
              },
            }));
            break;
          case "candle_update":
            setState((s) => {
              // Update live status from every event (Bug 3 fix)
              const updatedStatus: LiveSSEStatus = {
                connectionState: data.connectionState ?? s.status?.connectionState ?? "UNKNOWN",
                provider: data.provider ?? s.status?.provider ?? "INDSTOCKS_V1_WS",
                freshness: data.freshness ?? s.status?.freshness ?? "NO_DATA",
                lastTick: data.lastTick ?? s.status?.lastTick ?? null,
                lastLtp: data.lastLtp ?? s.status?.lastLtp ?? null,
                currentCandle: s.status?.currentCandle ?? null,
                completedCount: s.status?.completedCount ?? 0,
              };

              if (data.completed) {
                // Completed candle — add to bounded Map (deduplicates by time)
                const newMap = boundedInsert(s.completedCandles, data.candle.time, data);
                return {
                  ...s,
                  status: { ...updatedStatus, completedCount: newMap.size },
                  completedCandles: newMap,
                  // Do NOT clear currentCandle here — the new current candle event
                  // will arrive immediately after (Bug 1 fix: completed first, then current)
                };
              }
              // Current candle — replace in-place (same timestamp = update, not duplicate)
              return {
                ...s,
                status: { ...updatedStatus, currentCandle: data.candle },
                currentCandle: data,
              };
            });
            break;
          case "error":
            setState((s) => ({ ...s, error: data.message }));
            break;
        }
      } catch { /* malformed — ignore */ }
    };

    es.onerror = () => {
      setState((s) => ({ ...s, connected: false }));
      es.close();
      esRef.current = null;
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
  }, [symbol, intervalMs]);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    };
  }, [connect]);

  return { state, reconnect: connect };
}
