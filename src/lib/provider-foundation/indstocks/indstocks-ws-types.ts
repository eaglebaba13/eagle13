// INDstocks WebSocket types — connection state, tick model, message types.
// Client-safe. No secrets, no runtime env access.

import type { QuoteSymbol, ProviderTelemetry } from "../types";

// ────────────────────── Connection State ───────────────────────────

export type WsConnectionState =
  "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "CLOSING" | "FAILED";

export interface WsConnectionSnapshot {
  readonly state: WsConnectionState;
  readonly connectedAt: string | null;
  readonly lastMessageAt: string | null;
  readonly reconnectAttempt: number;
  readonly lastError: string | null;
}

// ────────────────────── Market Tick ────────────────────────────────

export interface MarketTick {
  readonly instrument: QuoteSymbol | string;
  readonly provider: string;
  readonly timestamp: string; // ISO
  readonly ltp: number;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly volume: number | null;
  readonly source: "LTP" | "QUOTE";
  readonly freshness: "LIVE" | "STALE" | "DELAYED";
  readonly quality: "OK" | "DEGRADED" | "UNKNOWN";
}

// ────────────────────── Provider Messages ──────────────────────────

export type WsPriceMode = "ltp" | "quote";

export interface WsSubscribeMessage {
  readonly action: "subscribe";
  readonly mode: WsPriceMode;
  readonly instruments: readonly string[];
}

export interface WsUnsubscribeMessage {
  readonly action: "unsubscribe";
  readonly mode: WsPriceMode;
  readonly instruments: readonly string[];
}

export interface WsLtpTick {
  readonly instrument: string;
  readonly ltp: number;
  readonly timestamp: number; // epoch seconds or ms
  readonly volume?: number;
}

export interface WsQuoteTick {
  readonly instrument: string;
  readonly ltp: number;
  readonly timestamp: number;
  readonly volume?: number;
  readonly bid?: number;
  readonly ask?: number;
  readonly bid_qty?: number;
  readonly ask_qty?: number;
  readonly oi?: number;
}

export type WsProviderMessage =
  | { readonly type: "ltp"; readonly data: WsLtpTick }
  | { readonly type: "quote"; readonly data: WsQuoteTick }
  | { readonly type: "pong" }
  | { readonly type: "connected"; readonly data?: { readonly heartbeat_interval?: number } }
  | { readonly type: "subscribed"; readonly instruments: readonly string[] }
  | { readonly type: "error"; readonly message?: string; readonly code?: number }
  | { readonly type: "unknown"; readonly raw: unknown };

// ────────────────────── Instrument Mapping ─────────────────────────

export interface WsInstrumentMapping {
  readonly symbol: QuoteSymbol | string;
  readonly wsToken: string; // SEGMENT:TOKEN format, verified from provider
  readonly verified: boolean;
}

// ────────────────────── Configuration ──────────────────────────────

export interface IndstocksWsConfig {
  readonly url?: string;
  readonly token?: string;
  readonly reconnectBaseMs?: number;
  readonly reconnectMaxMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly connectionTimeoutMs?: number;
  readonly nowMs?: () => number;
}

export const INDSTOCKS_WS_URL = "wss://ws-prices.indstocks.com/api/v1/ws/prices";
export const INDSTOCKS_WS_DEFAULT_RECONNECT_BASE_MS = 1_000;
export const INDSTOCKS_WS_DEFAULT_RECONNECT_MAX_MS = 30_000;
export const INDSTOCKS_WS_DEFAULT_HEARTBEAT_MS = 30_000;
export const INDSTOCKS_WS_DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;
