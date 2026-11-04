// Upstox V3 WebSocket Market Data Feed Adapter — server-only.
// Wraps Upstox V3 Market Data Feed WebSocket into a provider-neutral streaming interface.
// Binary Protobuf frames are decoded safely using pure TypeScript upstox-protobuf-wire-decoder.
// Tokens and credentials are NEVER exposed to client, logs, or snapshots.

import WebSocket from "ws";
import type { QuoteSymbol, ProviderTelemetry, ProviderStatus } from "../types";
import type {
  MarketTick,
  WsConnectionSnapshot,
  WsPriceMode,
  WsConnectionState,
} from "../indstocks/indstocks-ws-types";
import type { LiveMarketStreamProvider } from "@/lib/live-market-provider.server";
import { resolveUpstoxMarketDataToken } from "./upstox-token-policy.server";
import {
  decodeUpstoxFeedResponse,
  toUint8Array,
  type DecodedFeed,
  type DecodedLtpc,
} from "./upstox-protobuf-wire-decoder";

export type TickListener = (tick: MarketTick) => void;

export const UPSTOX_WS_ADAPTER_ID = "UPSTOX_V3_WS";
export const UPSTOX_AUTH_URL = "https://api.upstox.com/v3/feed/market-data-feed/authorize";

export const UPSTOX_INSTRUMENT_MAP: Readonly<Record<string, string>> = Object.freeze({
  NIFTY50: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  FINNIFTY: "NSE_INDEX|Nifty Fin Service",
  INDIA_VIX: "NSE_INDEX|India VIX",
  GOLD: "MCX_FO|GOLD",
  SILVER: "MCX_FO|SILVER",
});

export const REVERSE_INSTRUMENT_MAP: Readonly<Record<string, QuoteSymbol>> = Object.freeze({
  "NSE_INDEX|Nifty 50": "NIFTY50",
  "NSE_INDEX|Nifty Bank": "BANKNIFTY",
  "NSE_INDEX|Nifty Fin Service": "FINNIFTY",
  "NSE_INDEX|India VIX": "INDIA_VIX",
  "MCX_FO|GOLD": "GOLD",
  "MCX_FO|SILVER": "SILVER",
});

/**
 * Serializes a subscription control message into a binary UTF-8 Uint8Array / Buffer.
 * Upstox V3 Market Data Feeder requires WebSocket control & subscription frames
 * to be transmitted as binary (opcode 0x2) frames; text frames are dropped.
 */
export function encodeBinaryPayload(data: unknown): Uint8Array {
  const json = typeof data === "string" ? data : JSON.stringify(data);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8");
  }
  return new TextEncoder().encode(json);
}

export interface GenericSocket {
  binaryType: string;
  readyState: number;
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: unknown }) => void) | null;
}

export interface UpstoxWsAdapterConfig {
  readonly token?: string;
  readonly socketFactory?: (url: string) => GenericSocket;
  readonly reconnectBaseMs?: number;
  readonly reconnectMaxMs?: number;
  readonly maxReconnectAttempts?: number;
  readonly nowMs?: () => number;
}

export class UpstoxWsAdapter implements LiveMarketStreamProvider {
  readonly id = UPSTOX_WS_ADAPTER_ID;

  private ws: GenericSocket | null = null;
  private state: WsConnectionState = "DISCONNECTED";
  private connectedAt: string | null = null;
  private lastMessageAt: string | null = null;
  private reconnectAttempt = 0;
  private lastError: string | null = null;
  private intentionallyClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly tickListeners = new Set<TickListener>();
  private readonly activeSubscribedSymbols = new Set<QuoteSymbol>();
  private readonly lastLttBySymbol = new Map<string, number>();
  private readonly lastLtpBySymbol = new Map<string, number>();

  private readonly explicitToken?: string;
  private readonly socketFactory?: (url: string) => GenericSocket;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly nowMs: () => number;

  constructor(opts: UpstoxWsAdapterConfig = {}) {
    this.explicitToken = opts.token;
    this.socketFactory = opts.socketFactory;
    this.reconnectBaseMs = opts.reconnectBaseMs ?? 2_000;
    this.reconnectMaxMs = opts.reconnectMaxMs ?? 30_000;
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? 5;
    this.nowMs = opts.nowMs ?? (() => Date.now());
  }

  // ──────────────── Public API ────────────────

  connect(): void {
    if (this.state === "CONNECTED" || this.state === "CONNECTING") return;
    this.intentionallyClosed = false;
    this.state = "CONNECTING";

    const token =
      this.explicitToken ??
      resolveUpstoxMarketDataToken({
        UPSTOX_ANALYTICS_TOKEN: process.env.UPSTOX_ANALYTICS_TOKEN,
        Upstox_Analytics_Token: process.env.Upstox_Analytics_Token,
        UPSTOX_ACCESS_TOKEN: process.env.UPSTOX_ACCESS_TOKEN,
      });

    if (!token) {
      // Missing credentials fail closed.
      this.state = "DISCONNECTED";
      this.lastError = "CONFIGURATION_ERROR";
      return;
    }

    void this.authorizeAndConnect(token);
  }

