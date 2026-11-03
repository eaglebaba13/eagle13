// Pure TypeScript binary-safe wire decoder for Upstox V3 Market Data Feed Protobuf.
// Implements the official com.upstox.marketdatafeeder.rpc.proto schema.
// ZERO external dependencies. Strict TypeScript with no `any`.

export interface DecodedLtpc {
  readonly ltp: number | null;
  readonly ltt: number | null; // epoch milliseconds
  readonly ltq: number | null;
  readonly cp: number | null;
}

export interface DecodedOhlc {
  readonly interval: string | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number | null;
  readonly ts: number | null; // epoch milliseconds
  readonly vol: number | null;
}

export interface DecodedIndexFullFeed {
  readonly ltpc: DecodedLtpc | null;
  readonly marketOhlc: readonly DecodedOhlc[];
}

export interface DecodedMarketFullFeed {
  readonly ltpc: DecodedLtpc | null;
  readonly marketOhlc: readonly DecodedOhlc[];
}

export interface DecodedFeed {
  readonly ltpc: DecodedLtpc | null;
  readonly indexFF: DecodedIndexFullFeed | null;
  readonly marketFF: DecodedMarketFullFeed | null;
}

export type FeedResponseType = "initial_feed" | "live_feed" | "unknown";

export interface DecodedFeedResponse {
  readonly type: FeedResponseType;
  readonly feeds: Readonly<Record<string, DecodedFeed>>;
}

export type UpstoxDecodeResult =
  | { readonly ok: true; readonly data: DecodedFeedResponse }
  | { readonly ok: false; readonly error: string };

// ────────────────────── Binary Readers ──────────────────────────────

export function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

class BinaryReader {
  private pos = 0;
  private readonly textDecoder = new TextDecoder("utf-8");

  constructor(private readonly buf: Uint8Array) {}

  get hasMore(): boolean {
    return this.pos < this.buf.length;
  }

  get position(): number {
    return this.pos;
  }

  readVarint(): bigint {
    let result = 0n;
    let shift = 0n;
    while (this.pos < this.buf.length) {
      const byte = BigInt(this.buf[this.pos]!);
      this.pos++;
      result |= (byte & 0x7fn) << shift;
      if ((byte & 0x80n) === 0n) {
        return result;
      }
      shift += 7n;
      if (shift >= 64n) {
        throw new Error("Varint overflow: exceeds 64 bits");
      }
    }
    throw new Error("Unexpected end of buffer reading varint");
  }

  readVarintNumber(): number {
    const val = this.readVarint();
    return Number(val);
  }

  readDouble(): number {
    if (this.pos + 8 > this.buf.length) {
      throw new Error("Unexpected end of buffer reading fixed64 double");
    }
    const view = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8);
    const val = view.getFloat64(0, true); // little-endian
    this.pos += 8;
    return val;
  }

  readFloat(): number {
    if (this.pos + 4 > this.buf.length) {
      throw new Error("Unexpected end of buffer reading fixed32 float");
    }
    const view = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4);
    const val = view.getFloat32(0, true); // little-endian
    this.pos += 4;
    return val;
  }

  readBytes(): Uint8Array {
    const len = this.readVarintNumber();
    if (len < 0 || this.pos + len > this.buf.length) {
      throw new Error(
        `Length-delimited field exceeds buffer bounds (len=${len}, remaining=${this.buf.length - this.pos})`,
      );
    }
    const slice = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return slice;
  }

  readString(): string {
    const bytes = this.readBytes();
    return this.textDecoder.decode(bytes);
  }

  skip(wireType: number): void {
    switch (wireType) {
      case 0: // Varint
        this.readVarint();
        break;
      case 1: // Fixed 64-bit
        if (this.pos + 8 > this.buf.length) throw new Error("Premature EOF skipping fixed64");
        this.pos += 8;
        break;
      case 2: {
        // Length-delimited
        const len = this.readVarintNumber();
        if (len < 0 || this.pos + len > this.buf.length) {
          throw new Error(`Premature EOF skipping length-delimited field (len=${len})`);
        }
        this.pos += len;
        break;
      }
      case 5: // Fixed 32-bit
        if (this.pos + 4 > this.buf.length) throw new Error("Premature EOF skipping fixed32");
        this.pos += 4;
        break;
      default:
        throw new Error(`Unsupported wire type: ${wireType}`);
    }
  }
}

// ────────────────────── Protobuf Message Decoders ───────────────────

