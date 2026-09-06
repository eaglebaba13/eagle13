// Server-only INDstocks WebSocket connection manager.
// Handles: connect, heartbeat, reconnect/backoff, lifecycle.
// Token never exposed to client/logs/telemetry.

import WebSocket from "ws";
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

export type WsConnectionListener = (snapshot: WsConnectionSnapshot) => void;
export type WsMessageListener = (message: WsProviderMessage) => void;

export class IndstocksWsConnection {
  private state: WsConnectionState = "DISCONNECTED";
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
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

  constructor(opts: IndstocksWsConfig = {}) {
    this.url = opts.url ?? INDSTOCKS_WS_URL;
    this.token = opts.token ?? (process.env.INDSTOCKS_ACCESS_TOKEN?.trim() || undefined);
    this.reconnectBaseMs = opts.reconnectBaseMs ?? INDSTOCKS_WS_DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = opts.reconnectMaxMs ?? INDSTOCKS_WS_DEFAULT_RECONNECT_MAX_MS;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? INDSTOCKS_WS_DEFAULT_HEARTBEAT_MS;
    this.connectionTimeoutMs = opts.connectionTimeoutMs ?? INDSTOCKS_WS_DEFAULT_CONNECTION_TIMEOUT_MS;
    this.nowMs = opts.nowMs ?? (() => Date.now());
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
    return () => { this.connectionListeners.delete(listener); };
  }

  onMessage(listener: WsMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => { this.messageListeners.delete(listener); };
  }

  connect(): void {
    if (this.state === "CONNECTED" || this.state === "CONNECTING" || this.state === "CLOSING") return;
    this.intentionallyClosed = false;
    this.setState("CONNECTING");
    this.createSocket();
  }

  close(): void {
    this.intentionallyClosed = true;
    this.clearTimers();
    this.setState("CLOSING");
    if (this.ws) {
      try { this.ws.close(1000, "client close"); } catch { /* ignore */ }
      this.ws = null;
    }
    this.setState("DISCONNECTED");
  }

  send(data: string): boolean {
    if (this.state !== "CONNECTED" || !this.ws) return false;
    try {
      this.ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  get isConnected(): boolean {
    return this.state === "CONNECTED";
  }

  get connectionState(): WsConnectionState {
    return this.state;
  }

  // ──────────────── Internal ────────────────

  private setState(next: WsConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    const snap = this.snapshot();
    for (const l of this.connectionListeners) {
      try { l(snap); } catch { /* listener error must not crash manager */ }
    }
  }

  private createSocket(): void {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = this.token;

    try {
      this.ws = new WebSocket(this.url, { headers });
    } catch (err) {
      this.lastError = "socket creation failed";
      this.setState("FAILED");
      this.scheduleReconnect();
      return;
    }

    // Connection timeout
    this.connectionTimer = setTimeout(() => {
      if (this.state === "CONNECTING" || this.state === "RECONNECTING") {
        this.lastError = "connection timeout";
        this.destroySocket();
        this.setState("FAILED");
        this.scheduleReconnect();
      }
    }, this.connectionTimeoutMs);

    this.ws.on("open", () => {
      this.clearConnectionTimer();
      this.connectedAt = new Date(this.nowMs()).toISOString();
      this.reconnectAttempt = 0;
      this.lastError = null;
      this.setState("CONNECTED");
      this.startHeartbeat();
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      this.lastMessageAt = new Date(this.nowMs()).toISOString();
      const parsed = this.parseMessage(data);
      if (parsed) {
        for (const l of this.messageListeners) {
          try { l(parsed); } catch { /* listener error must not crash manager */ }
        }
      }
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this.clearTimers();
      this.destroySocket();
      if (this.intentionallyClosed) {
        this.setState("DISCONNECTED");
      } else {
        this.lastError = `closed: ${code}`;
        this.setState("DISCONNECTED");
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err: Error) => {
      this.lastError = "socket error";
      // onerror is always followed by onclose, so reconnect is handled there
    });
  }

  private destroySocket(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      try { this.ws.terminate(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  // ──────────────── Heartbeat ────────────────

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== "CONNECTED" || !this.ws) return;
      try {
        // INDstocks expects a ping frame or JSON ping message
        this.ws.ping();
      } catch {
        // ping failure — will trigger close
      }
    }, this.heartbeatIntervalMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
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
      this.createSocket();
    }, delay);
  }

  // ──────────────── Timers ────────────────

  private clearConnectionTimer(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    this.clearConnectionTimer();
    this.clearReconnectTimer();
  }

  // ──────────────── Parsing ────────────────

  private parseMessage(data: WebSocket.Data): WsProviderMessage | null {
    try {
      const text = typeof data === "string" ? data : data.toString();
      const json = JSON.parse(text) as Record<string, unknown>;

      // INDstocks sends various message types
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
        return { type: "connected", data: json.data as { heartbeat_interval?: number } | undefined };
      }
      if (json.type === "subscribed") {
        return { type: "subscribed", instruments: json.instruments as string[] };
      }
      if (json.type === "error") {
        return { type: "error", message: json.message as string | undefined, code: json.code as number | undefined };
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
