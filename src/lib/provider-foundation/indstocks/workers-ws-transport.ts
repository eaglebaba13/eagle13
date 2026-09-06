// Cloudflare Workers WebSocket transport.
// Uses fetch + Upgrade header to establish authenticated WebSocket connections.
// Compatible with nodejs_compat flag. No Node.js-specific APIs.

import type { WebSocketTransport, WebSocketTransportConfig } from "./websocket-transport";
import { WS_OPEN, WS_CLOSED, WS_CONNECTING, WS_CLOSING } from "./websocket-transport";

/**
 * Cloudflare Workers transport for connecting to external WebSocket servers.
 * Uses the Workers fetch API with Upgrade: websocket to support custom headers
 * (required for Authorization header on INDstocks price feed).
 *
 * The standard `new WebSocket(url)` API does not support custom headers,
 * so we use the fetch upgrade pattern which returns a WebSocket via
 * response.webSocket.
 */
export class WorkersWebSocketTransport implements WebSocketTransport {
  private ws: WebSocket | null = null;
  private _readyState: number = WS_CLOSED;
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly connectionTimeoutMs: number;
  private openHandlers: Array<() => void> = [];
  private messageHandlers: Array<(data: string) => void> = [];
  private closeHandlers: Array<(code: number, reason: string) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WebSocketTransportConfig) {
    this.url = config.url;
    this.headers = config.headers ?? {};
    this.connectionTimeoutMs = config.connectionTimeoutMs ?? 10_000;
  }

  get readyState(): number {
    return this._readyState;
  }

  async connect(): Promise<void> {
    if (this._readyState === WS_OPEN || this._readyState === WS_CONNECTING) return;
    this._readyState = WS_CONNECTING;

    this.connectionTimer = setTimeout(() => {
      if (this._readyState === WS_CONNECTING) {
        this._readyState = WS_CLOSED;
        this.emitError(new Error("connection timeout"));
        this.emitClose(4000, "connection timeout");
      }
    }, this.connectionTimeoutMs);

    try {
      // Use fetch with Upgrade header to support custom Authorization header.
      // Cloudflare Workers supports response.webSocket for upgraded connections.
      const response = await fetch(this.url, {
        headers: {
          ...this.headers,
          Upgrade: "websocket",
        },
      });

      this.clearConnectionTimer();

      // In Cloudflare Workers, an upgraded response has status 101 and a webSocket property.
      const webSocket = (response as unknown as { webSocket?: WebSocket }).webSocket;
      if (!webSocket) {
        this._readyState = WS_CLOSED;
        this.emitError(new Error("WebSocket upgrade failed"));
        this.emitClose(4001, "upgrade failed");
        return;
      }

      this.ws = webSocket;
      this.ws.accept();
      this._readyState = WS_OPEN;
      this.attachListeners();
      this.emitOpen();
    } catch (err) {
      this.clearConnectionTimer();
      this._readyState = WS_CLOSED;
      this.emitError(err instanceof Error ? err : new Error(String(err)));
      this.emitClose(4002, "connection failed");
    }
  }

  send(data: string): boolean {
    if (this._readyState !== WS_OPEN || !this.ws) return false;
    try {
      this.ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  close(code = 1000, reason = ""): void {
    this._readyState = WS_CLOSING;
    this.clearConnectionTimer();
    if (this.ws) {
      try { this.ws.close(code, reason); } catch { /* ignore */ }
    }
  }

  terminate(): void {
    this.clearConnectionTimer();
    if (this.ws) {
      try { this.ws.close(1006, "terminated"); } catch { /* ignore */ }
    }
    this.ws = null;
    this._readyState = WS_CLOSED;
  }

  onOpen(handler: () => void): void { this.openHandlers.push(handler); }
  onMessage(handler: (data: string) => void): void { this.messageHandlers.push(handler); }
  onClose(handler: (code: number, reason: string) => void): void { this.closeHandlers.push(handler); }
  onError(handler: (error: Error) => void): void { this.errorHandlers.push(handler); }

  removeAllListeners(): void {
    this.openHandlers = [];
    this.messageHandlers = [];
    this.closeHandlers = [];
    this.errorHandlers = [];
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
    }
  }

  ping(): void {
    // Cloudflare Workers WebSocket does not expose a ping() method.
    // INDstocks heartbeat is handled via application-level messages if required,
    // or via the protocol-level ping/pong managed by the runtime.
    // Send a JSON ping if the provider requires application-level heartbeat.
    if (this._readyState === WS_OPEN && this.ws) {
      try { this.ws.send(JSON.stringify({ type: "ping" })); } catch { /* ignore */ }
    }
  }

  private attachListeners(): void {
    if (!this.ws) return;
    this.ws.onopen = () => {
      this._readyState = WS_OPEN;
      this.emitOpen();
    };
    this.ws.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : String(event.data);
      this.emitMessage(data);
    };
    this.ws.onclose = (event: CloseEvent) => {
      this._readyState = WS_CLOSED;
      this.emitClose(event.code ?? 1000, event.reason ?? "");
      this.ws = null;
    };
    this.ws.onerror = () => {
      this.emitError(new Error("WebSocket error"));
    };
  }

  private clearConnectionTimer(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  private emitOpen(): void { for (const h of this.openHandlers) try { h(); } catch { /* */ } }
  private emitMessage(data: string): void { for (const h of this.messageHandlers) try { h(data); } catch { /* */ } }
  private emitClose(code: number, reason: string): void { for (const h of this.closeHandlers) try { h(code, reason); } catch { /* */ } }
  private emitError(err: Error): void { for (const h of this.errorHandlers) try { h(err); } catch { /* */ } }
}
