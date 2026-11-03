import { describe, expect, it } from "vitest";
import {
  decodeUpstoxFeedResponse,
  toUint8Array,
  type DecodedFeedResponse,
} from "./upstox-protobuf-wire-decoder";

// ────────────────────── Binary Test Helpers ─────────────────────────

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
    new DataView(buf.buffer, buf.byteOffset, 8).setFloat64(0, value, true); // little-endian
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

function encodeLtpc(ltp?: number, ltt?: number, ltq?: number, cp?: number): Uint8Array {
  const w = new TestProtoWriter();
  if (ltp !== undefined) w.writeDouble(1, ltp);
  if (ltt !== undefined) w.writeVarintField(2, ltt);
  if (ltq !== undefined) w.writeVarintField(3, ltq);
  if (cp !== undefined) w.writeDouble(4, cp);
  return w.toUint8Array();
}

function encodeIndexFullFeed(ltpcBytes: Uint8Array): Uint8Array {
  const w = new TestProtoWriter();
  w.writeMessage(1, ltpcBytes); // ltpc = 1
  return w.toUint8Array();
}

function encodeMarketFullFeed(ltpcBytes: Uint8Array): Uint8Array {
  const w = new TestProtoWriter();
  w.writeMessage(1, ltpcBytes); // ltpc = 1
  return w.toUint8Array();
}

function encodeFullFeedWithIndex(indexFFBytes: Uint8Array): Uint8Array {
  const w = new TestProtoWriter();
  w.writeMessage(2, indexFFBytes); // indexFF = 2
  return w.toUint8Array();
}

function encodeFullFeedWithMarket(marketFFBytes: Uint8Array): Uint8Array {
  const w = new TestProtoWriter();
  w.writeMessage(1, marketFFBytes); // marketFF = 1
  return w.toUint8Array();
}

function encodeFeedWithFull(fullFeedBytes: Uint8Array): Uint8Array {
  const w = new TestProtoWriter();
  w.writeMessage(2, fullFeedBytes); // fullFeed = 2
  return w.toUint8Array();
}

function encodeFeedWithLtpc(ltpcBytes: Uint8Array): Uint8Array {
  const w = new TestProtoWriter();
  w.writeMessage(1, ltpcBytes); // ltpc = 1
  return w.toUint8Array();
}

function encodeMapEntry(key: string, feedBytes: Uint8Array): Uint8Array {
  const w = new TestProtoWriter();
  w.writeString(1, key);
  w.writeMessage(2, feedBytes);
  return w.toUint8Array();
}

function encodeFeedResponse(
  type: number,
  feeds: Array<{ key: string; feedBytes: Uint8Array }>,
): Uint8Array {
  const w = new TestProtoWriter();
  w.writeVarintField(1, type); // type = 1
  for (const f of feeds) {
    const entryBytes = encodeMapEntry(f.key, f.feedBytes);
    w.writeMessage(2, entryBytes); // feeds map entry = 2
  }
  return w.toUint8Array();
}

// ────────────────────── Test Suites ─────────────────────────────────

