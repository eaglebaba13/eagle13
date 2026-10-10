import WebSocket from "ws";
import type { WebSocketTransport, WebSocketTransportConfig } from "./websocket-transport";

/** Node-only transport. ws handles protocol ping/pong; no application ping is sent. */
export class NodeWebSocketTransport implements WebSocketTransport {
  private socket: WebSocket | null = null;
  private openHandlers: (() => void)[] = [];
  private messageHandlers: ((data: string) => void)[] = [];
  private closeHandlers: ((code: number, reason: string) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  constructor(private readonly config: WebSocketTransportConfig) {}
  get readyState(): number {
    return this.socket?.readyState ?? WebSocket.CLOSED;
  }
  connect(): void {
    const socket = new WebSocket(this.config.url, {
      headers: this.config.headers,
      handshakeTimeout: this.config.connectionTimeoutMs,
      maxPayload: 1024 * 1024,
      followRedirects: false,
    });
    this.socket = socket;
    socket.on("open", () => this.openHandlers.forEach((h) => h()));
    socket.on("message", (data, binary) => {
      if (!binary) this.messageHandlers.forEach((h) => h(data.toString()));
    });
    socket.on("unexpected-response", (_request, response) => {
      const code = response.statusCode;
      response.resume();
      this.errorHandlers.forEach((h) =>
        h(new Error(code === 401 || code === 403 ? "PROVIDER_AUTH_ERROR" : "PROVIDER_ERROR")),
      );
      socket.terminate();
    });
    socket.on("error", () => this.errorHandlers.forEach((h) => h(new Error("PROVIDER_ERROR"))));
    socket.on("close", (code) => this.closeHandlers.forEach((h) => h(code, "")));
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
  ping(): void {
    /* Server heartbeat only. */
  }
  onOpen(h: () => void): void {
    this.openHandlers.push(h);
  }
  onMessage(h: (data: string) => void): void {
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
