// Server-only INDstocks WebSocket connection manager.
// Uses provider-neutral WebSocketTransport abstraction.
// Compatible with Cloudflare Workers runtime.
// Token never exposed to client/logs/telemetry.

import type {
  WsConnectionState,
  WsConnectionSnapshot,
  WsProviderMessage,
  IndstocksWsConfig,
} from "./indstocks-ws-types";
import {
  INDSTOCKS_WS_URL,
  INDSTOCKS_WS_DEFAULT_RECONNECT_BASE_MS,
  INDSTOCKS_WS_DEFAULT_RECONNECT_MAX_MS,
  INDSTOCKS_WS_DEFAULT_HEARTBEAT_MS,
  INDSTOCKS_WS_DEFAULT_CONNECTION_TIMEOUT_MS,
} from "./indstocks-ws-types";
import type { WebSocketTransport, WebSocketTransportConfig } from "./websocket-transport";
import { WS_OPEN, WS_CLOSED } from "./websocket-transport";
import { WorkersWebSocketTransport } from "./workers-ws-transport";

export type WsConnectionListener = (snapshot: WsConnectionSnapshot) => void;
export type WsMessageListener = (message: WsProviderMessage) => void;

export type TransportFactory = (config: WebSocketTransportConfig) => WebSocketTransport;

export class IndstocksWsConnection {
  private state: WsConnectionState = "DISCONNECTED";
  private transport: WebSocketTransport | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private connectedAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastError: string | null = null;
  private intentionallyClosed = false;
  private readonly connectionListeners = new Set<WsConnectionListener>();
  private readonly messageListeners = new Set<WsMessageListener>();

  private readonly url: string;
  private readonly token: string | undefined;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly connectionTimeoutMs: number;
  private readonly nowMs: () => number;
  private readonly transportFactory: TransportFactory;

  constructor(opts: IndstocksWsConfig & { transportFactory?: TransportFactory } = {}) {
    this.url = opts.url ?? INDSTOCKS_WS_URL;
    this.token = opts.token ?? (process.env.INDSTOCKS_ACCESS_TOKEN?.trim() || undefined);
    this.reconnectBaseMs = opts.reconnectBaseMs ?? INDSTOCKS_WS_DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = opts.reconnectMaxMs ?? INDSTOCKS_WS_DEFAULT_RECONNECT_MAX_MS;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? INDSTOCKS_WS_DEFAULT_HEARTBEAT_MS;
    this.connectionTimeoutMs =
      opts.connectionTimeoutMs ?? INDSTOCKS_WS_DEFAULT_CONNECTION_TIMEOUT_MS;
    this.nowMs = opts.nowMs ?? (() => Date.now());
    this.transportFactory = opts.transportFactory ?? this.defaultTransportFactory.bind(this);
  }

  // ──────────────── Public API ────────────────

  snapshot(): WsConnectionSnapshot {
    return {
      state: this.state,
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
      reconnectAttempt: this.reconnectAttempt,
      lastError: this.lastError,
    };
  }