function decodeLtpcMessage(bytes: Uint8Array): DecodedLtpc {
  const reader = new BinaryReader(bytes);
  let ltp: number | null = null;
  let ltt: number | null = null;
  let ltq: number | null = null;
  let cp: number | null = null;

  while (reader.hasMore) {
    const tag = reader.readVarintNumber();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    switch (fieldNum) {
      case 1: // double ltp = 1
        if (wireType === 1) {
          const v = reader.readDouble();
          if (Number.isFinite(v)) ltp = v;
        } else {
          reader.skip(wireType);
        }
        break;
      case 2: // int64 ltt = 2 (epoch ms)
        if (wireType === 0) {
          const v = reader.readVarintNumber();
          if (Number.isFinite(v) && v > 0) ltt = v;
        } else {
          reader.skip(wireType);
        }
        break;
      case 3: // int64 ltq = 3
        if (wireType === 0) {
          const v = reader.readVarintNumber();
          if (Number.isFinite(v)) ltq = v;
        } else {
          reader.skip(wireType);
        }
        break;
      case 4: // double cp = 4 (prev close)
        if (wireType === 1) {
          const v = reader.readDouble();
          if (Number.isFinite(v)) cp = v;
        } else {
          reader.skip(wireType);
        }
        break;
      default:
        reader.skip(wireType);
        break;
    }
  }

  return { ltp, ltt, ltq, cp };
}

function decodeOhlcMessage(bytes: Uint8Array): DecodedOhlc {
  const reader = new BinaryReader(bytes);
  let interval: string | null = null;
  let open: number | null = null;
  let high: number | null = null;
  let low: number | null = null;
  let close: number | null = null;
  let ts: number | null = null;
  let vol: number | null = null;

  while (reader.hasMore) {
    const tag = reader.readVarintNumber();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    switch (fieldNum) {
      case 1: // string interval = 1
        if (wireType === 2) interval = reader.readString();
        else reader.skip(wireType);
        break;
      case 2: // double open = 2
        if (wireType === 1) open = reader.readDouble();
        else reader.skip(wireType);
        break;
      case 3: // double high = 3
        if (wireType === 1) high = reader.readDouble();
        else reader.skip(wireType);
        break;
      case 4: // double low = 4
        if (wireType === 1) low = reader.readDouble();
        else reader.skip(wireType);
        break;
      case 5: // double close = 5
        if (wireType === 1) close = reader.readDouble();
        else reader.skip(wireType);
        break;
      case 6: // int64 ts = 6
        if (wireType === 0) ts = reader.readVarintNumber();
        else reader.skip(wireType);
        break;
      case 7: // int64 vol = 7
        if (wireType === 0) vol = reader.readVarintNumber();
        else reader.skip(wireType);
        break;
      default:
        reader.skip(wireType);
        break;
    }
  }

  return { interval, open, high, low, close, ts, vol };
}

function decodeMarketOhlcMessage(bytes: Uint8Array): readonly DecodedOhlc[] {
  const reader = new BinaryReader(bytes);
  const list: DecodedOhlc[] = [];

  while (reader.hasMore) {
    const tag = reader.readVarintNumber();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    if (fieldNum === 1 && wireType === 2) {
      const ohlcBytes = reader.readBytes();
      list.push(decodeOhlcMessage(ohlcBytes));
    } else {
      reader.skip(wireType);
    }
  }

  return Object.freeze(list);
}

function decodeIndexFullFeed(bytes: Uint8Array): DecodedIndexFullFeed {
  const reader = new BinaryReader(bytes);
  let ltpc: DecodedLtpc | null = null;
  let marketOhlc: readonly DecodedOhlc[] = [];

  while (reader.hasMore) {
    const tag = reader.readVarintNumber();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    switch (fieldNum) {
      case 1: // LTPC ltpc = 1
        if (wireType === 2) {
          const msgBytes = reader.readBytes();
          ltpc = decodeLtpcMessage(msgBytes);
        } else {
          reader.skip(wireType);
        }
        break;
      case 2: // MarketOHLC marketOHLC = 2
        if (wireType === 2) {
          const msgBytes = reader.readBytes();
          marketOhlc = decodeMarketOhlcMessage(msgBytes);
        } else {
          reader.skip(wireType);
        }
        break;
      default:
        reader.skip(wireType);
        break;
    }
  }

  return { ltpc, marketOhlc };
}

function decodeMarketFullFeed(bytes: Uint8Array): DecodedMarketFullFeed {
  const reader = new BinaryReader(bytes);
  let ltpc: DecodedLtpc | null = null;
  let marketOhlc: readonly DecodedOhlc[] = [];

  while (reader.hasMore) {
    const tag = reader.readVarintNumber();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    switch (fieldNum) {
      case 1: // LTPC ltpc = 1
        if (wireType === 2) {
          const msgBytes = reader.readBytes();
          ltpc = decodeLtpcMessage(msgBytes);
        } else {
          reader.skip(wireType);
        }
        break;
      case 4: // MarketOHLC marketOHLC = 4
        if (wireType === 2) {
          const msgBytes = reader.readBytes();
          marketOhlc = decodeMarketOhlcMessage(msgBytes);
        } else {
          reader.skip(wireType);
        }
        break;
      default:
        reader.skip(wireType);
        break;
    }
  }

  return { ltpc, marketOhlc };
}