  close(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = "DISCONNECTED";
    this.tickListeners.clear();
    this.activeSubscribedSymbols.clear();
    this.lastLttBySymbol.clear();
    this.lastLtpBySymbol.clear();
  }

  subscribe(symbol: QuoteSymbol, _mode: WsPriceMode = "ltp"): boolean {
    this.activeSubscribedSymbols.add(symbol);
    if (this.state === "CONNECTED") {
      this.sendSubscriptions();
    } else if (this.state === "DISCONNECTED") {
      this.connect();
    }
    return true;
  }

  unsubscribe(symbol: QuoteSymbol, _mode: WsPriceMode = "ltp"): boolean {
    this.activeSubscribedSymbols.delete(symbol);
    this.lastLttBySymbol.delete(symbol);
    this.lastLtpBySymbol.delete(symbol);

    if (this.state === "CONNECTED" && this.ws) {
      const upstoxKey = UPSTOX_INSTRUMENT_MAP[symbol];
      if (upstoxKey) {
        const unsubMsg = {
          guid: `eb-unsub-${this.nowMs()}`,
          method: "unsub",
          data: {
            mode: "full",
            instrumentKeys: [upstoxKey],
          },
        };
        try {
          this.ws.send(encodeBinaryPayload(unsubMsg));
        } catch {
          // Ignore send errors on unsubscribe
        }
      }
    }
    return true;
  }

  onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  get isConnected(): boolean {
    return this.state === "CONNECTED";
  }

  connectionSnapshot(): WsConnectionSnapshot {
    return {
      state: this.state,
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
      reconnectAttempt: this.reconnectAttempt,
      lastError: this.lastError,
    };
  }

  telemetry(): ProviderTelemetry {
    const status: ProviderStatus = this.state === "CONNECTED" ? "LIVE" : "OFFLINE";
    const nowIso = new Date(this.nowMs()).toISOString();
    return {
      providerId: UPSTOX_WS_ADAPTER_ID,
      status,
      latencyMs: 15,
      receivedAt: nowIso,
      providerTime: this.lastMessageAt,
      marketSession: "REGULAR",
      rateLimit: null,
      retryAfterMs: null,
      staleReason: this.lastError,
      role: "PRIMARY",
    };
  }

  // ──────────────── Internal Connection & Auth ────────────────

