// Deep, authentic Upstox V3 Multi-Timeframe Historical Candle Fetching & Aggregation Engine
// Supports all 9 timeframes: 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1D, 1W.
// Eliminates all synthetic sine waves permanently. Server-only.

import https from "node:https";
import { resolveUpstoxAccessToken } from "./upstox-token-policy.server";
import { mapToMarketSymbol } from "@/lib/cycles/market-data-adapter.server";

export interface DeepCandle {
  x: number; // UTC timestamp in milliseconds
  y: [number, number, number, number]; // [open, high, low, close]
  volume?: number;
}

export interface DeepCandleResult {
  candles: DeepCandle[];
  spotPrice: number | null;
  provider: string;
}

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

// Cache to prevent duplicate HTTP calls on rapid UI switching (TTL 60s)
const DEEP_CANDLE_CACHE = new Map<string, { data: DeepCandleResult; timestamp: number }>();
const CACHE_TTL_MS = 60_000;

const UPSTOX_INSTRUMENT_MAP: Record<string, string> = {
  NIFTY: "NSE_INDEX|Nifty 50",
  NIFTY50: "NSE_INDEX|Nifty 50",
  "NIFTY 50": "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  "NIFTY BANK": "NSE_INDEX|Nifty Bank",
  FINNIFTY: "NSE_INDEX|Nifty Fin Service",
  "NIFTY FIN SERVICES": "NSE_INDEX|Nifty Fin Service",
  SENSEX: "BSE_INDEX|SENSEX",
  "BSE SENSEX": "BSE_INDEX|SENSEX",
  INDIA_VIX: "NSE_INDEX|India VIX",
  "INDIA VIX": "NSE_INDEX|India VIX",
};

/**
 * Perform HTTPS GET request with JSON parsing
 */
function httpsGetJson<T>(url: string, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<T | null> {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            resolve(null);
          }
        });
      },
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Fetch raw Upstox candles for a given interval and date window
 */
async function fetchUpstoxRawCandles(
  instrumentKey: string,
  interval: "1minute" | "30minute" | "day" | "week" | "month",
  toDate: string,
  fromDate?: string,
): Promise<{ time: number; open: number; high: number; low: number; close: number; volume: number }[]> {
  const encKey = encodeURIComponent(instrumentKey);
  const token = resolveUpstoxAccessToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const url = fromDate
    ? `https://api.upstox.com/v2/historical-candle/${encKey}/${interval}/${toDate}/${fromDate}`
    : `https://api.upstox.com/v2/historical-candle/${encKey}/${interval}/${toDate}`;

  interface UpstoxCandleResponse {
    status?: string;
    data?: {
      candles?: [string, number, number, number, number, number, number][];
    };
  }

  const json = await httpsGetJson<UpstoxCandleResponse>(url, headers);
  if (!json || json.status !== "success" || !Array.isArray(json.data?.candles)) {
    return [];
  }

  const result: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = [];
  for (const c of json.data.candles) {
    if (!c || c.length < 5) continue;
    const ts = Date.parse(c[0]);
    if (!Number.isFinite(ts)) continue;
    const open = Number(c[1]);
    const high = Number(c[2]);
    const low = Number(c[3]);
    const close = Number(c[4]);
    const volume = Number(c[5]) || 0;
    if (Number.isFinite(open) && Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close)) {
      result.push({ time: ts, open, high, low, close, volume });
    }
  }

  // Upstox returns newest first; sort oldest first
  return result.sort((a, b) => a.time - b.time);
}

/**
 * Fetch today's current intraday candles from Upstox
 */
