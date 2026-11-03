import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UpstoxWsAdapter,
  UPSTOX_WS_ADAPTER_ID,
  UPSTOX_INSTRUMENT_MAP,
  REVERSE_INSTRUMENT_MAP,
  type GenericSocket,
} from "./upstox-ws-adapter.server";
import { decodeUpstoxFeedResponse, type DecodedFeedResponse } from "./upstox-protobuf-wire-decoder";
import {
  createLiveMarketProvider,
  getActiveLiveMarketProvider,
} from "@/lib/live-market-provider.server";
import {
  aggregateTick,
  createAggregatorState,
  type CandleAggregatorState,
} from "../indstocks/candle-aggregator";
import { candleSchema, liveEventSchema, type LiveCandleEvent } from "@/lib/live-candle-contract";
import type { MarketTick } from "../indstocks/indstocks-ws-types";

// ────────────────────── Protobuf Encoding Helpers ───────────────────

class TestProtoWriter {
  private chunks: Uint8Array[] = [];

  writeVarint(value: number | bigint): this {
    let v = BigInt(value);
    const bytes: number[] = [];
    while (v >= 0x80n) {
      bytes.push(Number((v & 0x7fn) | 0x80n));
      v >>= 7n;
    }
    bytes.push(Number(v & 0x7fn));
    this.chunks.push(new Uint8Array(bytes));
    return this;
  }

  writeTag(fieldNumber: number, wireType: number): this {
    return this.writeVarint((fieldNumber << 3) | wireType);
  }

  writeDouble(fieldNumber: number, value: number): this {
    this.writeTag(fieldNumber, 1);
    const buf = new Uint8Array(8);
    new DataView(buf.buffer, buf.byteOffset, 8).setFloat64(0, value, true);
    this.chunks.push(buf);
    return this;
  }

  writeVarintField(fieldNumber: number, value: number | bigint): this {
    this.writeTag(fieldNumber, 0);
    return this.writeVarint(value);
  }

  writeString(fieldNumber: number, str: string): this {
    this.writeTag(fieldNumber, 2);
    const encoded = new TextEncoder().encode(str);
    this.writeVarint(encoded.length);
    this.chunks.push(encoded);
    return this;
  }

  writeMessage(fieldNumber: number, msgBytes: Uint8Array): this {
    this.writeTag(fieldNumber, 2);
    this.writeVarint(msgBytes.length);
    this.chunks.push(msgBytes);
    return this;
  }

  toUint8Array(): Uint8Array {
    let totalLen = 0;
    for (const c of this.chunks) totalLen += c.length;
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of this.chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }
}

function makeIndexFeedFrame(
  instrumentKey: string,
  ltp?: number,
  ltt?: number,
  ltq = 0,
  cp = 23000.0,
): Uint8Array {
  // LTPC
  const ltpcW = new TestProtoWriter();
  if (ltp !== undefined) ltpcW.writeDouble(1, ltp);
  if (ltt !== undefined) ltpcW.writeVarintField(2, ltt);
  ltpcW.writeVarintField(3, ltq);
  ltpcW.writeDouble(4, cp);
  const ltpcBytes = ltpcW.toUint8Array();

  // IndexFullFeed (field 1: ltpc)
  const indexW = new TestProtoWriter();
  indexW.writeMessage(1, ltpcBytes);
  const indexFFBytes = indexW.toUint8Array();

  // FullFeed (field 2: indexFF)
  const fullW = new TestProtoWriter();
  fullW.writeMessage(2, indexFFBytes);
  const fullFeedBytes = fullW.toUint8Array();

  // Feed (field 2: fullFeed)
  const feedW = new TestProtoWriter();
  feedW.writeMessage(2, fullFeedBytes);
  const feedBytes = feedW.toUint8Array();

  // Map Entry: key = 1, feed = 2
  const mapW = new TestProtoWriter();
  mapW.writeString(1, instrumentKey);
  mapW.writeMessage(2, feedBytes);
  const mapBytes = mapW.toUint8Array();

  // FeedResponse: type = 1, feeds = 2
  const respW = new TestProtoWriter();
  respW.writeVarintField(1, 1); // live_feed
  respW.writeMessage(2, mapBytes);
  return respW.toUint8Array();
}

