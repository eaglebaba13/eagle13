import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  candleSchema,
  parseLiveEvent,
  tickFreshness,
  validSelection,
  type LiveCandleEvent,
} from "./live-candle-contract";
import { applyLiveEvent, emptyLiveState } from "../hooks/use-live-candle-sse";
import { LiveMarketStreamManager } from "./live-market-stream.server";
import {
  createLiveMarketProvider,
  type LiveMarketStreamProvider,
} from "./live-market-provider.server";
import { createLiveCandleSSE } from "./live-candle-sse";
import {
  IndstocksWsAdapter,
  defaultWsMappingResolver,
} from "./provider-foundation/indstocks/indstocks-ws-adapter.server";
import { IndstocksWsConnection } from "./provider-foundation/indstocks/indstocks-ws-connection.server";
import type { MarketTick } from "./provider-foundation/indstocks/indstocks-ws-types";
import type { WebSocketTransport } from "./provider-foundation/indstocks/websocket-transport";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function transport() {
  let message: (s: string) => void = () => {};
  let opened: () => void = () => {};
  let closed: (code: number, reason: string) => void = () => {};
  let error: (e: Error) => void = () => {};
  const t: WebSocketTransport = {
    connect: vi.fn(() => opened()),
    send: vi.fn(() => true),
    close: vi.fn(),
    terminate: vi.fn(),
    onOpen: (h) => {
      opened = h;
    },
    onMessage: (h) => {
      message = h;
    },
    onClose: (h) => {
      closed = h;
    },
    onError: (h) => {
      error = h;
    },
    removeAllListeners: vi.fn(),
    ping: vi.fn(),
    readyState: 1,
  };
  return {
    t,
    message: (s: string) => message(s),
    close: () => closed(1006, ""),
    authError: () => error(new Error("PROVIDER_AUTH_ERROR")),
  };
}
function provider() {
  let listener: (t: MarketTick) => void = () => {};
  const p: LiveMarketStreamProvider = {
    id: "INDSTOCKS_V1",
    connect: vi.fn(),
    close: vi.fn(),
    subscribe: vi.fn(() => true),
    unsubscribe: vi.fn(() => true),
    onTick: (h) => {
      listener = h;
      return () => {};
    },
    isConnected: true,
    connectionSnapshot: () => ({
      state: "CONNECTED",
      connectedAt: null,
      lastMessageAt: null,
      reconnectAttempt: 0,
      lastError: null,
    }),
  };
  return { p, emit: (tick: MarketTick) => listener(tick) };
}
const tick = (timestamp: string, volume: number | null = null): MarketTick => ({
  instrument: "NIFTY50",
  provider: "INDSTOCKS_V1",
  timestamp,
  ltp: 25001,
  bid: null,
  ask: null,
  volume,
  source: "LTP",
  freshness: "LIVE",
  quality: "OK",
});
const event: LiveCandleEvent = {
  type: "candle_update",
  symbol: "NIFTY50",
  intervalMs: 60000,
  candle: { time: 1750000020000, open: 25000, high: 25002, low: 24999, close: 25001, volume: null },
  completed: false,
  provider: "INDSTOCKS_V1",
  freshness: "LIVE",
  quality: "OK",
  timestamp: "2026-09-28T06:00:00.000Z",
  lastTick: "2026-09-28T06:00:00.000Z",
  lastLtp: 25001,
  connectionState: "CONNECTED",
  tickCount: 1,
};

