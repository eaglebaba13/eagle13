// Provider-neutral WebSocket transport abstraction.
// Minimal typed interface for connecting to external WebSocket servers.
// Runtime implementations: Cloudflare Workers (fetch+Upgrade), Node ws (tests).

export interface WebSocketTransport {
  connect(): void;
  send(data: string): boolean;
  close(code?: number, reason?: string): void;
  terminate(): void;
  onOpen(handler: () => void): void;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
  onError(handler: (error: Error) => void): void;
  removeAllListeners(): void;
  ping(): void;
  readonly readyState: number;
}

export const WS_CONNECTING = 0;
export const WS_OPEN = 1;
export const WS_CLOSING = 2;
export const WS_CLOSED = 3;

export interface WebSocketTransportConfig {
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly connectionTimeoutMs?: number;
}