  private async authorizeAndConnect(token: string): Promise<void> {
    try {
      const res = await fetch(UPSTOX_AUTH_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Upstox WS authorization failed HTTP ${res.status}`);
      }

      const json = (await res.json()) as {
        status?: unknown;
        data?: { authorized_redirect_uri?: unknown } | null;
      };
      const redirectUri = json.data?.authorized_redirect_uri;
      if (json.status !== "success" || typeof redirectUri !== "string") {
        throw new Error("Upstox WS authorization response is invalid");
      }

      const wsUrl = new URL(redirectUri);
      if (wsUrl.protocol !== "wss:" || !wsUrl.hostname) {
        throw new Error("Upstox WS authorization URL is invalid");
      }

      // Create socket: prefer custom factory -> global WebSocket -> Node ws
      const socket = this.createSocket(wsUrl.toString());
      if (!socket) {
        this.state = "DISCONNECTED";
        this.lastError = "PROVIDER_ERROR";
        return;
      }

      this.ws = socket;
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.state = "CONNECTED";
        this.connectedAt = new Date(this.nowMs()).toISOString();
        this.reconnectAttempt = 0;
        this.lastError = null;
        this.sendSubscriptions();
      };

      this.ws.onmessage = (evt) => {
        this.lastMessageAt = new Date(this.nowMs()).toISOString();
        this.handleWsFrame(evt.data);
      };

      this.ws.onerror = (evt) => {
        this.lastError = evt instanceof Error ? evt.message : "WebSocket error";
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.state = "DISCONNECTED";
        if (
          !this.intentionallyClosed &&
          this.activeSubscribedSymbols.size > 0 &&
          this.reconnectAttempt < this.maxReconnectAttempts
        ) {
          this.reconnectAttempt++;
          const delay = Math.min(this.reconnectBaseMs * this.reconnectAttempt, this.reconnectMaxMs);
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.intentionallyClosed) {
              this.connect();
            }
          }, delay);
        }
      };
    } catch {
      this.lastError = "PROVIDER_ERROR";
      this.state = "DISCONNECTED";
    }
  }

  private createSocket(url: string): GenericSocket | null {
    if (this.socketFactory) {
      return this.socketFactory(url);
    }
    // Browser / test environment with global WebSocket stub
    if (typeof globalThis.WebSocket !== "undefined") {
      return new globalThis.WebSocket(url) as unknown as GenericSocket;
    }
    // Node.js fallback with ws library
    try {
      const wsNode = new WebSocket(url, {
        handshakeTimeout: 10_000,
        maxPayload: 10 * 1024 * 1024,
        followRedirects: true,
      });
      return wsNode as unknown as GenericSocket;
    } catch {
      return null;
    }
  }

  private sendSubscriptions(): void {
    if (!this.ws || this.ws.readyState !== 1) return;
    const keys = [...this.activeSubscribedSymbols]
      .map((s) => UPSTOX_INSTRUMENT_MAP[s])
      .filter((k): k is string => typeof k === "string" && k.length > 0);

    if (keys.length === 0) return;

    const subMsg = {
      guid: `eb-sub-${this.nowMs()}`,
      method: "sub",
      data: {
        mode: "full",
        instrumentKeys: keys,
      },
    };

    try {
      this.ws.send(encodeBinaryPayload(subMsg));
    } catch {
      // Ignored; onclose will handle reconnect if broken
    }
  }

  // ──────────────── Message Processing ────────────────

  public handleWsFrame(data: unknown): void {
    // 1. Text control frames (e.g. JSON error notifications)
    if (typeof data === "string") {
      try {
        const json = JSON.parse(data) as Record<string, unknown>;
        if (json.type === "error" || json.status === "error") {
          const msg = typeof json.message === "string" ? json.message : "PROVIDER_ERROR";
          this.lastError = msg;
        }
      } catch {
        // Ignore non-JSON text
      }
      return;
    }

    // 2. Binary Protobuf frames
    const bytes = toUint8Array(data);
    if (!bytes) return;

    const decoded = decodeUpstoxFeedResponse(bytes);
    if (!decoded.ok) {
      return; // Malformed / non-protobuf frames are safely ignored
    }

    const now = this.nowMs();
    for (const [key, rawFeed] of Object.entries(decoded.data.feeds)) {
      const symbol = REVERSE_INSTRUMENT_MAP[key];
      if (!symbol || !rawFeed) continue;

      const ltpc = this.extractLtpc(rawFeed);
      if (!ltpc || typeof ltpc.ltp !== "number" || !Number.isFinite(ltpc.ltp) || ltpc.ltp <= 0) {
        continue; // Discard ticks with missing, invalid or zero price
      }

      // Check timestamp validity and freshness
      let isoTime: string;
      let freshness: "LIVE" | "STALE" = "LIVE";

      if (typeof ltpc.ltt === "number" && Number.isFinite(ltpc.ltt) && ltpc.ltt > 0) {
        // Discard ticks with impossible future timestamps (> 5 seconds ahead)
        if (ltpc.ltt > now + 5_000) {
          continue;
        }
        const ageMs = now - ltpc.ltt;
        freshness = ageMs > 30_000 ? "STALE" : "LIVE";
        isoTime = new Date(ltpc.ltt).toISOString();

        // Reject out-of-order ticks (ltt < last seen ltt)
        const lastLtt = this.lastLttBySymbol.get(symbol);
        const lastLtp = this.lastLtpBySymbol.get(symbol);

        if (lastLtt !== undefined && ltpc.ltt < lastLtt) {
          continue; // Out-of-order tick
        }

        // Reject exact duplicate ticks (identical ltt and identical ltp)
        if (lastLtt !== undefined && ltpc.ltt === lastLtt && lastLtp === ltpc.ltp) {
          continue; // Duplicate tick
        }

        this.lastLttBySymbol.set(symbol, ltpc.ltt);
        this.lastLtpBySymbol.set(symbol, ltpc.ltp);
      } else {
        isoTime = new Date(now).toISOString();
      }

      const tick: MarketTick = {
        instrument: symbol,
        provider: UPSTOX_WS_ADAPTER_ID,
        timestamp: isoTime,
        ltp: ltpc.ltp,
        bid: null,
        ask: null,
        volume: null,
        source: "LTP",
        freshness,
        quality: "OK",
      };

      this.emitTick(tick);
    }
  }

  private extractLtpc(feed: DecodedFeed): DecodedLtpc | null {
    // Indices populate indexFF exclusively
    if (feed.indexFF?.ltpc) return feed.indexFF.ltpc;
    // Equities & Commodities populate marketFF
    if (feed.marketFF?.ltpc) return feed.marketFF.ltpc;
    // Mode ltpc populates root ltpc
    if (feed.ltpc) return feed.ltpc;
    return null;
  }

  private emitTick(tick: MarketTick): void {
    this.lastMessageAt = new Date(this.nowMs()).toISOString();
    for (const listener of this.tickListeners) {
      try {
        listener(tick);
      } catch {
        // Listener error must never crash adapter
      }
    }
  }
}
