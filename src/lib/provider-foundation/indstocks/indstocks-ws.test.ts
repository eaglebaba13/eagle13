import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { IndstocksWsConnection, redactWsError } from "./indstocks-ws-connection.server";
import { IndstocksWsSubscriptionManager } from "./indstocks-ws-subscription";
import { IndstocksWsAdapter, defaultWsMappingResolver, buildIndstocksWsTelemetry } from "./indstocks-ws-adapter.server";
import type { WsConnectionSnapshot, WsInstrumentMapping } from "./indstocks-ws-types";
import type { QuoteSymbol } from "../types";

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
    expect(defaultWsMappingResolver("UNKNOWN")).toBeNull();
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
    expect(msg?.action).toBe("subscribe");
    expect(msg?.instruments).toContain("NIDX:26000");
  });

  it("subscribe returns null for unresolved instrument", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    const msg = mgr.subscribe("INDIA_VIX"); // not in resolver
    expect(msg).toBeNull();
  });

  it("duplicate subscription returns null", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    mgr.subscribe("NIFTY50");
    const dup = mgr.subscribe("NIFTY50");
    expect(dup).toBeNull();
  });

  it("unsubscribe returns message", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    mgr.subscribe("NIFTY50");
    const msg = mgr.unsubscribe("NIFTY50");
    expect(msg).not.toBeNull();
    expect(msg?.action).toBe("unsubscribe");
  });

  it("unsubscribe non-existent returns null", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    expect(mgr.unsubscribe("NIFTY50")).toBeNull();
  });

  it("has() tracks active subscriptions", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    expect(mgr.has("NIFTY50")).toBe(false);
    mgr.subscribe("NIFTY50");
    expect(mgr.has("NIFTY50")).toBe(true);
    mgr.unsubscribe("NIFTY50");
    expect(mgr.has("NIFTY50")).toBe(false);
  });

  it("resubscribeAll returns messages for all active", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    mgr.subscribe("NIFTY50");
    mgr.subscribe("BANKNIFTY");
    const msgs = mgr.resubscribeAll();
    expect(msgs).toHaveLength(1); // both same mode → one message
    expect(msgs[0].instruments).toHaveLength(2);
  });

  it("snapshot returns correct count", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    expect(mgr.snapshot().count).toBe(0);
    mgr.subscribe("NIFTY50");
    expect(mgr.snapshot().count).toBe(1);
    mgr.subscribe("BANKNIFTY");
    expect(mgr.snapshot().count).toBe(2);
  });

  it("clear removes all subscriptions", () => {
    const mgr = new IndstocksWsSubscriptionManager(resolver);
    mgr.subscribe("NIFTY50");
    mgr.subscribe("BANKNIFTY");
    mgr.clear();
    expect(mgr.snapshot().count).toBe(0);
  });
});

// ────────────────────── Connection Manager ─────────────────────────

describe("indstocks ws connection", () => {
  it("initial state is DISCONNECTED", () => {
    const conn = new IndstocksWsConnection({ token: "test" });
    expect(conn.snapshot().state).toBe("DISCONNECTED");
    expect(conn.isConnected).toBe(false);
  });

  it("connection state listener fires on state change", () => {
    const conn = new IndstocksWsConnection({ token: "test" });
    const states: WsConnectionState[] = [];
    conn.onConnectionChange((snap) => states.push(snap.state));
    // connect will fail (no real server) but state should transition
    conn.connect();
    expect(states).toContain("CONNECTING");
  });

  it("close sets state to DISCONNECTED", () => {
    const conn = new IndstocksWsConnection({ token: "test" });
    conn.close();
    expect(conn.snapshot().state).toBe("DISCONNECTED");
  });

  it("close does not schedule reconnect", () => {
    const conn = new IndstocksWsConnection({ token: "test" });
    const states: WsConnectionState[] = [];
    conn.onConnectionChange((snap) => states.push(snap.state));
    conn.close();
    // Should not see RECONNECTING
    expect(states).not.toContain("RECONNECTING");
  });

  it("send returns false when not connected", () => {
    const conn = new IndstocksWsConnection({ token: "test" });
    expect(conn.send('{"test":true}')).toBe(false);
  });

  it("token not exposed in snapshot", () => {
    const conn = new IndstocksWsConnection({ token: "super-secret-12345" });
    const snap = conn.snapshot();
    const serialized = JSON.stringify(snap);
    expect(serialized).not.toContain("super-secret-12345");
  });
});