function decodeFullFeed(bytes: Uint8Array): {
  indexFF: DecodedIndexFullFeed | null;
  marketFF: DecodedMarketFullFeed | null;
} {
  const reader = new BinaryReader(bytes);
  let indexFF: DecodedIndexFullFeed | null = null;
  let marketFF: DecodedMarketFullFeed | null = null;

  while (reader.hasMore) {
    const tag = reader.readVarintNumber();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    switch (fieldNum) {
      case 1: // MarketFullFeed marketFF = 1
        if (wireType === 2) {
          const msgBytes = reader.readBytes();
          marketFF = decodeMarketFullFeed(msgBytes);
        } else {
          reader.skip(wireType);
        }
        break;
      case 2: // IndexFullFeed indexFF = 2
        if (wireType === 2) {
          const msgBytes = reader.readBytes();
          indexFF = decodeIndexFullFeed(msgBytes);
        } else {
          reader.skip(wireType);
        }
        break;
      default:
        reader.skip(wireType);
        break;
    }
  }

  return { indexFF, marketFF };
}

function decodeFeed(bytes: Uint8Array): DecodedFeed {
  const reader = new BinaryReader(bytes);
  let ltpc: DecodedLtpc | null = null;
  let indexFF: DecodedIndexFullFeed | null = null;
  let marketFF: DecodedMarketFullFeed | null = null;

  while (reader.hasMore) {
    const tag = reader.readVarintNumber();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    switch (fieldNum) {
      case 1: // LTPC ltpc = 1 (mode = ltpc)
        if (wireType === 2) {
          const msgBytes = reader.readBytes();
          ltpc = decodeLtpcMessage(msgBytes);
        } else {
          reader.skip(wireType);
        }
        break;
      case 2: // FullFeed fullFeed = 2 (mode = full)
        if (wireType === 2) {
          const msgBytes = reader.readBytes();
          const ff = decodeFullFeed(msgBytes);
          indexFF = ff.indexFF;
          marketFF = ff.marketFF;
        } else {
          reader.skip(wireType);
        }
        break;
      default:
        reader.skip(wireType);
        break;
    }
  }

  return { ltpc, indexFF, marketFF };
}

function decodeFeedMapEntry(bytes: Uint8Array): { key: string; feed: DecodedFeed } | null {
  const reader = new BinaryReader(bytes);
  let key: string | null = null;
  let feed: DecodedFeed | null = null;

  while (reader.hasMore) {
    const tag = reader.readVarintNumber();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    switch (fieldNum) {
      case 1: // string key = 1
        if (wireType === 2) key = reader.readString();
        else reader.skip(wireType);
        break;
      case 2: // Feed value = 2
        if (wireType === 2) {
          const msgBytes = reader.readBytes();
          feed = decodeFeed(msgBytes);
        } else {
          reader.skip(wireType);
        }
        break;
      default:
        reader.skip(wireType);
        break;
    }
  }

  if (key && feed) {
    return { key, feed };
  }
  return null;
}

// ────────────────────── Top-Level Decoder API ───────────────────────

/**
 * Binary-safe pure TypeScript decoder for Upstox V3 FeedResponse Protobuf frames.
 * Safe against corrupt, truncated, non-protobuf, or unexpected inputs.
 */
export function decodeUpstoxFeedResponse(raw: unknown): UpstoxDecodeResult {
  const bytes = toUint8Array(raw);
  if (!bytes) {
    return { ok: false, error: "Input is not an ArrayBuffer, Uint8Array, or Buffer" };
  }
  if (bytes.length === 0) {
    return { ok: false, error: "Buffer is empty (0 bytes)" };
  }

  try {
    const reader = new BinaryReader(bytes);
    let type: FeedResponseType = "unknown";
    const feeds: Record<string, DecodedFeed> = {};

    while (reader.hasMore) {
      const tag = reader.readVarintNumber();
      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;

      switch (fieldNum) {
        case 1: // Type type = 1
          if (wireType === 0) {
            const val = reader.readVarintNumber();
            if (val === 0) type = "initial_feed";
            else if (val === 1) type = "live_feed";
            else type = "unknown";
          } else {
            reader.skip(wireType);
          }
          break;
        case 2: // map<string, Feed> feeds = 2
          if (wireType === 2) {
            const entryBytes = reader.readBytes();
            const entry = decodeFeedMapEntry(entryBytes);
            if (entry) {
              feeds[entry.key] = entry.feed;
            }
          } else {
            reader.skip(wireType);
          }
          break;
        default:
          reader.skip(wireType);
          break;
      }
    }

    return {
      ok: true,
      data: {
        type,
        feeds: Object.freeze(feeds),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Protobuf decode failed: ${message}` };
  }
}