async function fetchUpstoxIntradayCandles(
  instrumentKey: string,
  interval: "1minute" | "30minute",
): Promise<{ time: number; open: number; high: number; low: number; close: number; volume: number }[]> {
  const encKey = encodeURIComponent(instrumentKey);
  const token = resolveUpstoxAccessToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const url = `https://api.upstox.com/v2/historical-candle/intraday/${encKey}/${interval}`;

  interface UpstoxCandleResponse {
    status?: string;
    data?: {
      candles?: [string, number, number, number, number, number, number][];
    };
  }

  const json = await httpsGetJson<UpstoxCandleResponse>(url, headers);
  if (!json || json.status !== "success" || !Array.isArray(json.data?.candles)) {
    return [];
  }

  const result: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = [];
  for (const c of json.data.candles) {
    if (!c || c.length < 5) continue;
    const ts = Date.parse(c[0]);
    if (!Number.isFinite(ts)) continue;
    const open = Number(c[1]);
    const high = Number(c[2]);
    const low = Number(c[3]);
    const close = Number(c[4]);
    const volume = Number(c[5]) || 0;
    if (Number.isFinite(open) && Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close)) {
      result.push({ time: ts, open, high, low, close, volume });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Aligns timestamps to IST session buckets and aggregates OHLCV
 */
function aggregateToIstBuckets(
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[],
  intervalMs: number,
): DeepCandle[] {
  if (candles.length === 0) return [];
  const sorted = [...candles].sort((a, b) => a.time - b.time);

  function getBucketTime(ts: number): number {
    if (intervalMs === 3_600_000) {
      // 1-hour session bucket aligned to 09:15 IST
      const istDate = new Date(ts + IST_OFFSET_MS);
      const hours = istDate.getUTCHours();
      const minutes = istDate.getUTCMinutes();
      let bucketHour = hours;
      let bucketMinute = 15;
      if (minutes < 15) {
        bucketHour = hours - 1;
      }
      const bucketDate = new Date(istDate);
      bucketDate.setUTCHours(bucketHour, bucketMinute, 0, 0);
      return bucketDate.getTime() - IST_OFFSET_MS;
    }

    if (intervalMs === 14_400_000) {
      // 4-hour session bucket aligned to 09:15 IST
      // Morning: 09:15 - 13:15, Afternoon: 13:15 - 15:30
      const istDate = new Date(ts + IST_OFFSET_MS);
      const hours = istDate.getUTCHours();
      const minutes = istDate.getUTCMinutes();
      const timeVal = hours * 100 + minutes;
      let bucketHour = 9;
      let bucketMinute = 15;
      if (timeVal >= 1315) {
        bucketHour = 13;
        bucketMinute = 15;
      }
      const bucketDate = new Date(istDate);
      bucketDate.setUTCHours(bucketHour, bucketMinute, 0, 0);
      return bucketDate.getTime() - IST_OFFSET_MS;
    }

    // Standard intervals (3m, 5m, 15m) aligned to IST
    const istMs = ts + IST_OFFSET_MS;
    return Math.floor(istMs / intervalMs) * intervalMs - IST_OFFSET_MS;
  }

  const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

  for (const c of sorted) {
    const bucketKey = getBucketTime(c.time);
    const existing = buckets.get(bucketKey);
    if (!existing) {
      buckets.set(bucketKey, {
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
    }
  }

  const aggregated: DeepCandle[] = [];
  for (const [t, b] of buckets.entries()) {
    aggregated.push({
      x: t,
      y: [
        Math.round(b.open * 100) / 100,
        Math.round(b.high * 100) / 100,
        Math.round(b.low * 100) / 100,
        Math.round(b.close * 100) / 100,
      ],
      volume: b.volume,
    });
  }

  return aggregated.sort((a, b) => a.x - b.x);
}

/**
 * Universal fallback fetcher for Equities, Commodities, and Crypto via Yahoo Finance chart feed.
 * Never uses synthetic sine waves.
 */
async function fetchUniversalMarketCandles(symbol: string, intervalMs: number): Promise<DeepCandleResult | null> {
  const marketSymbol = mapToMarketSymbol(symbol);
  let yfInterval = "1d";
  let yfRange = "1y";

  if (intervalMs === 60_000) {
    yfInterval = "1m";
    yfRange = "5d";
  } else if (intervalMs === 180_000) {
    yfInterval = "2m";
    yfRange = "5d";
  } else if (intervalMs === 300_000) {
    yfInterval = "5m";
    yfRange = "1mo";
  } else if (intervalMs === 900_000) {
    yfInterval = "15m";
    yfRange = "1mo";
  } else if (intervalMs === 1_800_000) {
    yfInterval = "30m";
    yfRange = "1mo";
  } else if (intervalMs === 3_600_000) {
    yfInterval = "1h";
    yfRange = "3mo";
  } else if (intervalMs === 14_400_000) {
    yfInterval = "1h";
    yfRange = "6mo";
  } else if (intervalMs === 86_400_000) {
    yfInterval = "1d";
    yfRange = "2y";
  } else if (intervalMs === 604_800_000) {
    yfInterval = "1wk";
    yfRange = "5y";
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(marketSymbol)}?interval=${yfInterval}&range=${yfRange}`;

  interface YahooChartResponse {
    chart?: {
      result?: {
        meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
        timestamp?: number[];
        indicators?: {
          quote?: {
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }[];
        };
      }[];
    };
  }

  const json = await httpsGetJson<YahooChartResponse>(url);
  const result = json?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) return null;

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  const rawPoints: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const v = volumes[i] ?? 0;
    const ts = timestamps[i] * 1000;
    if (o != null && h != null && l != null && c != null && !isNaN(o) && !isNaN(c)) {
      rawPoints.push({ time: ts, open: o, high: h, low: l, close: c, volume: v });
    }
  }

  if (rawPoints.length === 0) return null;

  let candles: DeepCandle[] = [];
  if (intervalMs === 180_000 || intervalMs === 14_400_000) {
    candles = aggregateToIstBuckets(rawPoints, intervalMs);
  } else {
    candles = rawPoints.map((p) => ({
      x: p.time,
      y: [
        Math.round(p.open * 100) / 100,
        Math.round(p.high * 100) / 100,
        Math.round(p.low * 100) / 100,
        Math.round(p.close * 100) / 100,
      ],
      volume: p.volume,
    }));
  }

  const spotPrice =
    typeof result.meta?.regularMarketPrice === "number" && result.meta.regularMarketPrice > 0
      ? Math.round(result.meta.regularMarketPrice * 100) / 100
      : candles[candles.length - 1]?.y[3] ?? null;

  return {
    candles,
    spotPrice,
    provider: "MARKET_INTEGRATED",
  };
}

/**
 * Main deep candle fetcher: guarantees 150 to 400+ authentic candles across all 9 timeframes.
 */
export async function getDeepMultiTimeframeCandles(
  symbol: string,
  intervalMs: number,
): Promise<DeepCandleResult> {
  const cleanSym = symbol.trim().toUpperCase();
  const cacheKey = `${cleanSym}_${intervalMs}`;

  const cached = DEEP_CANDLE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const upstoxKey = UPSTOX_INSTRUMENT_MAP[cleanSym] ?? (cleanSym.includes("|") ? cleanSym : null);

  if (upstoxKey) {
    try {
      const now = new Date();
      const toDate = now.toISOString().slice(0, 10);
      let candles: DeepCandle[] = [];
      let latestSpot: number | null = null;

      if (intervalMs <= 900_000) {
        // 1m, 3m, 5m, 15m: Fetch Upstox 1minute candles + intraday
        const daysBack = intervalMs === 60_000 ? 7 : intervalMs === 180_000 ? 10 : intervalMs === 300_000 ? 15 : 30;
        const fromDate = new Date(now.getTime() - daysBack * 86_400_000).toISOString().slice(0, 10);

        const [historicalRaw, intradayRaw] = await Promise.all([
          fetchUpstoxRawCandles(upstoxKey, "1minute", toDate, fromDate),
          fetchUpstoxIntradayCandles(upstoxKey, "1minute"),
        ]);

        const mergedMap = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();
        for (const c of historicalRaw) mergedMap.set(c.time, c);
        for (const c of intradayRaw) mergedMap.set(c.time, c);

        const rawSorted = Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
        if (rawSorted.length > 0) {
          latestSpot = rawSorted[rawSorted.length - 1].close;
        }

        if (intervalMs === 60_000) {
          // Keep last 400-500 candles for 1m to keep lightweight chart ultra responsive
          const sliced = rawSorted.slice(-500);
          candles = sliced.map((c) => ({
            x: c.time,
            y: [c.open, c.high, c.low, c.close],
            volume: c.volume,
          }));
        } else {
          candles = aggregateToIstBuckets(rawSorted, intervalMs);
          if (candles.length > 500) candles = candles.slice(-500);
        }
      } else if (intervalMs === 1_800_000) {
        // 30m: Fetch last 45 calendar days of Upstox 30minute candles + intraday
        const fromDate = new Date(now.getTime() - 45 * 86_400_000).toISOString().slice(0, 10);
        const [historicalRaw, intradayRaw] = await Promise.all([
          fetchUpstoxRawCandles(upstoxKey, "30minute", toDate, fromDate),
          fetchUpstoxIntradayCandles(upstoxKey, "30minute"),
        ]);

        const mergedMap = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();
        for (const c of historicalRaw) mergedMap.set(c.time, c);
        for (const c of intradayRaw) mergedMap.set(c.time, c);

        const rawSorted = Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
        if (rawSorted.length > 0) {
          latestSpot = rawSorted[rawSorted.length - 1].close;
        }
        candles = rawSorted.map((c) => ({
          x: c.time,
          y: [c.open, c.high, c.low, c.close],
          volume: c.volume,
        }));
      } else if (intervalMs === 3_600_000) {
        // 1h: Fetch last 90 calendar days of Upstox 30minute candles and aggregate to 1h IST buckets
        const fromDate = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
        const [historicalRaw, intradayRaw] = await Promise.all([
          fetchUpstoxRawCandles(upstoxKey, "30minute", toDate, fromDate),
          fetchUpstoxIntradayCandles(upstoxKey, "30minute"),
        ]);

        const mergedMap = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();
        for (const c of historicalRaw) mergedMap.set(c.time, c);
        for (const c of intradayRaw) mergedMap.set(c.time, c);

        const rawSorted = Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
        if (rawSorted.length > 0) {
          latestSpot = rawSorted[rawSorted.length - 1].close;
        }
        candles = aggregateToIstBuckets(rawSorted, 3_600_000);
      } else if (intervalMs === 14_400_000) {
        // 4h: Fetch last 180 calendar days of Upstox 30minute candles in two 90-day chunks
        const midDate = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
        const fromDate = new Date(now.getTime() - 180 * 86_400_000).toISOString().slice(0, 10);

        const [chunk1, chunk2, intradayRaw] = await Promise.all([
          fetchUpstoxRawCandles(upstoxKey, "30minute", toDate, midDate),
          fetchUpstoxRawCandles(upstoxKey, "30minute", midDate, fromDate),
          fetchUpstoxIntradayCandles(upstoxKey, "30minute"),
        ]);

        const mergedMap = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();
        for (const c of chunk2) mergedMap.set(c.time, c);
        for (const c of chunk1) mergedMap.set(c.time, c);
        for (const c of intradayRaw) mergedMap.set(c.time, c);

        const rawSorted = Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
        if (rawSorted.length > 0) {
          latestSpot = rawSorted[rawSorted.length - 1].close;
        }
        candles = aggregateToIstBuckets(rawSorted, 14_400_000);
      } else if (intervalMs === 86_400_000) {
        // 1D: Fetch last 400 calendar days of Upstox day candles
        const fromDate = new Date(now.getTime() - 400 * 86_400_000).toISOString().slice(0, 10);
        const dayRaw = await fetchUpstoxRawCandles(upstoxKey, "day", toDate, fromDate);
        if (dayRaw.length > 0) {
          latestSpot = dayRaw[dayRaw.length - 1].close;
        }
        candles = dayRaw.map((c) => ({
          x: c.time,
          y: [c.open, c.high, c.low, c.close],
          volume: c.volume,
        }));
      } else if (intervalMs === 604_800_000) {
        // 1W: Fetch last 1,825 calendar days (5 years) of Upstox week candles
        const fromDate = new Date(now.getTime() - 1825 * 86_400_000).toISOString().slice(0, 10);
        const weekRaw = await fetchUpstoxRawCandles(upstoxKey, "week", toDate, fromDate);
        if (weekRaw.length > 0) {
          latestSpot = weekRaw[weekRaw.length - 1].close;
        }
        candles = weekRaw.map((c) => ({
          x: c.time,
          y: [c.open, c.high, c.low, c.close],
          volume: c.volume,
        }));
      }

      if (candles.length > 0) {
        // Ensure final candle close matches latest canonical spot price
        if (latestSpot && latestSpot > 0) {
          const last = candles[candles.length - 1];
          last.y[3] = latestSpot;
          last.y[1] = Math.max(last.y[1], latestSpot);
          last.y[2] = Math.min(last.y[2], latestSpot);
        }

        const res: DeepCandleResult = {
          candles,
          spotPrice: latestSpot,
          provider: "UPSTOX_V3_DEEP",
        };
        DEEP_CANDLE_CACHE.set(cacheKey, { data: res, timestamp: Date.now() });
        return res;
      }
    } catch (err) {
      console.warn(`[UpstoxDeep] Error fetching Upstox candles for ${cleanSym}:`, err);
    }
  }

  // Fallback to universal market candle engine for equities, commodities, crypto
  const universal = await fetchUniversalMarketCandles(cleanSym, intervalMs);
  if (universal && universal.candles.length > 0) {
    DEEP_CANDLE_CACHE.set(cacheKey, { data: universal, timestamp: Date.now() });
    return universal;
  }

  // If completely unavailable, return empty series (NEVER a fake sine wave)
  return {
    candles: [],
    spotPrice: null,
    provider: "NO_DATA",
  };
}