  onConnectionChange(listener: WsConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  onMessage(listener: WsMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  connect(): void {
    if (this.state === "CONNECTED" || this.state === "CONNECTING" || this.state === "CLOSING")
      return;
    this.intentionallyClosed = false;
    this.setState("CONNECTING");
    this.createTransport();
  }

  close(): void {
    this.intentionallyClosed = true;
    this.clearTimers();
    this.setState("CLOSING");
    const t = this.transport;
    this.transport = null;
    if (t) {
      try {
        t.close(1000, "client close");
      } catch {
        /* ignore */
      }
      t.removeAllListeners();
    }
    this.setState("DISCONNECTED");
  }

  send(data: string): boolean {
    if (this.state !== "CONNECTED" || !this.transport) return false;
    return this.transport.send(data);
  }

  get isConnected(): boolean {
    return this.state === "CONNECTED";
  }

  get connectionState(): WsConnectionState {
    return this.state;
  }

  // ──────────────── Internal ────────────────

  private defaultTransportFactory(config: WebSocketTransportConfig): WebSocketTransport {
    // Production default: Cloudflare Workers-compatible transport using fetch+Upgrade.
    // Tests inject a mock factory via constructor opts to avoid real connections.
    return new WorkersWebSocketTransport(config);
  }

  private setState(next: WsConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    const snap = this.snapshot();
    for (const l of this.connectionListeners) {
      try {
        l(snap);
      } catch {
        /* listener error must not crash manager */
      }
    }
  }

  private createTransport(): void {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = this.token;

    try {
      this.transport = this.transportFactory({
        url: this.url,
        headers,
        connectionTimeoutMs: this.connectionTimeoutMs,
      });
    } catch {
      this.lastError = "transport creation failed";
      this.setState("FAILED");
      this.scheduleReconnect();
      return;
    }

    this.transport.onOpen(() => {
      this.connectedAt = new Date(this.nowMs()).toISOString();
      this.reconnectAttempt = 0;
      this.lastError = null;
      this.setState("CONNECTED");
      this.startHeartbeat();
    });

    this.transport.onMessage((data: string) => {
      this.lastMessageAt = new Date(this.nowMs()).toISOString();
      const parsed = this.parseMessage(data);
      if (parsed) {
        for (const l of this.messageListeners) {
          try {
            l(parsed);
          } catch {
            /* listener error must not crash manager */
          }
        }
      }
    });

    this.transport.onClose((code: number, reason: string) => {
      this.clearTimers();
      if (this.intentionallyClosed) {
        this.setState("DISCONNECTED");
      } else {
        this.lastError = `closed: ${code}`;
        this.setState("DISCONNECTED");
        this.scheduleReconnect();
      }
      if (this.transport) {
        this.transport.removeAllListeners();
        this.transport = null;
      }
    });

    this.transport.onError((_err: Error) => {
      this.lastError = "transport error";
      // onerror is typically followed by onclose, so reconnect is handled there
    });

    // For async transports (Workers), connect() returns a promise.
    // For sync transports (ws), connect() is synchronous.
    try {
      const result = this.transport.connect();
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => {
          // Connection failed — onClose/onError will handle state transition
        });
      }
    } catch {
      this.lastError = "connect failed";
      if (this.transport) {
        this.transport.removeAllListeners();
        this.transport = null;
      }
      this.setState("FAILED");
      this.scheduleReconnect();
    }
  }

  // ──────────────── Heartbeat / Stale Detection ────────────────

  private startHeartbeat(): void {
    this.clearHeartbeat();
    // INDstocks sends server-originated heartbeat messages. We do NOT send
    // client-initiated pings (no documented protocol for it). Instead, we
    // monitor whether ANY message (including provider heartbeats) arrives
    // within the heartbeat window. If not, the connection is stale → reconnect.
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== "CONNECTED") return;
      if (!this.lastMessageAt) return;
      const age = this.nowMs() - Date.parse(this.lastMessageAt);
      if (age > this.heartbeatIntervalMs * 2) {
        // No message received within 2× heartbeat window — connection is stale.
        this.lastError = "stale: no provider message within heartbeat window";
        this.destroyTransport();
        this.setState("DISCONNECTED");
        this.scheduleReconnect();
      }
    }, this.heartbeatIntervalMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private destroyTransport(): void {
    if (this.transport) {
      this.transport.removeAllListeners();
      try {
        this.transport.terminate();
      } catch {
        /* ignore */
      }
      this.transport = null;
    }
  }

  // ──────────────── Reconnect ────────────────

  private scheduleReconnect(): void {
    if (this.intentionallyClosed) return;
    if (this.reconnectTimer) return; // already scheduled

    this.reconnectAttempt++;
    const delay = Math.min(
      this.reconnectBaseMs * 2 ** (this.reconnectAttempt - 1),
      this.reconnectMaxMs,
    );
    this.setState("RECONNECTING");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionallyClosed) return;
      this.createTransport();
    }, delay);
  }

  // ──────────────── Timers ────────────────

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    this.clearReconnectTimer();
  }

  // ──────────────── Parsing ────────────────

  private parseMessage(data: string): WsProviderMessage | null {
    try {
      const json = JSON.parse(data) as Record<string, unknown>;

      if (json.type === "ltp" && json.data) {
        return { type: "ltp", data: json.data as import("./indstocks-ws-types").WsLtpTick };
      }
      if (json.type === "quote" && json.data) {
        return { type: "quote", data: json.data as import("./indstocks-ws-types").WsQuoteTick };
      }
      if (json.type === "pong") {
        return { type: "pong" };
      }
      if (json.type === "connected") {
        return {
          type: "connected",
          data: json.data as { heartbeat_interval?: number } | undefined,
        };
      }
      if (json.type === "subscribed") {
        return { type: "subscribed", instruments: json.instruments as string[] };
      }
      if (json.type === "error") {
        return {
          type: "error",
          message: json.message as string | undefined,
          code: json.code as number | undefined,
        };
      }
      return { type: "unknown", raw: json };
    } catch {
      return null; // malformed JSON — silently ignore
    }
  }
}

export function redactWsError(msg: string): string {
  return msg
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/Authorization[^,\s]*/gi, "Authorization=[REDACTED]");
}
