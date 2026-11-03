// Provider-neutral WebSocket transport abstraction for Upstox V3 streaming.
// Supports both string and binary messages (ArrayBuffer / Buffer / Uint8Array).
// Server-only. Tokens and secrets are never logged.

import WebSocket from "ws";

export interface UpstoxWebSocketTransport {
  connect(): void | Promise<void>;
  send(data: string): boolean;
  close(code?: number, reason?: string): void;
  terminate(): void;
  onOpen(handler: () => void): void;
  onMessage(handler: (data: unknown) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
  onError(handler: (error: Error) => void): void;
  removeAllListeners(): void;
  readonly readyState: number;
}

export interface UpstoxTransportConfig {
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly connectionTimeoutMs?: number;
}

export type UpstoxTransportFactory = (config: UpstoxTransportConfig) => UpstoxWebSocketTransport;

export class NodeUpstoxWebSocketTransport implements UpstoxWebSocketTransport {
  private socket: WebSocket | null = null;
  private openHandlers: (() => void)[] = [];
  private messageHandlers: ((data: unknown) => void)[] = [];
  private closeHandlers: ((code: number, reason: string) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];

  constructor(private readonly config: UpstoxTransportConfig) {}

  get readyState(): number {
    return this.socket?.readyState ?? WebSocket.CLOSED;
  }

  connect(): void {
    const socket = new WebSocket(this.config.url, {
      headers: this.config.headers,
      handshakeTimeout: this.config.connectionTimeoutMs ?? 10_000,
      maxPayload: 10 * 1024 * 1024,
      followRedirects: true,
    });
    socket.binaryType = "nodebuffer";
    this.socket = socket;

    socket.on("open", () => {
      for (const h of this.openHandlers) h();
    });

    socket.on("message", (data) => {
      for (const h of this.messageHandlers) h(data);
    });

    socket.on("unexpected-response", (_request, response) => {
      const code = response.statusCode;
      response.resume();
      const err = new Error(
        code === 401 || code === 403 ? "PROVIDER_AUTH_ERROR" : "PROVIDER_ERROR",
      );
      for (const h of this.errorHandlers) h(err);
      socket.terminate();
    });

    socket.on("error", (err) => {
      for (const h of this.errorHandlers) h(err instanceof Error ? err : new Error(String(err)));
    });

    socket.on("close", (code, reason) => {
      const reasonStr = typeof reason === "string" ? reason : reason.toString("utf-8");
      for (const h of this.closeHandlers) h(code, reasonStr);
    });
  }

  send(data: string): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(data);
    return true;
  }

  close(code = 1000, reason = "client close"): void {
    this.socket?.close(code, reason);
  }

  terminate(): void {
    this.socket?.terminate();
  }

  onOpen(h: () => void): void {
    this.openHandlers.push(h);
  }

  onMessage(h: (data: unknown) => void): void {
    this.messageHandlers.push(h);
  }

  onClose(h: (code: number, reason: string) => void): void {
    this.closeHandlers.push(h);
  }

  onError(h: (error: Error) => void): void {
    this.errorHandlers.push(h);
  }

  removeAllListeners(): void {
    this.openHandlers = [];
    this.messageHandlers = [];
    this.closeHandlers = [];
    this.errorHandlers = [];
  }
}
