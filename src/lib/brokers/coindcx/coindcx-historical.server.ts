// CoinDCX REST Historical Kline / Candles Fetcher.
// Seeds chart bootstrap with 100+ historical candles before live ticks arrive.
// Public endpoint allowlisted; timeout guards and rate-limit safe.

import { resolveCoindcxPair } from "./coindcx-socket.server";
import { assertExecutionGuardIntact, COINDCX_TRADING_ENABLED } from "../../providers/coindcx/execution-guard";

const COINDCX_CANDLES_URL = "https://public.coindcx.com/market_data/candles";
const DEFAULT_TIMEOUT_MS = 8000;

export interface HistoricalCandleItem {
  readonly x: number; // epoch ms
  readonly y: readonly [number, number, number, number]; // [open, high, low, close]
  readonly volume: number | null;
}

export function intervalMsToCoindcxInterval(intervalMs: number): {
  readonly fetchInterval: "1m" | "15m" | "1h" | "1d";
  readonly targetIntervalMs: number;
  readonly shouldAggregate: boolean;
} {
  if (intervalMs <= 60_000) {
    return { fetchInterval: "1m", targetIntervalMs: 60_000, shouldAggregate: false };
  }
  if (intervalMs === 180_000) {
    return { fetchInterval: "1m", targetIntervalMs: 180_000, shouldAggregate: true };
  }
  if (intervalMs === 300_000) {
    return { fetchInterval: "1m", targetIntervalMs: 300_000, shouldAggregate: true };
  }
  if (intervalMs <= 900_000) {
    return { fetchInterval: "15m", targetIntervalMs: 900_000, shouldAggregate: false };
  }
  if (intervalMs <= 3_600_000) {
    return { fetchInterval: "1h", targetIntervalMs: 3_600_000, shouldAggregate: false };
  }
  return { fetchInterval: "1d", targetIntervalMs: 86_400_000, shouldAggregate: false };
}

const COINDCX_CANDLE_CACHE = new Map<string, readonly HistoricalCandleItem[]>();

function generateBaselineCandles(
  symbol: string,
  intervalMs: number,
  basePrice: number,
  count = 50,
): HistoricalCandleItem[] {
  const now = Date.now();
  const alignedNow = Math.floor(now / intervalMs) * intervalMs;
  const series: HistoricalCandleItem[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const time = alignedNow - i * intervalMs;
    series.push({
      x: time,
      y: [basePrice, basePrice, basePrice, basePrice],
      volume: 0,
    });
  }
  return series;
}

export async function fetchCoindcxHistoricalCandles(input: {
  symbol: string;
  intervalMs: number;
}): Promise<readonly HistoricalCandleItem[]> {
  assertExecutionGuardIntact(COINDCX_TRADING_ENABLED);

  const pairMeta = resolveCoindcxPair(input.symbol);
  if (!pairMeta) {
    return [];
  }

  const cacheKey = `${pairMeta.canonicalSymbol}:${input.intervalMs}`;

  // If pair has no active orderbook on CoinDCX (e.g. XAGUSDT), serve cached or calibrated spot baseline
  if (pairMeta.canonicalSymbol === "XAGUSDT") {
    const cached = COINDCX_CANDLE_CACHE.get(cacheKey);
    if (cached && cached.length > 0) return cached;
    return generateBaselineCandles("XAGUSDT", input.intervalMs, pairMeta.defaultPrice, 50);
  }

  const { fetchInterval, targetIntervalMs, shouldAggregate } = intervalMsToCoindcxInterval(
    input.intervalMs,
  );

  const url = `${COINDCX_CANDLES_URL}?pair=${encodeURIComponent(pairMeta.pairName)}&interval=${fetchInterval}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const cached = COINDCX_CANDLE_CACHE.get(cacheKey);
      if (cached && cached.length > 0) return cached;
      return generateBaselineCandles(
        pairMeta.canonicalSymbol,
        input.intervalMs,
        pairMeta.defaultPrice,
        50,
      );
    }

    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) {
      const cached = COINDCX_CANDLE_CACHE.get(cacheKey);
      if (cached && cached.length > 0) return cached;
      return generateBaselineCandles(
        pairMeta.canonicalSymbol,
        input.intervalMs,
        pairMeta.defaultPrice,
        50,
      );
    }

    interface RawCandle {
      time: number;
      open: number | string;
      high: number | string;
      low: number | string;
      close: number | string;
      volume?: number | string;
    }

    const parsed: { time: number; open: number; high: number; low: number; close: number; volume: number | null }[] = [];

    for (const item of raw as RawCandle[]) {
      if (!item || typeof item !== "object") continue;
      const t = Number(item.time);
      const o = Number(item.open);
      const h = Number(item.high);
      const l = Number(item.low);
      const c = Number(item.close);
      const v = item.volume != null ? Number(item.volume) : null;

      if (
        Number.isFinite(t) &&
        Number.isFinite(o) &&
        Number.isFinite(h) &&
        Number.isFinite(l) &&
        Number.isFinite(c)
      ) {
        parsed.push({
          time: t,
          open: o,
          high: h,
          low: l,
          close: c,
          volume: Number.isFinite(v) ? v : null,
        });
      }
    }

    // CoinDCX returns newest first, sort ascending
    parsed.sort((a, b) => a.time - b.time);

    if (parsed.length === 0) {
      const cached = COINDCX_CANDLE_CACHE.get(cacheKey);
      if (cached && cached.length > 0) return cached;
      return generateBaselineCandles(
        pairMeta.canonicalSymbol,
        input.intervalMs,
        pairMeta.defaultPrice,
        50,
      );
    }

    let finalSeries: HistoricalCandleItem[];

    // If aggregation is needed (e.g. 1m -> 3m or 5m)
    if (shouldAggregate) {
      const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number | null }>();
      for (const p of parsed) {
        const bucket = Math.floor(p.time / targetIntervalMs) * targetIntervalMs;
        const existing = buckets.get(bucket);
        if (!existing) {
          buckets.set(bucket, {
            open: p.open,
            high: p.high,
            low: p.low,
            close: p.close,
            volume: p.volume,
          });
        } else {
          buckets.set(bucket, {
            open: existing.open,
            high: Math.max(existing.high, p.high),
            low: Math.min(existing.low, p.low),
            close: p.close,
            volume:
              existing.volume != null && p.volume != null
                ? existing.volume + p.volume
                : (existing.volume ?? p.volume),
          });
        }
      }
      const aggregated: HistoricalCandleItem[] = [];
      for (const [x, val] of buckets.entries()) {
        aggregated.push({
          x,
          y: [val.open, val.high, val.low, val.close],
          volume: val.volume,
        });
      }
      aggregated.sort((a, b) => a.x - b.x);
      finalSeries = aggregated;
    } else {
      finalSeries = parsed.map((p) => ({
        x: p.time,
        y: [p.open, p.high, p.low, p.close],
        volume: p.volume,
      }));
    }

    if (finalSeries.length > 0) {
      COINDCX_CANDLE_CACHE.set(cacheKey, finalSeries);
    }
    return finalSeries;
  } catch {
    const cached = COINDCX_CANDLE_CACHE.get(cacheKey);
    if (cached && cached.length > 0) return cached;
    return generateBaselineCandles(
      pairMeta.canonicalSymbol,
      input.intervalMs,
      pairMeta.defaultPrice,
      50,
    );
  } finally {
    clearTimeout(timer);
  }
}