function makeMarketFeedFrame(
  instrumentKey: string,
  ltp: number,
  ltt: number,
  ltq = 10,
): Uint8Array {
  // LTPC
  const ltpcW = new TestProtoWriter();
  ltpcW.writeDouble(1, ltp);
  ltpcW.writeVarintField(2, ltt);
  ltpcW.writeVarintField(3, ltq);
  ltpcW.writeDouble(4, ltp * 0.99);
  const ltpcBytes = ltpcW.toUint8Array();

  // MarketFullFeed (field 1: ltpc)
  const marketW = new TestProtoWriter();
  marketW.writeMessage(1, ltpcBytes);
  const marketFFBytes = marketW.toUint8Array();

  // FullFeed (field 1: marketFF)
  const fullW = new TestProtoWriter();
  fullW.writeMessage(1, marketFFBytes);
  const fullFeedBytes = fullW.toUint8Array();

  // Feed (field 2: fullFeed)
  const feedW = new TestProtoWriter();
  feedW.writeMessage(2, fullFeedBytes);
  const feedBytes = feedW.toUint8Array();

  // Map Entry
  const mapW = new TestProtoWriter();
  mapW.writeString(1, instrumentKey);
  mapW.writeMessage(2, feedBytes);
  const mapBytes = mapW.toUint8Array();

  // FeedResponse
  const respW = new TestProtoWriter();
  respW.writeVarintField(1, 1);
  respW.writeMessage(2, mapBytes);
  return respW.toUint8Array();
}

// ────────────────────── Mock Socket Helper ──────────────────────────

class MockUpstoxSocket implements GenericSocket {
  readyState = 0; // CONNECTING
  binaryType = "arraybuffer";
  sent: string[] = [];
  closed = false;

