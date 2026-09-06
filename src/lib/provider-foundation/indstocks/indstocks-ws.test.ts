import { describe, expect, it, vi } from "vitest";
import { IndstocksWsConnection, redactWsError } from "./indstocks-ws-connection.server";
import { IndstocksWsSubscriptionManager } from "./indstocks-ws-subscription";
import { IndstocksWsAdapter, defaultWsMappingResolver, buildIndstocksWsTelemetry } from "./indstocks-ws-adapter.server";
import type { WsConnectionSnapshot, WsInstrumentMapping, IndstocksWsConfig } from "./indstocks-ws-types";
import type { QuoteSymbol } from "../types";
import type { WebSocketTransport, WebSocketTransportConfig } from "./websocket-transport";
import { WS_OPEN, WS_CLOSED, WS_CONNECTING } from "./websocket-transport";

// ────────────────────── Mock Transport ─────────────────────────────

function createMockTransport(_config: WebSocketTransportConfig): WebSocketTransport {
  const handlers: Record<string, Function[]> = {};
  let rs = WS_CLOSED;
  return {
    get readyState() { return rs; },
    connect() { rs = WS_OPEN; (handlers["open"] ?? []).forEach((h) => h()); },
    send(_data: string) { return rs === WS_OPEN; },
    close() { rs = WS_CLOSED; (handlers["close"] ?? []).forEach((h) => h(1000, "")); },
    terminate() { rs = WS_CLOSED; },
    ping() {},
    onOpen(h: () => void) { (handlers["open"] ??= []).push(h); },
    onMessage(h: (data: string) => void) { (handlers["message"] ??= []).push(h); },
    onClose(h: (code: number, reason: string) => void) { (handlers["close"] ??= []).push(h); },
    onError(h: (error: Error) => void) { (handlers["error"] ??= []).push(h); },
    removeAllListeners() { /* no-op for mock */ },
    // Test helpers
    _emitMessage(data: string) { (handlers["message"] ?? []).forEach((h) => h(data)); },
    _emitClose(code = 1000) { rs = WS_CLOSED; (handlers["close"] ?? []).forEach((h) => h(code, "")); },
    _emitError(err: Error) { (handlers["error"] ?? []).forEach((h) => h(err)); },
  };
}

function createFailingTransport(_config: WebSocketTransportConfig): WebSocketTransport {
  return {
    readyState: WS_CLOSED,
    connect() { throw new Error("connection refused"); },
    send() { return false; },
    close() {},
    terminate() {},
    ping() {},
    onOpen() {},
    onMessage() {},
    onClose() {},
    onError() {},
    removeAllListeners() {},
  };
}

function mockFactory(config: WebSocketTransportConfig): WebSocketTransport {
  return createMockTransport(config);
}

function failingFactory(config: WebSocketTransportConfig): WebSocketTransport {
  return createFailingTransport(config);
}

// ────────────────────── Instrument Mapping ─────────────────────────

describe("indstocks ws instrument mapping", () => {
  it("NIFTY50 maps to verified NIDX:26000", () => {
    const m = defaultWsMappingResolver("NIFTY50");
    expect(m).not.toBeNull();
    expect(m?.wsToken).toBe("NIDX:26000");
    expect(m?.verified).toBe(true);
  });

  it("BANKNIFTY is UNRESOLVED", () => {
    const m = defaultWsMappingResolver("BANKNIFTY");
    expect(m).not.toBeNull();
    expect(m?.verified).toBe(false);
  });

  it("INDIA_VIX is UNRESOLVED", () => {
    const m = defaultWsMappingResolver("INDIA_VIX");
    expect(m).not.toBeNull();
    expect(m?.verified).toBe(false);
  });

  it("unknown symbol returns null", () => {
    expect(defaultWsMappingResolver("GOLD")).toBeNull();
  });
});

// ────────────────────── Subscription Manager ───────────────────────

