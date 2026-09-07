// Browser-side SSE client for live candle streaming.
// Uses native EventSource for server-pushed updates.
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

export interface LiveSSEState {
  readonly connected: boolean;
  readonly status: LiveSSEStatus | null;
  readonly currentCandle: LiveSSECandle | null;
  readonly completedCandles: readonly LiveSSECandle[];
  readonly error: string | null;
}

const INITIAL_STATE: LiveSSEState = {
  connected: false,
  status: null,
  currentCandle: null,
  completedCandles: [],
  error: null,
};

/**
 * Hook that connects to the SSE endpoint and maintains live candle state.
 * Returns current state and reconnection function.
 */
export function useLiveCandleSSE(symbol: string, intervalMs: number = 60_000) {
  const [state, setState] = useState<LiveSSEState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

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
              if (data.completed) {
                return {
                  ...s,
                  completedCandles: [...s.completedCandles, data],
                  currentCandle: null,
                };
              }
              return { ...s, currentCandle: data };
            });
            break;
          case "error":
            setState((s) => ({ ...s, error: data.message }));
            break;
        }
      } catch {
        // Malformed message — ignore
      }
    };

    es.onerror = () => {
      setState((s) => ({ ...s, connected: false }));
      es.close();
      esRef.current = null;
      // Auto-reconnect after3s
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
  }, [symbol, intervalMs]);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  return { state, reconnect: connect };
}
