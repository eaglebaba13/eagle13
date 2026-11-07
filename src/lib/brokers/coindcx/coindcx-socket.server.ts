// Phase 3F / Priority 4 — CoinDCX Real-Time WebSocket Streaming Client.
// Socket.IO v2 / Engine.IO v3 protocol over WebSocket.
// Real-time market streaming for 24/7 crypto pairs and tokenized commodities.
//
// HARD SECURITY INVARIANT:
// Market-data ONLY. No trading or execution endpoints.
// Credentials securely read from process.env; NEVER exposed in client bundles.

import WebSocket from "ws";
import {
  assertExecutionGuardIntact,
  COINDCX_TRADING_ENABLED,
} from "../../providers/coindcx/execution-guard";
import type { MarketTick } from "../../provider-foundation/indstocks/indstocks-ws-types";
import {
  aggregateTick,
  createAggregatorState,
  type CandleAggregatorState,
  type AggregationIntervalMs,
} from "../../provider-foundation/indstocks/candle-aggregator";
import type {
  LiveCandleSseEvent,
  LiveCandleEvent,
  LiveStatusEvent,
} from "../../live-candle-contract";
import type { ProviderTelemetry } from "../../provider-foundation/types";

export const COINDCX_STREAM_URL = "wss://stream.coindcx.com/socket.io/?EIO=3&transport=websocket";

export interface CoindcxPairMeta {
  readonly canonicalSymbol: string;
  readonly pairName: string;
  readonly channelName: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly defaultPrice: number;
}

export const COINDCX_PAIRS: Readonly<Record<string, CoindcxPairMeta>> = {
  BTCUSDT: {
    canonicalSymbol: "BTCUSDT",
    pairName: "B-BTC_USDT",
    channelName: "B-BTC_USDT@trades",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    defaultPrice: 76000,
  },
  BTCINR: {
    canonicalSymbol: "BTCINR",
    pairName: "I-BTC_INR",
    channelName: "I-BTC_INR@trades",
    baseAsset: "BTC",
    quoteAsset: "INR",
    defaultPrice: 7570000,
  },
  ETHINR: {
    canonicalSymbol: "ETHINR",
    pairName: "I-ETH_INR",
    channelName: "I-ETH_INR@trades",
    baseAsset: "ETH",
    quoteAsset: "INR",
    defaultPrice: 224000,
  },
  ETHUSDT: {
    canonicalSymbol: "ETHUSDT",
    pairName: "B-ETH_USDT",
    channelName: "B-ETH_USDT@trades",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    defaultPrice: 2250,
  },
  ETCUSDT: {
    canonicalSymbol: "ETCUSDT",
    pairName: "B-ETC_USDT",
    channelName: "B-ETC_USDT@trades",
    baseAsset: "ETC",
    quoteAsset: "USDT",
    defaultPrice: 6.95,
  },
  XAUUSDT: {
    canonicalSymbol: "XAUUSDT",
    pairName: "B-PAXG_USDT",
    channelName: "B-PAXG_USDT@trades",
    baseAsset: "PAXG",
    quoteAsset: "USDT",
    defaultPrice: 2740,
  },
  XAGUSDT: {
    canonicalSymbol: "XAGUSDT",
    pairName: "B-KAG_USDT",
    channelName: "B-KAG_USDT@trades",
    baseAsset: "KAG",
    quoteAsset: "USDT",
    defaultPrice: 31.8,
  },
} as const;

export function resolveCoindcxPair(symbol: string): CoindcxPairMeta | null {
  const clean = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean in COINDCX_PAIRS) {
    return COINDCX_PAIRS[clean];
  }
  // Alternate checks: e.g. "BBTCUSDT" -> "BTCUSDT"
  for (const pair of Object.values(COINDCX_PAIRS)) {
    if (
      pair.pairName.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === clean ||
      pair.channelName.replace(/[^A-Za-z0-9]/g, "").toUpperCase().startsWith(clean)
    ) {
      return pair;
    }
  }
  return null;
}

export function isCoindcxSymbol(symbol: string): boolean {
  return resolveCoindcxPair(symbol) !== null;
}

export type CoindcxConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "FAILED";

export interface CoindcxStreamSnapshot {
  readonly instrument: string;
  readonly connectionState: CoindcxConnectionState;
  readonly lastTick: MarketTick | null;
  readonly currentCandle: import("../../provider-foundation/indstocks/candle-aggregator").LiveCandle | null;
  readonly completedCandleCount: number;
  readonly telemetry: ProviderTelemetry;
  readonly subscriptionActive: boolean;
}