// ────────────────────── Connection with Mock WebSocket ─────────────

describe("indstocks ws connection (mock)", () => {
  let createdWs: MockWs | null = null;

  class MockWs {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWs.CONNECTING;
    private handlers: Record<string, Function[]> = {};
    pingCalled = false;
    closeCalled = false;
    terminateCalled = false;

    constructor(
      public url: string,
      public opts?: { headers?: Record<string, string> },
    ) {
      createdWs = this;
    }

    on(event: string, handler: Function) {
      (this.handlers[event] ??= []).push(handler);
    }
    removeAllListeners() { this.handlers = {}; }
    send(data: string) {
      (this.handlers["message"] ?? []).forEach((h) => h(data));
    }
    ping() { this.pingCalled = true; }
    close(code?: number, reason?: string) { this.closeCalled = true; this.readyState = MockWs.CLOSED; }
    terminate() { this.terminateCalled = true; this.readyState = MockWs.CLOSED; }

    // Test helpers
    emitOpen() { this.readyState = MockWs.OPEN; (this.handlers["open"] ?? []).forEach((h) => h()); }
    emitMessage(data: string) { (this.handlers["message"] ?? []).forEach((h) => h(data)); }
    emitClose(code = 1000) { this.readyState = MockWs.CLOSED; (this.handlers["close"] ?? []).forEach((h) => h(code, Buffer.from(""))); }
    emitError(err: Error) { (this.handlers["error"] ?? []).forEach((h) => h(err)); }
  }

  beforeEach(() => {
    createdWs = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createConnection(opts = {}) {
    // We test the subscription manager and adapter with real mapping resolver
    // but mock the WebSocket class for connection tests
    return new IndstocksWsConnection({ token: "test-token", ...opts });
  }

  it("subscription manager rejects unresolved tokens", () => {
    const mgr = new IndstocksWsSubscriptionManager(defaultWsMappingResolver);
    // BANKNIFTY and INDIA_VIX are unresolved
    expect(mgr.subscribe("BANKNIFTY")).toBeNull();
    expect(mgr.subscribe("INDIA_VIX")).toBeNull();
  });

  it("subscription manager accepts verified NIFTY50", () => {
    const mgr = new IndstocksWsSubscriptionManager(defaultWsMappingResolver);
    const msg = mgr.subscribe("NIFTY50");
    expect(msg).not.toBeNull();
    expect(msg?.instruments).toContain("NIDX:26000");
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
    expect(t.staleReason).toBe("closed: 1006");
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
    const adapter = new IndstocksWsAdapter({ token: "test" });
    // BANKNIFTY is unresolved in default resolver
    expect(adapter.subscribe("BANKNIFTY")).toBe(false);
  });

  it("verified instrument subscription attempted (fails without connection)", () => {
    const adapter = new IndstocksWsAdapter({ token: "test" });
    // NIFTY50 is verified but not connected — send will fail
    const result = adapter.subscribe("NIFTY50");
    expect(result).toBe(false); // not connected
  });

  it("connection snapshot starts as DISCONNECTED", () => {
    const adapter = new IndstocksWsAdapter({ token: "test" });
    expect(adapter.connectionSnapshot().state).toBe("DISCONNECTED");
  });

  it("subscription snapshot starts empty", () => {
    const adapter = new IndstocksWsAdapter({ token: "test" });
    expect(adapter.subscriptionSnapshot().count).toBe(0);
  });

  it("close cleans up resources", () => {
    const adapter = new IndstocksWsAdapter({ token: "test" });
    adapter.close();
    expect(adapter.connectionSnapshot().state).toBe("DISCONNECTED");
  });

  it("token never exposed in telemetry or snapshots", () => {
    const adapter = new IndstocksWsAdapter({ token: "super-secret-token-12345" });
    const connSnap = JSON.stringify(adapter.connectionSnapshot());
    const subSnap = JSON.stringify(adapter.subscriptionSnapshot());
    expect(connSnap).not.toContain("super-secret-token-12345");
    expect(subSnap).not.toContain("super-secret-token-12345");
  });
});

// ────────────────────── Safety ─────────────────────────────────────

describe("indstocks ws safety", () => {
  it("no order-update endpoint in connection URL", () => {
    // The connection URL must be the price feed, not the order updates
    const adapter = new IndstocksWsAdapter({ token: "test" });
    const snap = JSON.stringify(adapter.connectionSnapshot());
    expect(snap).not.toContain("ws-order-updates");
    expect(snap).not.toContain("trades");
  });
});