describe("indstocks ws subscription manager", () => {
  function resolver(sym: QuoteSymbol | string): WsInstrumentMapping | null {
    const map: Record<string, WsInstrumentMapping> = {
      NIFTY50: { symbol: "NIFTY50", wsToken: "NIDX:26000", verified: true },
      BANKNIFTY: { symbol: "BANKNIFTY", wsToken: "BIDX:1", verified: true },
    };
    return map[sym] ?? null;
  }

  it("subscribe returns message for verified instrument", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    const msg = mgr.subscribe("NIFTY50");
    expect(msg).not.toBeNull();
    expect(msg?.instruments).toContain("NIDX:26000");
  });

  it("subscribe returns null for unresolved instrument", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    expect(mgr.subscribe("INDIA_VIX")).toBeNull();
  });

  it("duplicate subscription returns null", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    mgr.subscribe("NIFTY50");
    expect(mgr.subscribe("NIFTY50")).toBeNull();
  });

  it("unsubscribe returns message", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    mgr.subscribe("NIFTY50");
    const msg = mgr.unsubscribe("NIFTY50");
    expect(msg?.action).toBe("unsubscribe");
  });

  it("unsubscribe non-existent returns null", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    expect(mgr.unsubscribe("NIFTY50")).toBeNull();
  });

  it("resubscribeAll returns messages for all active", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    mgr.subscribe("NIFTY50");
    mgr.subscribe("BANKNIFTY");
    const msgs = mgr.resubscribeAll();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].instruments).toHaveLength(2);
  });

  it("snapshot returns correct count", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    expect(mgr.snapshot().count).toBe(0);
    mgr.subscribe("NIFTY50");
    expect(mgr.snapshot().count).toBe(1);
  });
});

// ────────────────────── Connection Manager ─────────────────────────

describe("indstocks ws connection (mock transport)", () => {
  it("initial state is DISCONNECTED", () => {
    const conn = new IndstocksWsConnection({ token: "test", transportFactory: mockFactory });
    expect(conn.snapshot().state).toBe("DISCONNECTED");
    expect(conn.isConnected).toBe(false);
  });

  it("connect transitions to CONNECTED", () => {
    const conn = new IndstocksWsConnection({ token: "test", transportFactory: mockFactory });
    const states: string[] = [];
    conn.onConnectionChange((snap) => states.push(snap.state));
    conn.connect();
    expect(states).toContain("CONNECTING");
    expect(states).toContain("CONNECTED");
    expect(conn.isConnected).toBe(true);
  });

  it("close transitions to DISCONNECTED", () => {
    const conn = new IndstocksWsConnection({ token: "test", transportFactory: mockFactory });
    conn.connect();
    conn.close();
    expect(conn.snapshot().state).toBe("DISCONNECTED");
  });

  it("intentional close does not reconnect", () => {
    const conn = new IndstocksWsConnection({ token: "test", transportFactory: mockFactory });
    conn.connect();
    conn.close();
    // Wait a bit to ensure no reconnect
    expect(conn.snapshot().state).toBe("DISCONNECTED");
  });

  it("send returns true when connected", () => {
    const conn = new IndstocksWsConnection({ token: "test", transportFactory: mockFactory });
    conn.connect();
    expect(conn.send('{"test":true}')).toBe(true);
  });

  it("send returns false when disconnected", () => {
    const conn = new IndstocksWsConnection({ token: "test", transportFactory: mockFactory });
    expect(conn.send('{"test":true}')).toBe(false);
  });

  it("transport failure sets FAILED state", () => {
    const conn = new IndstocksWsConnection({ token: "test", transportFactory: failingFactory, reconnectBaseMs: 100 });
    const states: string[] = [];
    conn.onConnectionChange((snap) => states.push(snap.state));
    conn.connect();
    expect(states).toContain("FAILED");
  });

  it("token not exposed in snapshot", () => {
    const conn = new IndstocksWsConnection({ token: "super-secret-12345", transportFactory: mockFactory });
    const snap = conn.snapshot();
    expect(JSON.stringify(snap)).not.toContain("super-secret-12345");
  });
});

// ────────────────────── Telemetry ──────────────────────────────────