describe("Upstox Protobuf Wire Decoder", () => {
  it("decodes a valid IndexFullFeed (NIFTY 50)", () => {
    const ltpcBytes = encodeLtpc(23810.85, 1762151600000, 0, 23750.0);
    const indexFFBytes = encodeIndexFullFeed(ltpcBytes);
    const fullFeedBytes = encodeFullFeedWithIndex(indexFFBytes);
    const feedBytes = encodeFeedWithFull(fullFeedBytes);
    const frame = encodeFeedResponse(1, [{ key: "NSE_INDEX|Nifty 50", feedBytes }]);

    const result = decodeUpstoxFeedResponse(frame);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.type).toBe("live_feed");
    const feed = result.data.feeds["NSE_INDEX|Nifty 50"];
    expect(feed).toBeDefined();
    expect(feed?.indexFF?.ltpc?.ltp).toBeCloseTo(23810.85, 2);
    expect(feed?.indexFF?.ltpc?.ltt).toBe(1762151600000);
    expect(feed?.indexFF?.ltpc?.cp).toBeCloseTo(23750.0, 2);
    expect(feed?.indexFF?.ltpc?.ltq).toBe(0);
    expect(feed?.marketFF).toBeNull();
  });

  it("decodes multiple index feeds (NIFTY50, BANKNIFTY, INDIA VIX)", () => {
    const niftyFeed = encodeFeedWithFull(
      encodeFullFeedWithIndex(encodeIndexFullFeed(encodeLtpc(23810.85, 1762151600000, 0, 23750.0))),
    );
    const bankFeed = encodeFeedWithFull(
      encodeFullFeedWithIndex(encodeIndexFullFeed(encodeLtpc(55540.05, 1762151600100, 0, 55400.0))),
    );
    const vixFeed = encodeFeedWithFull(
      encodeFullFeedWithIndex(encodeIndexFullFeed(encodeLtpc(15.72, 1762151600200, 0, 15.5))),
    );

    const frame = encodeFeedResponse(0, [
      { key: "NSE_INDEX|Nifty 50", feedBytes: niftyFeed },
      { key: "NSE_INDEX|Nifty Bank", feedBytes: bankFeed },
      { key: "NSE_INDEX|India VIX", feedBytes: vixFeed },
    ]);

    const result = decodeUpstoxFeedResponse(frame);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.type).toBe("initial_feed");
    expect(Object.keys(result.data.feeds)).toHaveLength(3);
    expect(result.data.feeds["NSE_INDEX|Nifty 50"]?.indexFF?.ltpc?.ltp).toBeCloseTo(23810.85, 2);
    expect(result.data.feeds["NSE_INDEX|Nifty Bank"]?.indexFF?.ltpc?.ltp).toBeCloseTo(55540.05, 2);
    expect(result.data.feeds["NSE_INDEX|India VIX"]?.indexFF?.ltpc?.ltp).toBeCloseTo(15.72, 2);
  });

  it("decodes MarketFullFeed for equities/commodities (GOLD)", () => {
    const goldFeed = encodeFeedWithFull(
      encodeFullFeedWithMarket(
        encodeMarketFullFeed(encodeLtpc(78500.0, 1762151600300, 10, 78200.0)),
      ),
    );
    const frame = encodeFeedResponse(1, [{ key: "MCX_FO|GOLD", feedBytes: goldFeed }]);

    const result = decodeUpstoxFeedResponse(frame);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const feed = result.data.feeds["MCX_FO|GOLD"];
    expect(feed?.marketFF?.ltpc?.ltp).toBe(78500.0);
    expect(feed?.marketFF?.ltpc?.ltq).toBe(10);
    expect(feed?.indexFF).toBeNull();
  });

  it("decodes ltpc mode feed directly", () => {
    const feedBytes = encodeFeedWithLtpc(encodeLtpc(23900.5, 1762151600400, 50, 23800.0));
    const frame = encodeFeedResponse(1, [{ key: "NSE_INDEX|Nifty 50", feedBytes }]);

    const result = decodeUpstoxFeedResponse(frame);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feeds["NSE_INDEX|Nifty 50"]?.ltpc?.ltp).toBe(23900.5);
  });

  it("fails safely on empty buffer", () => {
    const result = decodeUpstoxFeedResponse(new Uint8Array(0));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("empty");
    }
  });

  it("fails safely on non-binary/null/undefined inputs", () => {
    expect(decodeUpstoxFeedResponse(null).ok).toBe(false);
    expect(decodeUpstoxFeedResponse(undefined).ok).toBe(false);
    expect(decodeUpstoxFeedResponse("not binary").ok).toBe(false);
    expect(decodeUpstoxFeedResponse(12345).ok).toBe(false);
  });

  it("fails safely on JSON strings (e.g. error payload)", () => {
    const jsonBytes = new TextEncoder().encode('{"status":"error","message":"unauthorized"}');
    const result = decodeUpstoxFeedResponse(jsonBytes);
    // ASCII '{' is 123 = (15 << 3) | 3 (wire type 3 = Start group, deprecated/invalid)
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Protobuf decode failed");
    }
  });

  it("fails safely on HTML error bodies (e.g. Cloudflare 403)", () => {
    const htmlBytes = new TextEncoder().encode("<!DOCTYPE html><html><body>Error</body></html>");
    const result = decodeUpstoxFeedResponse(htmlBytes);
    expect(result.ok).toBe(false);
  });

  it("fails safely on truncated / corrupted buffers", () => {
    const valid = encodeFeedResponse(1, [
      {
        key: "NSE_INDEX|Nifty 50",
        feedBytes: encodeFeedWithFull(
          encodeFullFeedWithIndex(encodeLtpc(23810.85, 1762151600000, 0, 23750.0)),
        ),
      },
    ]);
    // Truncate halfway
    const truncated = valid.subarray(0, valid.length - 8);
    const result = decodeUpstoxFeedResponse(truncated);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Protobuf decode failed");
    }
  });

  it("handles unknown/future field tags by skipping them gracefully", () => {
    const w = new TestProtoWriter();
    w.writeVarintField(1, 1); // type = live_feed
    w.writeString(99, "future unknown string field"); // unknown field 99
    w.writeDouble(100, 123.456); // unknown field 100
    const frame = w.toUint8Array();

    const result = decodeUpstoxFeedResponse(frame);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("live_feed");
  });

  it("preserves IEEE 754 float64 price precision without scaling", () => {
    const precisePrice = 23810.8512345678;
    const ltpcBytes = encodeLtpc(precisePrice, 1762151600000);
    const frame = encodeFeedResponse(1, [
      {
        key: "NSE_INDEX|Nifty 50",
        feedBytes: encodeFeedWithFull(encodeFullFeedWithIndex(encodeIndexFullFeed(ltpcBytes))),
      },
    ]);

    const result = decodeUpstoxFeedResponse(frame);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.feeds["NSE_INDEX|Nifty 50"]?.indexFF?.ltpc?.ltp).toBe(precisePrice);
  });
});
