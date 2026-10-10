import { useEffect, useState, useCallback } from "react";
import {
  parseLiveEvent,
  type LiveCandleEvent,
  type LiveStatusEvent,
  type LiveCandleSseEvent,
} from "@/lib/live-candle-contract";

export type LiveSSECandle = LiveCandleEvent["candle"] & Omit<LiveCandleEvent, "candle" | "type">;
export type LiveSSEStatus = Omit<LiveStatusEvent, "type" | "symbol" | "intervalMs">;
export interface LiveSSEState {
  readonly connected: boolean;
  readonly status: LiveSSEStatus | null;
  readonly currentCandle: LiveSSECandle | null;
  readonly completedCandles: Map<number, LiveSSECandle>;
  readonly error: string | null;
}
export function emptyLiveState(): LiveSSEState {
  return {
    connected: false,
    status: null,
    currentCandle: null,
    completedCandles: new Map(),
    error: null,
  };
}
export function applyLiveEvent(state: LiveSSEState, event: LiveCandleSseEvent): LiveSSEState {
  if (event.type === "error") return { ...state, error: event.message };
  if (event.type === "status") {
    const c = event.currentCandle;
    return {
      ...state,
      status: event,
      error: event.error,
      currentCandle:
        c && event.lastTick
          ? {
              ...c,
              symbol: event.symbol,
              intervalMs: event.intervalMs,
              provider: event.provider,
              freshness: event.freshness,
              quality: event.quality,
              lastTick: event.lastTick,
              lastLtp: event.lastLtp,
              connectionState: event.connectionState,
              completed: false,
              timestamp: event.lastTick,
              tickCount: null,
            }
          : state.currentCandle,
    };
  }
  const { candle, ...metadata } = event;
  const normalized: LiveSSECandle = { ...metadata, ...candle };
  if (state.currentCandle && candle.time < state.currentCandle.time && !event.completed)
    return state;
  const completed = new Map(state.completedCandles);
  if (event.completed) {
    completed.set(candle.time, normalized);
    while (completed.size > 2000) completed.delete(Math.min(...completed.keys()));
  }
  return {
    ...state,
    completedCandles: completed,
    currentCandle: event.completed ? state.currentCandle : normalized,
    status: { ...metadata, currentCandle: candle, completedCount: completed.size, error: null },
    error: null,
  };
}
export function useLiveCandleSSE(symbol: string, intervalMs = 60000) {
  const key = `${symbol}:${intervalMs}`;
  const [stored, setStored] = useState({ key, state: emptyLiveState() });
  const [retry, setRetry] = useState(0);
  const reconnect = useCallback(() => setRetry((n) => n + 1), []);
  useEffect(() => {
    let disposed = false;
    let attempts = 0;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (fn: (state: LiveSSEState) => LiveSSEState) => {
      if (!disposed)
        setStored((s) => ({ key, state: fn(s.key === key ? s.state : emptyLiveState()) }));
    };
    setStored({ key, state: emptyLiveState() });
    const connect = () => {
      if (disposed) return;
      const source = new EventSource(
        `/api/live-candles?symbol=${encodeURIComponent(symbol)}&intervalMs=${intervalMs}`,
      );
      es = source;
      source.onopen = () => {
        if (!disposed && es === source) update((s) => ({ ...s, connected: true }));
      };
      source.onmessage = (message) => {
        if (disposed || es !== source) return;
        try {
          const parsed: unknown = JSON.parse(message.data);
          const event = parseLiveEvent(parsed, symbol, intervalMs);
          if (event) update((s) => applyLiveEvent(s, event));
        } catch {
          /* Invalid wire payload rejected. */
        }
      };
      source.onerror = () => {
        source.close();
        if (disposed || es !== source) return;
        es = null;
        update((s) => ({
          ...s,
          connected: false,
          error: attempts >= 5 ? "UNAVAILABLE" : "RECONNECTING",
        }));
        if (attempts < 5) timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 30000));
      };
    };
    connect();
    return () => {
      disposed = true;
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [symbol, intervalMs, key, retry]);
  return { state: stored.key === key ? stored.state : emptyLiveState(), reconnect };
}