describe("P0.1 fail-closed market pipeline", () => {
  it("selects INDstocks explicitly and rejects other provider selections", () => {
    expect(createLiveMarketProvider().id).toBe("INDSTOCKS_V1");
    expect(() => createLiveMarketProvider("UPSTOX")).toThrow("UNVERIFIED_LIVE_PROVIDER");
  });
  it("missing credentials never create a transport or tick", () => {
    vi.stubEnv("INDSTOCKS_ACCESS_TOKEN", "");
    const factory = vi.fn(() => transport().t);
    const adapter = new IndstocksWsAdapter({ transportFactory: factory });
    const callback = vi.fn();
    adapter.onTick(callback);
    adapter.connect();
    expect(adapter.connectionSnapshot()).toMatchObject({
      state: "FAILED",
      lastError: "CONFIGURATION_ERROR",
    });
    expect(factory).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    adapter.close();
  });
  it("uses the verified NIFTY mapping and rejects unresolved symbols", () => {
    expect(defaultWsMappingResolver("NIFTY50")?.wsToken).toBe("NIDX:26000");
    for (const symbol of ["BANKNIFTY", "INDIA_VIX", "FINNIFTY"])
      expect(validSelection(symbol, 60000)).toBe(false);
  });
  it("queues NIFTY before connect, parses the official envelope, and rejects missing timestamps", () => {
    const f = transport();
    const adapter = new IndstocksWsAdapter({ token: "test-only", transportFactory: () => f.t });
    const callback = vi.fn();
    adapter.onTick(callback);
    expect(adapter.subscribe("NIFTY50")).toBe(true);
    adapter.connect();
    expect(f.t.send).toHaveBeenCalledWith(
      JSON.stringify({ action: "subscribe", mode: "ltp", instruments: ["NIDX:26000"] }),
    );
    const timestamp = Date.now();
    f.message(
      JSON.stringify({ mode: "ltp", instrument: "26000", timestamp, data: { ltp: 25001 } }),
    );
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        instrument: "NIFTY50",
        timestamp: new Date(timestamp).toISOString(),
        volume: null,
        provider: "INDSTOCKS_V1",
      }),
    );
    f.message(JSON.stringify({ mode: "ltp", instrument: "26000", data: { ltp: 25001 } }));
    expect(callback).toHaveBeenCalledTimes(1);
    adapter.close();
  });
  it("auth failure terminates retries without ticks", () => {
    vi.useFakeTimers();
    const f = transport();
    const adapter = new IndstocksWsAdapter({ token: "test-only", transportFactory: () => f.t });
    const callback = vi.fn();
    adapter.onTick(callback);
    adapter.connect();
    f.authError();
    f.close();
    vi.advanceTimersByTime(120000);
    expect(adapter.connectionSnapshot().state).toBe("FAILED");
    expect(callback).not.toHaveBeenCalled();
    adapter.close();
  });
  it("connection failures have bounded retries", () => {
    vi.useFakeTimers();
    const f = transport();
    f.t.connect = () => {
      throw new Error("unavailable");
    };
    const factory = vi.fn(() => f.t);
    const c = new IndstocksWsConnection({ token: "test-only", transportFactory: factory });
    c.connect();
    vi.advanceTimersByTime(120000);
    expect(c.snapshot().state).toBe("FAILED");
    expect(factory).toHaveBeenCalledTimes(6);
    c.close();
  });
  it("resubscribes after reconnect", () => {
    vi.useFakeTimers();
    const f = transport();
    const adapter = new IndstocksWsAdapter({ token: "test-only", transportFactory: () => f.t });
    adapter.subscribe("NIFTY50");
    const subscribeMessage = JSON.stringify({
      action: "subscribe",
      mode: "ltp",
      instruments: ["NIDX:26000"],
    });
    try {
      // A disconnected subscription is queued, never sent to the transport.
      expect(f.t.send).not.toHaveBeenCalled();
      adapter.connect();
      expect(vi.mocked(f.t.send).mock.calls).toEqual([[subscribeMessage]]);
      f.close();
      expect(adapter.connectionSnapshot().state).toBe("RECONNECTING");
      vi.advanceTimersByTime(999);
      expect(vi.mocked(f.t.send).mock.calls).toEqual([[subscribeMessage]]);
      vi.advanceTimersByTime(1);
      expect(adapter.connectionSnapshot().state).toBe("CONNECTED");
      expect(vi.mocked(f.t.send).mock.calls).toEqual([[subscribeMessage], [subscribeMessage]]);
      adapter.close();
      vi.advanceTimersByTime(120000);
      expect(vi.mocked(f.t.send).mock.calls).toEqual([[subscribeMessage], [subscribeMessage]]);
    } finally {
      adapter.close();
    }
  });
  it("validates nested serialized candles and preserves null and explicit zero volume", () => {
    for (const volume of [null, 0, 18]) {
      const wire = JSON.parse(JSON.stringify({ ...event, candle: { ...event.candle, volume } }));
      const parsed = parseLiveEvent(wire, "NIFTY50", 60000);
      expect(parsed).not.toBeNull();
      const state = applyLiveEvent(emptyLiveState(), parsed!);
      expect(state.currentCandle).toMatchObject({
        time: event.candle.time,
        open: 25000,
        volume,
        provider: "INDSTOCKS_V1",
      });
    }
  });
  it("rejects invalid prices, timestamps, volume and mismatched selections", () => {
    for (const patch of [{ open: 0 }, { high: 1 }, { low: 99999 }, { time: NaN }, { volume: -1 }])
      expect(candleSchema.safeParse({ ...event.candle, ...patch }).success).toBe(false);
    expect(parseLiveEvent(event, "BANKNIFTY", 60000)).toBeNull();
    expect(parseLiveEvent(event, "NIFTY50", 300000)).toBeNull();
    expect(emptyLiveState().currentCandle).toBeNull();
    expect(emptyLiveState().completedCandles.size).toBe(0);
  });
  it("freshness uses provider time, not socket connection", () => {
    const now = Date.now();
    expect(tickFreshness(null, now)).toBe("NO_DATA");
    expect(tickFreshness(new Date(now - 31000).toISOString(), now)).toBe("STALE");
    const f = provider();
    const mgr = new LiveMarketStreamManager(() => f.p);
    mgr.start();
    mgr.subscribe("NIFTY50");
    expect(mgr.getSnapshot("NIFTY50").telemetry.status).not.toBe("LIVE");
    f.emit(tick(new Date(now - 31000).toISOString()));
    expect(mgr.getSnapshot("NIFTY50").telemetry.status).toBe("STALE");
    mgr.stop();
  });
  it("preserves volume, ignores old/duplicate ticks and isolates intervals", () => {
    const f = provider();
    const mgr = new LiveMarketStreamManager(() => f.p);
    mgr.start();
    mgr.subscribe("NIFTY50");
    mgr.subscribe("NIFTY50", 300000);
    const now = Date.now();
    const t = tick(new Date(now - 1000).toISOString(), 12);
    f.emit(t);
    f.emit(t);
    f.emit(tick(new Date(now - 2000).toISOString(), 99));
    expect(mgr.getSnapshot("NIFTY50").currentCandle?.volume).toBe(12);
    mgr.unsubscribe("NIFTY50");
    expect(mgr.getSnapshot("NIFTY50", 300000).currentCandle).not.toBeNull();
    expect(f.p.unsubscribe).not.toHaveBeenCalled();
    mgr.unsubscribe("NIFTY50", 300000);
    expect(f.p.close).toHaveBeenCalledOnce();
  });
  it("SSE cancellation releases exactly one reference and stops the last stream", async () => {
    const f = provider();
    const mgr = new LiveMarketStreamManager(() => f.p);
    const a = createLiveCandleSSE("NIFTY50", 60000, undefined, mgr).body!.getReader();
    const b = createLiveCandleSSE("NIFTY50", 60000, undefined, mgr).body!.getReader();
    await a.read();
    await b.read();
    await a.cancel();
    expect(f.p.close).not.toHaveBeenCalled();
    await b.cancel();
    expect(f.p.unsubscribe).toHaveBeenCalledOnce();
    expect(f.p.close).toHaveBeenCalledOnce();
  });
  it("SSE abort releases its subscription once and removes status timers", async () => {
    vi.useFakeTimers();
    const f = provider();
    const mgr = new LiveMarketStreamManager(() => f.p);
    const controller = new AbortController();
    const reader = createLiveCandleSSE("NIFTY50", 60000, controller.signal, mgr).body!.getReader();
    await reader.read();
    controller.abort();
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    await reader.cancel();
    vi.advanceTimersByTime(10000);
    expect(f.p.unsubscribe).toHaveBeenCalledOnce();
    expect(f.p.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("an already-aborted SSE request never starts a provider", async () => {
    const f = provider();
    const factory = vi.fn(() => f.p);
    const mgr = new LiveMarketStreamManager(factory);
    const controller = new AbortController();
    controller.abort();
    const reader = createLiveCandleSSE("NIFTY50", 60000, controller.signal, mgr).body!.getReader();
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(factory).not.toHaveBeenCalled();
  });
  it("empty real candle series remains empty", () => {
    const f = provider();
    const mgr = new LiveMarketStreamManager(() => f.p);
    expect(mgr.getCandleSeries("NIFTY50")).toEqual([]);
  });
  it("production chart and adapters contain no market generators", () => {
    for (const path of [
      "src/routes/live-chart.tsx",
      "src/lib/provider-foundation/upstox/upstox-ws-adapter.server.ts",
      "src/lib/live-market-stream.server.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/generateMockCandles|basePrices|startLocalSimulator|Math\.random/);
    }
    const chart = readFileSync("src/routes/live-chart.tsx", "utf8");
    expect(chart).toContain("NO MARKET DATA");
    expect(chart).toContain("PROVIDER ERROR:");
    expect(chart).toContain("if (candles.length === 0)");
  });
});