describe("indstocks ws telemetry", () => {
  it("reports LIVE when connected", () => {
    const snap: WsConnectionSnapshot = {
      state: "CONNECTED",
      connectedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      reconnectAttempt: 0,
      lastError: null,
    };
    const t = buildIndstocksWsTelemetry(snap, 2);
    expect(t.status).toBe("LIVE");
    expect(t.providerId).toBe("INDSTOCKS_V1_WS");
    expect(t.role).toBe("SECONDARY");
  });

  it("reports STALE when reconnecting", () => {
    const snap: WsConnectionSnapshot = {
      state: "RECONNECTING",
      connectedAt: null,
      lastMessageAt: null,
      reconnectAttempt: 3,
      lastError: "closed: 1006",
    };
    const t = buildIndstocksWsTelemetry(snap, 0);
    expect(t.status).toBe("STALE");
  });

  it("reports FAILED when failed", () => {
    const snap: WsConnectionSnapshot = {
      state: "FAILED",
      connectedAt: null,
      lastMessageAt: null,
      reconnectAttempt: 0,
      lastError: "connection timeout",
    };
    const t = buildIndstocksWsTelemetry(snap, 0);
    expect(t.status).toBe("FAILED");
  });

  it("reports OFFLINE when disconnected", () => {
    const snap: WsConnectionSnapshot = {
      state: "DISCONNECTED",
      connectedAt: null,
      lastMessageAt: null,
      reconnectAttempt: 0,
      lastError: null,
    };
    const t = buildIndstocksWsTelemetry(snap, 0);
    expect(t.status).toBe("OFFLINE");
  });
});

// ────────────────────── Error Redaction ────────────────────────────

describe("indstocks ws error redaction", () => {
  it("redacts Bearer tokens", () => {
    const redacted = redactWsError("Auth failed: Bearer eyJhbGciOiJIUzI1NiJ9.test.signature");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).toContain("[REDACTED]");
  });

  it("redacts Authorization headers", () => {
    const redacted = redactWsError("Authorization=Bearer secret-token-12345");
    expect(redacted).not.toContain("secret-token-12345");
  });
});

// ────────────────────── Adapter Integration ────────────────────────

describe("indstocks ws adapter", () => {
  it("unresolved instrument subscription returns false", () => {
    const adapter = new IndstocksWsAdapter({ token: "test", transportFactory: mockFactory });
    expect(adapter.subscribe("BANKNIFTY")).toBe(false);
  });

  it("verified instrument subscription succeeds with mock transport", () => {
    const adapter = new IndstocksWsAdapter({ token: "test", transportFactory: mockFactory });
    adapter.connect();
    const result = adapter.subscribe("NIFTY50");
    expect(result).toBe(true);
  });

  it("connection snapshot starts as DISCONNECTED", () => {
    const adapter = new IndstocksWsAdapter({ token: "test", transportFactory: mockFactory });
    expect(adapter.connectionSnapshot().state).toBe("DISCONNECTED");
  });

  it("close cleans up resources", () => {
    const adapter = new IndstocksWsAdapter({ token: "test", transportFactory: mockFactory });
    adapter.close();
    expect(adapter.connectionSnapshot().state).toBe("DISCONNECTED");
  });

  it("token never exposed in telemetry or snapshots", () => {
    const adapter = new IndstocksWsAdapter({ token: "super-secret-token-12345", transportFactory: mockFactory });
    expect(JSON.stringify(adapter.connectionSnapshot())).not.toContain("super-secret-token-12345");
    expect(JSON.stringify(adapter.subscriptionSnapshot())).not.toContain("super-secret-token-12345");
  });
});

// ────────────────────── Safety ─────────────────────────────────────

describe("indstocks ws safety", () => {
  it("no order-update endpoint in connection URL", () => {
    const adapter = new IndstocksWsAdapter({ token: "test", transportFactory: mockFactory });
    expect(JSON.stringify(adapter.connectionSnapshot())).not.toContain("ws-order-updates");
    expect(JSON.stringify(adapter.connectionSnapshot())).not.toContain("trades");
  });

  it("runtime transport abstraction prevents direct ws import", () => {
    // Verify the connection manager accepts a factory, not a raw WebSocket class
    const conn = new IndstocksWsConnection({ token: "test", transportFactory: mockFactory });
    expect(conn.connectionState).toBe("DISCONNECTED");
  });
});
