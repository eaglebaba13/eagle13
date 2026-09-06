// INDstocks WebSocket streaming adapter — server-only.
// Wraps connection manager + subscription manager into a provider-neutral
// streaming interface. Token never exposed.

import type { QuoteSymbol, ProviderTelemetry } from "../types";
import { INDSTOCKS_ADAPTER_ID } from "./indstocks-types";
import type {
  MarketTick,
  WsConnectionSnapshot,
  WsPriceMode,
  WsInstrumentMapping,
  WsProviderMessage,
  IndstocksWsConfig,
} from "./indstocks-ws-types";
import { IndstocksWsConnection, type TransportFactory } from "./indstocks-ws-connection.server";
import { IndstocksWsSubscriptionManager } from "./indstocks-ws-subscription";

export type TickListener = (tick: MarketTick) => void;

/**
 * Default resolver for the 3 supported index instruments.
 * NIDX:26000 is the documented INDstocks example for NIFTY 50.
 * BANKNIFTY and INDIA VIX are UNRESOLVED until verified from provider.
 */
export function defaultWsMappingResolver(symbol: QuoteSymbol | string): WsInstrumentMapping | null {
  const VERIFIED: Record<string, WsInstrumentMapping> = {
    NIFTY50: { symbol: "NIFTY50", wsToken: "NIDX:26000", verified: true },
    // BANKNIFTY and INDIA VIX: WebSocket tokens not verified from provider instrument source
    BANKNIFTY: { symbol: "BANKNIFTY", wsToken: "", verified: false },
    INDIA_VIX: { symbol: "INDIA_VIX", wsToken: "", verified: false },
  };
  return VERIFIED[symbol] ?? null;
}

export class IndstocksWsAdapter {
  readonly id = INDSTOCKS_ADAPTER_ID;

  private readonly connection: IndstocksWsConnection;
  private readonly subscriptions: IndstocksWsSubscriptionManager;
  private readonly tickListeners = new Set<TickListener>();
  private readonly instrumentToSymbol = new Map<string, QuoteSymbol | string>();
  private removeConnectionListener: (() => void) | null = null;
  private removeMessageListener: (() => void) | null = null;

  constructor(
    opts: IndstocksWsConfig & { transportFactory?: TransportFactory } = {},
    mappingResolver?: (symbol: QuoteSymbol | string) => WsInstrumentMapping | null,
  ) {
    this.connection = new IndstocksWsConnection(opts);
    this.subscriptions = new IndstocksWsSubscriptionManager(
      mappingResolver ?? defaultWsMappingResolver,
    );

    this.removeConnectionListener = this.connection.onConnectionChange((snap) => {
      if (snap.state === "CONNECTED") {
        this.restoreSubscriptions();
      }
    });

    this.removeMessageListener = this.connection.onMessage((msg) => {
      this.handleMessage(msg);
    });
  }

  // ──────────────── Public API ────────────────

  connect(): void {
    this.connection.connect();
  }

  close(): void {
    this.connection.close();
    this.subscriptions.clear();
    this.instrumentToSymbol.clear();
    this.removeConnectionListener?.();
    this.removeMessageListener?.();
    this.removeConnectionListener = null;
    this.removeMessageListener = null;
  }

  subscribe(symbol: QuoteSymbol, mode: WsPriceMode = "ltp"): boolean {
    const msg = this.subscriptions.subscribe(symbol, mode);
    if (!msg) return false;

    const mapping = defaultWsMappingResolver(symbol);
    if (mapping) this.instrumentToSymbol.set(mapping.wsToken, symbol);

    return this.connection.send(JSON.stringify(msg));
  }

  unsubscribe(symbol: QuoteSymbol, mode: WsPriceMode = "ltp"): boolean {
    const msg = this.subscriptions.unsubscribe(symbol, mode);
    if (!msg) return false;
    return this.connection.send(JSON.stringify(msg));
  }

  onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  connectionSnapshot(): WsConnectionSnapshot {
    return this.connection.snapshot();
  }

  subscriptionSnapshot() {
    return this.subscriptions.snapshot();
  }

  get isConnected(): boolean {
    return this.connection.isConnected;
  }

  // ──────────────── Internal ────────────────

  private restoreSubscriptions(): void {
    const msgs = this.subscriptions.resubscribeAll();
    for (const msg of msgs) {
      this.connection.send(JSON.stringify(msg));
    }
  }

  private handleMessage(msg: WsProviderMessage): void {
    if (msg.type === "ltp" || msg.type === "quote") {
      const tick = this.normalizeTick(msg);
      if (tick) {
        for (const l of this.tickListeners) {
          try {
            l(tick);
          } catch {
            /* listener error */
          }
        }
      }
    }
    // pong, connected, subscribed, error, unknown — handled by connection manager
  }

  private normalizeTick(msg: WsProviderMessage): MarketTick | null {
    if (msg.type !== "ltp" && msg.type !== "quote") return null;
    const data = msg.data;
    const symbol = this.instrumentToSymbol.get(data.instrument) ?? data.instrument;
    const nowMs = Date.now();
    const tickTimestamp =
      typeof data.timestamp === "number"
        ? data.timestamp > 1e12
          ? data.timestamp
          : data.timestamp * 1000
        : nowMs;
    const ageSec = Math.max(0, (nowMs - tickTimestamp) / 1000);

    return {
      instrument: symbol,
      provider: INDSTOCKS_ADAPTER_ID,
      timestamp: new Date(tickTimestamp).toISOString(),
      ltp: data.ltp,
      bid: msg.type === "quote" ? (msg.data.bid ?? null) : null,
      ask: msg.type === "quote" ? (msg.data.ask ?? null) : null,
      volume: data.volume ?? null,
      source: msg.type === "ltp" ? "LTP" : "QUOTE",
      freshness: ageSec < 30 ? "LIVE" : ageSec < 300 ? "DELAYED" : "STALE",
      quality: "OK",
    };
  }
}

export function buildIndstocksWsTelemetry(
  snap: WsConnectionSnapshot,
  subCount: number,
  role: "PRIMARY" | "SECONDARY" = "SECONDARY",
): ProviderTelemetry {
  const status: ProviderTelemetry["status"] =
    snap.state === "CONNECTED"
      ? "LIVE"
      : snap.state === "RECONNECTING"
        ? "STALE"
        : snap.state === "FAILED"
          ? "FAILED"
          : "OFFLINE";
  return {
    status,
    latencyMs: 0,
    receivedAt: snap.lastMessageAt ?? new Date().toISOString(),
    providerTime: null,
    marketSession: "UNKNOWN",
    rateLimit: null,
    retryAfterMs: null,
    staleReason: snap.lastError,
    providerId: `${INDSTOCKS_ADAPTER_ID}_WS`,
    role,
  };
}