  private _onopen: ((event: unknown) => void) | null = null;
  get onopen(): ((event: unknown) => void) | null {
    return this._onopen;
  }
  set onopen(fn: ((event: unknown) => void) | null) {
    this._onopen = fn;
    if (fn && !this.closed) {
      queueMicrotask(() => {
        if (!this.closed && this.readyState !== 3) {
          this.readyState = 1; // OPEN
          this._onopen?.({});
        }
      });
    }
  }

  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: unknown }) => void) | null = null;

  send(data: string | ArrayBuffer | Uint8Array): void {
    if (typeof data === "string") {
      this.sent.push(data);
    }
  }

  close(code = 1000, reason = "client close"): void {
    this.closed = true;
    this.readyState = 3; // CLOSED
    this.onclose?.({ code, reason });
  }

  triggerOpen(): void {
    this.readyState = 1;
    this._onopen?.({});
  }

  triggerBinaryMessage(bytes: Uint8Array): void {
    this.onmessage?.({ data: bytes });
  }

  triggerTextMessage(text: string): void {
    this.onmessage?.({ data: text });
  }

  triggerError(msg: string): void {
    this.onerror?.(new Error(msg));
  }

  triggerClose(code = 1006, reason = "abnormal closure"): void {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

// ────────────────────── Test Suite ──────────────────────────────────

describe("Upstox V3 Market Data Streaming Integration", () => {
  const BASE_TIME = 1762151600000;
  let mockSocket: MockUpstoxSocket;

  beforeEach(() => {
    mockSocket = new MockUpstoxSocket();
    vi.stubEnv("UPSTOX_MARKET_DATA_MODE", "live");
    vi.stubEnv("UPSTOX_ACCESS_TOKEN", "test-valid-access-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: { authorized_redirect_uri: "wss://api.upstox.com/v3/feed/market-data-feed" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // 1 & 4. Valid Protobuf & indexFF Decoding
  it("1 & 4. Decodes indexFF frame into normalized MarketTick for NIFTY50", async () => {
    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
      nowMs: () => BASE_TIME,
    });

    const ticks: MarketTick[] = [];
    adapter.onTick((t) => ticks.push(t));

    adapter.subscribe("NIFTY50");
    await vi.waitFor(() => expect(adapter.isConnected).toBe(true));

    const frame = makeIndexFeedFrame("NSE_INDEX|Nifty 50", 23810.85, BASE_TIME - 1000);
    mockSocket.triggerBinaryMessage(frame);

    expect(ticks).toHaveLength(1);
    const tick = ticks[0]!;
    expect(tick.instrument).toBe("NIFTY50");
    expect(tick.provider).toBe(UPSTOX_WS_ADAPTER_ID);
    expect(tick.ltp).toBeCloseTo(23810.85, 2);
    expect(tick.timestamp).toBe(new Date(BASE_TIME - 1000).toISOString());
    expect(tick.freshness).toBe("LIVE");
    expect(tick.quality).toBe("OK");
    expect(tick.source).toBe("LTP");
    adapter.close();
  });

  // 3. marketFF Decoding
  it("3. Decodes marketFF frame for commodities (GOLD)", async () => {
    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
      nowMs: () => BASE_TIME,
    });

    const ticks: MarketTick[] = [];
    adapter.onTick((t) => ticks.push(t));

    adapter.subscribe("GOLD");
    await vi.waitFor(() => expect(adapter.isConnected).toBe(true));

    const frame = makeMarketFeedFrame("MCX_FO|GOLD", 78500.0, BASE_TIME - 500);
    mockSocket.triggerBinaryMessage(frame);

    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.instrument).toBe("GOLD");
    expect(ticks[0]?.ltp).toBe(78500.0);
    adapter.close();
  });

  // 2. Malformed Protobuf frames
  it("2. Safely ignores malformed or truncated binary frames without crashing", async () => {
    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
      nowMs: () => BASE_TIME,
    });

    const ticks: MarketTick[] = [];
    adapter.onTick((t) => ticks.push(t));
    adapter.subscribe("NIFTY50");
    await vi.waitFor(() => expect(adapter.isConnected).toBe(true));

    // Send garbage truncated bytes
    mockSocket.triggerBinaryMessage(new Uint8Array([0x08, 0x01, 0x12, 0xff]));
    expect(ticks).toHaveLength(0);

    // Send non-protobuf ASCII text frame
    mockSocket.triggerTextMessage("random text or ping");
    expect(ticks).toHaveLength(0);

    // Follow with valid tick — adapter must remain functional
    const frame = makeIndexFeedFrame("NSE_INDEX|Nifty 50", 23815.0, BASE_TIME);
    mockSocket.triggerBinaryMessage(frame);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.ltp).toBe(23815.0);
    adapter.close();
  });

  // 5 & 7. LTPC Normalization & Price Precision
  it("5 & 7. Normalizes LTPC and preserves float64 price precision without scaling", async () => {
    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
      nowMs: () => BASE_TIME,
    });

    const ticks: MarketTick[] = [];
    adapter.onTick((t) => ticks.push(t));
    adapter.subscribe("NIFTY50");
    await vi.waitFor(() => expect(adapter.isConnected).toBe(true));

    const highPrecisionPrice = 23810.8512345;
    const frame = makeIndexFeedFrame("NSE_INDEX|Nifty 50", highPrecisionPrice, BASE_TIME);
    mockSocket.triggerBinaryMessage(frame);

    expect(ticks[0]?.ltp).toBe(highPrecisionPrice);
    adapter.close();
  });

  // 6 & 9. Timestamp conversion & Stale validation
  it("6 & 9. Flags tick as STALE when timestamp is older than 30s", async () => {
    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
      nowMs: () => BASE_TIME,
    });

    const ticks: MarketTick[] = [];
    adapter.onTick((t) => ticks.push(t));
    adapter.subscribe("NIFTY50");
    await vi.waitFor(() => expect(adapter.isConnected).toBe(true));

    // Tick 45 seconds in the past -> STALE
    const staleTime = BASE_TIME - 45_000;
    const frame = makeIndexFeedFrame("NSE_INDEX|Nifty 50", 23800.0, staleTime);
    mockSocket.triggerBinaryMessage(frame);

    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.freshness).toBe("STALE");
    expect(ticks[0]?.timestamp).toBe(new Date(staleTime).toISOString());
    adapter.close();
  });

  // 8. Missing and invalid fields (zero or negative prices)
  it("8. Rejects ticks with zero, negative or missing prices", async () => {
    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
      nowMs: () => BASE_TIME,
    });

    const ticks: MarketTick[] = [];
    adapter.onTick((t) => ticks.push(t));
    adapter.subscribe("NIFTY50");
    await vi.waitFor(() => expect(adapter.isConnected).toBe(true));

    // Zero price
    mockSocket.triggerBinaryMessage(makeIndexFeedFrame("NSE_INDEX|Nifty 50", 0, BASE_TIME));
    // Negative price
    mockSocket.triggerBinaryMessage(makeIndexFeedFrame("NSE_INDEX|Nifty 50", -100.5, BASE_TIME));
    // Missing LTP
    mockSocket.triggerBinaryMessage(makeIndexFeedFrame("NSE_INDEX|Nifty 50", undefined, BASE_TIME));

    expect(ticks).toHaveLength(0);
    adapter.close();
  });

  // 9. Out-of-order rejection
  it("9. Discards out-of-order ticks with earlier exchange timestamps", async () => {
    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
      nowMs: () => BASE_TIME,
    });

    const ticks: MarketTick[] = [];
    adapter.onTick((t) => ticks.push(t));
    adapter.subscribe("NIFTY50");
    await vi.waitFor(() => expect(adapter.isConnected).toBe(true));

    // Tick 1: Time T
    mockSocket.triggerBinaryMessage(makeIndexFeedFrame("NSE_INDEX|Nifty 50", 23800.0, BASE_TIME));
    expect(ticks).toHaveLength(1);

    // Tick 2: Time T - 1000ms (Out-of-order arriving tick)
    mockSocket.triggerBinaryMessage(
      makeIndexFeedFrame("NSE_INDEX|Nifty 50", 23799.0, BASE_TIME - 1000),
    );
    expect(ticks).toHaveLength(1); // Discarded!

    // Tick 3: Time T + 1000ms (Later tick)
    mockSocket.triggerBinaryMessage(
      makeIndexFeedFrame("NSE_INDEX|Nifty 50", 23805.0, BASE_TIME + 1000),
    );
    expect(ticks).toHaveLength(2);
    expect(ticks[1]?.ltp).toBe(23805.0);
    adapter.close();
  });

  // 10. Duplicate events
  it("10. Discards exact duplicate ticks (identical timestamp and price)", async () => {
    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
      nowMs: () => BASE_TIME,
    });

    const ticks: MarketTick[] = [];
    adapter.onTick((t) => ticks.push(t));
    adapter.subscribe("NIFTY50");
    await vi.waitFor(() => expect(adapter.isConnected).toBe(true));

    // Emit tick
    mockSocket.triggerBinaryMessage(makeIndexFeedFrame("NSE_INDEX|Nifty 50", 23800.0, BASE_TIME));
    expect(ticks).toHaveLength(1);

    // Emit identical tick again
    mockSocket.triggerBinaryMessage(makeIndexFeedFrame("NSE_INDEX|Nifty 50", 23800.0, BASE_TIME));
    expect(ticks).toHaveLength(1); // Discarded duplicate!
    adapter.close();
  });

  // 15, 16, 17. Multi-instrument mapping (NIFTY50, BANKNIFTY, INDIA VIX)
  it("15, 16, 17. Validates verified instrument mappings for NIFTY50, BANKNIFTY, and INDIA VIX", async () => {
    expect(UPSTOX_INSTRUMENT_MAP["NIFTY50"]).toBe("NSE_INDEX|Nifty 50");
    expect(UPSTOX_INSTRUMENT_MAP["BANKNIFTY"]).toBe("NSE_INDEX|Nifty Bank");
    expect(UPSTOX_INSTRUMENT_MAP["INDIA_VIX"]).toBe("NSE_INDEX|India VIX");

    expect(REVERSE_INSTRUMENT_MAP["NSE_INDEX|Nifty 50"]).toBe("NIFTY50");
    expect(REVERSE_INSTRUMENT_MAP["NSE_INDEX|Nifty Bank"]).toBe("BANKNIFTY");
    expect(REVERSE_INSTRUMENT_MAP["NSE_INDEX|India VIX"]).toBe("INDIA_VIX");

    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
      nowMs: () => BASE_TIME,
    });

    const received: Record<string, number> = {};
    adapter.onTick((t) => {
      received[t.instrument] = t.ltp;
    });

    adapter.subscribe("NIFTY50");
    adapter.subscribe("BANKNIFTY");
    adapter.subscribe("INDIA_VIX");
    await vi.waitFor(() => expect(adapter.isConnected).toBe(true));

    mockSocket.triggerBinaryMessage(makeIndexFeedFrame("NSE_INDEX|Nifty 50", 23810.85, BASE_TIME));
    mockSocket.triggerBinaryMessage(
      makeIndexFeedFrame("NSE_INDEX|Nifty Bank", 55540.05, BASE_TIME),
    );
    mockSocket.triggerBinaryMessage(makeIndexFeedFrame("NSE_INDEX|India VIX", 15.72, BASE_TIME));

    expect(received["NIFTY50"]).toBeCloseTo(23810.85, 2);
    expect(received["BANKNIFTY"]).toBeCloseTo(55540.05, 2);
    expect(received["INDIA_VIX"]).toBeCloseTo(15.72, 2);
    adapter.close();
  });

  // 11 & 12. WebSocket disconnect & resubscription
  it("11 & 12. Reconnects and re-subscribes active instruments on socket drop", async () => {
    const socketInstances: MockUpstoxSocket[] = [];
    const adapter = new UpstoxWsAdapter({
      socketFactory: () => {
        const s = new MockUpstoxSocket();
        socketInstances.push(s);
        return s;
      },
      reconnectBaseMs: 50,
    });

    adapter.subscribe("NIFTY50");
    adapter.subscribe("BANKNIFTY");

    // Advance to let fetch and connection establish
    await vi.waitFor(() => expect(socketInstances).toHaveLength(1));
    await vi.waitFor(() => expect(adapter.connectionSnapshot().state).toBe("CONNECTED"));

    // Check sent subscription message
    await vi.waitFor(() => expect(socketInstances[0]!.sent.length).toBeGreaterThan(0));
    const firstSub = JSON.parse(socketInstances[0]!.sent[0]!);
    expect(firstSub.data.instrumentKeys).toContain("NSE_INDEX|Nifty 50");
    expect(firstSub.data.instrumentKeys).toContain("NSE_INDEX|Nifty Bank");

    // Simulate unexpected drop
    socketInstances[0]!.triggerClose(1006, "abnormal closure");
    expect(adapter.connectionSnapshot().state).toBe("DISCONNECTED");

    // Wait for reconnect to establish new socket instance (50ms base backoff)
    await vi.waitFor(() => expect(socketInstances).toHaveLength(2), { timeout: 2000 });
    await vi.waitFor(() => expect(adapter.connectionSnapshot().state).toBe("CONNECTED"));

    // Verify re-subscription was sent on the new socket
    await vi.waitFor(() => expect(socketInstances[1]!.sent.length).toBeGreaterThan(0));
    const secondSub = JSON.parse(socketInstances[1]!.sent[0]!);
    expect(secondSub.data.instrumentKeys).toContain("NSE_INDEX|Nifty 50");
    expect(secondSub.data.instrumentKeys).toContain("NSE_INDEX|Nifty Bank");

    adapter.close();
  });

  // 13. Candle aggregation compatibility
  it("13. Upstox ticks feed into CandleAggregator and produce compliant LiveCandle", async () => {
    let aggState: CandleAggregatorState = createAggregatorState("NIFTY50", 60_000);

    // Sequence of 4 ticks within same 1m bucket
    const bucketStart = 1762151640000;
    const ticks: MarketTick[] = [
      {
        instrument: "NIFTY50",
        provider: UPSTOX_WS_ADAPTER_ID,
        timestamp: new Date(bucketStart + 1000).toISOString(),
        ltp: 23800.0,
        bid: null,
        ask: null,
        volume: null,
        source: "LTP",
        freshness: "LIVE",
        quality: "OK",
      },
      {
        instrument: "NIFTY50",
        provider: UPSTOX_WS_ADAPTER_ID,
        timestamp: new Date(bucketStart + 15000).toISOString(),
        ltp: 23820.0,
        bid: null,
        ask: null,
        volume: null,
        source: "LTP",
        freshness: "LIVE",
        quality: "OK",
      },
      {
        instrument: "NIFTY50",
        provider: UPSTOX_WS_ADAPTER_ID,
        timestamp: new Date(bucketStart + 30000).toISOString(),
        ltp: 23790.0,
        bid: null,
        ask: null,
        volume: null,
        source: "LTP",
        freshness: "LIVE",
        quality: "OK",
      },
      {
        instrument: "NIFTY50",
        provider: UPSTOX_WS_ADAPTER_ID,
        timestamp: new Date(bucketStart + 55000).toISOString(),
        ltp: 23815.0,
        bid: null,
        ask: null,
        volume: null,
        source: "LTP",
        freshness: "LIVE",
        quality: "OK",
      },
    ];

    for (const t of ticks) {
      aggState = aggregateTick(aggState, t);
    }

    const candle = aggState.current;
    expect(candle).not.toBeNull();
    if (!candle) return;

    expect(candle.open).toBe(23800.0);
    expect(candle.high).toBe(23820.0);
    expect(candle.low).toBe(23790.0);
    expect(candle.close).toBe(23815.0);
    expect(candle.tickCount).toBe(4);

    // Validate against strict candleSchema
    const parseResult = candleSchema.safeParse({
      time: candle.bucketMs,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    });
    expect(parseResult.success).toBe(true);
  });

  // 14. SSE contract compatibility
  it("14. Emitted event matches the strict LiveCandleEvent schema", () => {
    const sseEvent: LiveCandleEvent = {
      type: "candle_update",
      symbol: "NIFTY50",
      intervalMs: 60_000,
      provider: UPSTOX_WS_ADAPTER_ID,
      freshness: "LIVE",
      quality: "OK",
      lastTick: new Date(BASE_TIME).toISOString(),
      lastLtp: 23810.85,
      connectionState: "CONNECTED",
      candle: {
        time: BASE_TIME,
        open: 23800.0,
        high: 23820.0,
        low: 23790.0,
        close: 23810.85,
        volume: null,
      },
      completed: false,
      timestamp: new Date(BASE_TIME).toISOString(),
      tickCount: 1,
    };

    const validated = liveEventSchema.safeParse(sseEvent);
    expect(validated.success).toBe(true);
  });

  // 18. Provider failure and fail-closed behavior
  it("18. Fails closed and reports offline telemetry on missing token", () => {
    vi.stubEnv("UPSTOX_ACCESS_TOKEN", "");
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "");

    const adapter = new UpstoxWsAdapter({
      socketFactory: () => mockSocket,
    });

    adapter.connect();

    expect(adapter.connectionSnapshot().state).toBe("DISCONNECTED");
    expect(adapter.connectionSnapshot().lastError).toBe("CONFIGURATION_ERROR");
    expect(adapter.isConnected).toBe(false);

    const telemetry = adapter.telemetry();
    expect(telemetry.status).toBe("OFFLINE");
    expect(telemetry.providerId).toBe(UPSTOX_WS_ADAPTER_ID);
    expect(telemetry.staleReason).toBe("CONFIGURATION_ERROR");
    adapter.close();
  });

  // Feature Flag Validation
  describe("Provider Feature Flag (LIVE_MARKET_PROVIDER)", () => {
    it("defaults strictly to INDSTOCKS when unset", () => {
      vi.stubEnv("LIVE_MARKET_PROVIDER", "");
      expect(getActiveLiveMarketProvider()).toBe("INDSTOCKS");
      const provider = createLiveMarketProvider();
      expect(provider.id).toBe("INDSTOCKS_V1");
    });

    it("activates Upstox only when LIVE_MARKET_PROVIDER is explicitly UPSTOX", () => {
      vi.stubEnv("LIVE_MARKET_PROVIDER", "UPSTOX");
      expect(getActiveLiveMarketProvider()).toBe("UPSTOX");
      const provider = createLiveMarketProvider();
      expect(provider.id).toBe(UPSTOX_WS_ADAPTER_ID);
    });

    it("rejects unknown provider values fail-closed", () => {
      expect(() => createLiveMarketProvider("UNKNOWN_PROVIDER")).toThrow(
        "UNVERIFIED_LIVE_PROVIDER",
      );
    });
  });
});