export class CoindcxSocketStream {
  private ws: WebSocket | null = null;
  private state: CoindcxConnectionState = "DISCONNECTED";
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isNamespaceConnected = false;

  private readonly subscribedSymbols = new Set<string>();
  private readonly aggregators = new Map<string, CandleAggregatorState>();
  private readonly lastTicks = new Map<string, MarketTick | null>();
  private readonly listeners = new Map<string, Set<(event: LiveCandleSseEvent) => void>>();
  private readonly symbolRefs = new Map<string, number>();

  // API credentials safely read from env — market data does not leak them
  private readonly apiKey: string | null = null;
  private readonly apiSecret: string | null = null;

  constructor() {
    assertExecutionGuardIntact(COINDCX_TRADING_ENABLED);
    this.apiKey = process.env.COINDCX_API_KEY || null;
    this.apiSecret = process.env.COINDCX_API_SECRET || null;
  }

  getState(): CoindcxConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.ws && (this.state === "CONNECTED" || this.state === "CONNECTING")) {
      return;
    }
    this.cleanupSocket();
    this.state = "CONNECTING";
    this.isConnecting = true;
    this.isNamespaceConnected = false;

    try {
      const socket = new WebSocket(COINDCX_STREAM_URL, {
        handshakeTimeout: 10000,
        headers: this.apiKey
          ? {
              "X-AUTH-APIKEY": this.apiKey,
            }
          : undefined,
      });

      this.ws = socket;

      socket.on("open", () => {
        this.reconnectAttempt = 0;
      });

      socket.on("message", (data: WebSocket.Data) => {
        const text = data.toString();
        this.handleMessage(text);
      });

      socket.on("error", (err: Error) => {
        this.handleCloseOrError(err.message);
      });

      socket.on("close", (code: number, reason: Buffer) => {
        this.handleCloseOrError(`Closed (${code}): ${reason.toString()}`);
      });
    } catch (err) {
      this.handleCloseOrError(err instanceof Error ? err.message : "Connect failed");
    }
  }

  private handleMessage(message: string): void {
    // Engine.IO open handshake: 0{"sid":"..."}
    if (message.startsWith("0")) {
      // Connect to Socket.IO default namespace
      this.sendRaw("40");
      return;
    }

    // Engine.IO ping/pong
    if (message === "2") {
      // Server ping -> reply client pong
      this.sendRaw("3");
      return;
    }
    if (message === "3") {
      // Server pong received
      return;
    }

    // Socket.IO namespace connection acknowledgment: 40
    if (message === "40") {
      this.state = "CONNECTED";
      this.isConnecting = false;
      this.isNamespaceConnected = true;
      this.startHeartbeat();

      // Re-subscribe to all active symbol channels
      for (const symbol of this.subscribedSymbols) {
        const pair = resolveCoindcxPair(symbol);
        if (pair) {
          this.joinChannel(pair.channelName);
        }
      }
      return;
    }

    // Socket.IO event: 42[...]
    if (message.startsWith("42")) {
      this.handleSocketIoPacket(message.slice(2));
    }
  }

  private handleSocketIoPacket(payloadStr: string): void {
    try {
      const parsed = JSON.parse(payloadStr);
      if (!Array.isArray(parsed)) return;

      const [eventName, eventData] = parsed;
      if (eventName === "new-trade") {
        this.handleTradePayload(eventData);
      }
    } catch {
      // Ignore unparseable packets
    }
  }

  private handleTradePayload(eventData: unknown): void {
    if (!eventData || typeof eventData !== "object") return;
    const obj = eventData as Record<string, unknown>;

    let rawTrade = obj.data;
    if (typeof rawTrade === "string") {
      try {
        rawTrade = JSON.parse(rawTrade);
      } catch {
        return;
      }
    }

    if (!rawTrade || typeof rawTrade !== "object") return;
    const trade = rawTrade as Record<string, unknown>;

    const price = typeof trade.p === "number" ? trade.p : parseFloat(String(trade.p || "0"));
    const volume = typeof trade.q === "number" ? trade.q : parseFloat(String(trade.q || "0"));
    const timestampMs = typeof trade.T === "number" ? trade.T : Date.now();
    const pairSymbol = typeof trade.s === "string" ? trade.s : "";

    if (!Number.isFinite(price) || price <= 0) return;

    // Match symbol
    const pairMeta = resolveCoindcxPair(pairSymbol);
    if (!pairMeta) return;

    const canonical = pairMeta.canonicalSymbol;
    const tick: MarketTick = {
      instrument: canonical,
      provider: "COINDCX",
      timestamp: new Date(timestampMs).toISOString(),
      ltp: price,
      bid: null,
      ask: null,
      volume: Number.isFinite(volume) && volume > 0 ? volume : null,
      source: "LTP",
      freshness: "LIVE",
      quality: "OK",
    };

    this.processTick(tick, canonical);
  }

  private processTick(tick: MarketTick, symbol: string): void {
    this.lastTicks.set(symbol, tick);

    // Aggregate into all registered interval aggregators for this symbol
    for (const [aggKey, aggState] of this.aggregators.entries()) {
      if (aggState.instrument !== symbol) continue;

      const nextState = aggregateTick(aggState, tick);
      this.aggregators.set(aggKey, nextState);

      const listeners = this.listeners.get(aggKey);
      if (!listeners || listeners.size === 0) continue;

      // Check if a candle completed
      if (nextState.completed.length > aggState.completed.length) {
        const completed = nextState.completed[nextState.completed.length - 1];
        const completedEvent: LiveCandleEvent = {
          type: "candle_update",
          symbol,
          intervalMs: aggState.intervalMs,
          provider: "COINDCX",
          freshness: "LIVE",
          quality: "OK",
          lastTick: tick.timestamp,
          lastLtp: tick.ltp,
          connectionState: "CONNECTED",
          candle: {
            time: completed.bucketMs,
            open: completed.open,
            high: completed.high,
            low: completed.low,
            close: completed.close,
            volume: completed.volume,
          },
          completed: true,
          timestamp: tick.timestamp,
          tickCount: completed.tickCount,
        };
        for (const l of listeners) {
          try {
            l(completedEvent);
          } catch {
            // Ignore listener error
          }
        }
      }

      // Dispatch active current candle
      if (nextState.current) {
        const currentEvent: LiveCandleEvent = {
          type: "candle_update",
          symbol,
          intervalMs: aggState.intervalMs,
          provider: "COINDCX",
          freshness: "LIVE",
          quality: "OK",
          lastTick: tick.timestamp,
          lastLtp: tick.ltp,
          connectionState: "CONNECTED",
          candle: {
            time: nextState.current.bucketMs,
            open: nextState.current.open,
            high: nextState.current.high,
            low: nextState.current.low,
            close: nextState.current.close,
            volume: nextState.current.volume,
          },
          completed: false,
          timestamp: tick.timestamp,
          tickCount: nextState.current.tickCount,
        };
        for (const l of listeners) {
          try {
            l(currentEvent);
          } catch {
            // Ignore listener error
          }
        }
      }
    }
  }

  private joinChannel(channelName: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isNamespaceConnected) return;
    const packet = `42["join",{"channelName":"${channelName}"}]`;
    this.sendRaw(packet);
  }

  private leaveChannel(channelName: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isNamespaceConnected) return;
    const packet = `42["leave",{"channelName":"${channelName}"}]`;
    this.sendRaw(packet);
  }

  private sendRaw(data: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Send Engine.IO ping every 15s to keep proxy alive
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw("2");
    }, 15000);
  }

  private handleCloseOrError(_msg: string): void {
    this.cleanupSocket();
    this.state = "RECONNECTING";

    if (this.subscribedSymbols.size > 0 && !this.reconnectTimer) {
      const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 10000);
      this.reconnectAttempt++;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    }
  }

  private cleanupSocket(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      try {
        const socket = this.ws;
        this.ws = null;
        socket.on("error", () => {}); // absorb any closure errors
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.terminate();
        } else {
          socket.close();
        }
      } catch {
        // Ignore
      }
    }
    this.isConnecting = false;
    this.isNamespaceConnected = false;
  }

  subscribe(symbol: string, intervalMs: AggregationIntervalMs = 60_000): boolean {
    assertExecutionGuardIntact(COINDCX_TRADING_ENABLED);
    const pair = resolveCoindcxPair(symbol);
    if (!pair) return false;

    const canonical = pair.canonicalSymbol;
    const aggKey = `${canonical}:${intervalMs}`;

    if (!this.aggregators.has(aggKey)) {
      this.aggregators.set(aggKey, createAggregatorState(canonical, intervalMs));
    }

    const currentRefs = this.symbolRefs.get(canonical) ?? 0;
    if (currentRefs === 0) {
      this.subscribedSymbols.add(canonical);
      if (this.state === "CONNECTED" && this.isNamespaceConnected) {
        this.joinChannel(pair.channelName);
      } else if (this.state === "DISCONNECTED") {
        this.connect();
      }
    }
    this.symbolRefs.set(canonical, currentRefs + 1);
    return true;
  }

  unsubscribe(symbol: string, intervalMs: AggregationIntervalMs = 60_000): boolean {
    const pair = resolveCoindcxPair(symbol);
    if (!pair) return false;

    const canonical = pair.canonicalSymbol;
    const currentRefs = this.symbolRefs.get(canonical) ?? 0;
    if (currentRefs <= 1) {
      this.symbolRefs.delete(canonical);
      this.subscribedSymbols.delete(canonical);
      this.leaveChannel(pair.channelName);
    } else {
      this.symbolRefs.set(canonical, currentRefs - 1);
    }

    const aggKey = `${canonical}:${intervalMs}`;
    const listeners = this.listeners.get(aggKey);
    if (!listeners || listeners.size === 0) {
      this.aggregators.delete(aggKey);
    }

    if (this.subscribedSymbols.size === 0) {
      this.stop();
    }
    return true;
  }

  onCandleUpdate(
    symbol: string,
    intervalMs: AggregationIntervalMs,
    listener: (event: LiveCandleSseEvent) => void,
  ): () => void {
    const pair = resolveCoindcxPair(symbol);
    const canonical = pair?.canonicalSymbol ?? symbol;
    const aggKey = `${canonical}:${intervalMs}`;

    let set = this.listeners.get(aggKey);
    if (!set) {
      set = new Set();
      this.listeners.set(aggKey, set);
    }
    set.add(listener);

    return () => {
      const active = this.listeners.get(aggKey);
      if (active) {
        active.delete(listener);
        if (active.size === 0) {
          this.listeners.delete(aggKey);
        }
      }
    };
  }

  getSnapshot(symbol: string, intervalMs: AggregationIntervalMs): CoindcxStreamSnapshot {
    const pair = resolveCoindcxPair(symbol);
    const canonical = pair?.canonicalSymbol ?? symbol;
    const aggKey = `${canonical}:${intervalMs}`;
    const agg = this.aggregators.get(aggKey);
    const tick = this.lastTicks.get(canonical) ?? null;

    const nowIso = new Date().toISOString();
    const telemetry: ProviderTelemetry = {
      status: this.state === "CONNECTED" ? "LIVE" : "DELAYED",
      role: "PRIMARY",
      latencyMs: 15,
      receivedAt: nowIso,
      providerTime: tick?.timestamp ?? null,
      marketSession: "TWENTY_FOUR_SEVEN",
      rateLimit: null,
      retryAfterMs: null,
      staleReason: this.state === "CONNECTED" ? null : "COINDCX_RECONNECTING",
      providerId: "COINDCX",
    };

    return {
      instrument: canonical,
      connectionState: this.state,
      lastTick: tick,
      currentCandle: agg?.current ?? null,
      completedCandleCount: agg?.completed.length ?? 0,
      telemetry,
      subscriptionActive: this.subscribedSymbols.has(canonical),
    };
  }

  getStatusEvent(symbol: string, intervalMs: number): LiveStatusEvent {
    const pair = resolveCoindcxPair(symbol);
    const canonical = pair?.canonicalSymbol ?? symbol;
    const snap = this.getSnapshot(symbol, intervalMs as AggregationIntervalMs);
    const c = snap.currentCandle;
    const isLive = snap.connectionState === "CONNECTED";
    const lastLtp = snap.lastTick?.ltp ?? pair?.defaultPrice ?? null;

    return {
      type: "status",
      symbol,
      intervalMs,
      provider: "COINDCX",
      connectionState: snap.connectionState,
      freshness: isLive ? "LIVE" : "UNAVAILABLE",
      quality: snap.lastTick?.quality ?? "OK",
      lastTick: snap.lastTick?.timestamp ?? new Date().toISOString(),
      lastLtp,
      completedCount: snap.completedCandleCount,
      error: isLive ? null : "COINDCX_DISCONNECTED",
      currentCandle: c
        ? {
            time: c.bucketMs,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }
        : lastLtp
          ? {
              time: Math.floor(Date.now() / intervalMs) * intervalMs,
              open: lastLtp,
              high: lastLtp,
              low: lastLtp,
              close: lastLtp,
              volume: 10,
            }
          : null,
    };
  }

  stop(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.state = "DISCONNECTED";
    this.aggregators.clear();
    this.lastTicks.clear();
    this.listeners.clear();
    this.symbolRefs.clear();
    this.subscribedSymbols.clear();
    this.reconnectAttempt = 0;
  }
}

// Process singleton
let coindcxStreamInstance: CoindcxSocketStream | null = null;

export function getCoindcxSocketStream(): CoindcxSocketStream {
  if (!coindcxStreamInstance) {
    coindcxStreamInstance = new CoindcxSocketStream();
  }
  return coindcxStreamInstance;
}

export function resetCoindcxSocketStream(): void {
  if (coindcxStreamInstance) {
    coindcxStreamInstance.stop();
    coindcxStreamInstance = null;
  }
}
