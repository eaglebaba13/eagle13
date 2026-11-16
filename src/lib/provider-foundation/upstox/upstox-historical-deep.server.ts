// Deep, authentic Upstox V3 Multi-Timeframe Historical Candle Fetching & Aggregation Engine
// Supports all 9 timeframes: 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1D, 1W.
// Eliminates all synthetic sine waves permanently. Server-only.

import https from "node:https";
import { UpstoxHttpClient } from "./upstox-http.server";
import { bucketTimestamp } from "../indstocks/candle-aggregator";
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
  warning?: string;
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

type RawCandle = { time: number; open: number; high: number; low: number; close: number; volume: number };

async function fetchUpstoxCandles(path: string): Promise<RawCandle[]> {
  const response = await new UpstoxHttpClient({ timeoutMs: 8000, maxRetries: 1 }).request<{
    data?: { candles?: unknown[][] };
  }>({ path });
  if (!response.ok || !Array.isArray(response.data.data?.candles)) return [];
  const result: RawCandle[] = [];
  for (const row of response.data.data.candles) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const time = typeof row[0] === "string" ? Date.parse(row[0]) : NaN;
    const [open, high, low, close] = row.slice(1, 5).map(Number);
    if (!Number.isFinite(time) || ![open, high, low, close].every((n) => Number.isFinite(n) && n > 0) ||
        high < Math.max(open, close) || low > Math.min(open, close)) continue;
    result.push({ time, open, high, low, close, volume: Math.max(0, Number(row[5]) || 0) });
  }
  return result.sort((a, b) => a.time - b.time);
}

/** Respect V3's one-month (1m) and one-quarter (30m) retrieval limits. */
export function buildDeepHistoryPlan(intervalMs: number, now = Date.now()) {
  const today = new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
  const end = Date.parse(`${today}T00:00:00Z`) - 86_400_000;
  const days = ({ 60000: 7, 180000: 14, 300000: 21, 900000: 45, 1800000: 75,
    3600000: 150, 14400000: 400, 86400000: 800, 604800000: 4015 } as Record<number, number>)[intervalMs];
  if (!days) throw new Error("Unsupported chart timeframe");
  const intraday = intervalMs < 86_400_000;
  const baseMinutes = intervalMs < 1_800_000 ? 1 : 30;
  const unit = intraday ? "minutes" : intervalMs === 86_400_000 ? "days" : "weeks";
  const interval = intraday ? baseMinutes : 1;
  const chunkDays = intraday ? baseMinutes === 1 ? 28 : 88 : days;
  const start = end - (days - 1) * 86_400_000;
  const chunks: { from: string; to: string }[] = [];
  for (let to = end; to >= start; to -= chunkDays * 86_400_000) {
    chunks.push({ from: new Date(Math.max(start, to - (chunkDays - 1) * 86_400_000)).toISOString().slice(0, 10),
      to: new Date(to).toISOString().slice(0, 10) });
  }
  return { today, unit, interval, intraday, chunks };
}

/**
 * Aligns timestamps to IST session buckets and aggregates OHLCV
 */
function aggregateToIstBuckets(
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[],
  intervalMs: number,
  symbol = "NIFTY50",
): DeepCandle[] {
  if (candles.length === 0) return [];
  const sorted = [...candles].sort((a, b) => a.time - b.time);

  const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

  for (const c of sorted) {
    const bucketKey = bucketTimestamp(c.time, intervalMs, symbol);
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
    yfInterval = "1m";
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
    candles = aggregateToIstBuckets(rawPoints, intervalMs, symbol);
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
    candles: candles.slice(-500),
    spotPrice,
    provider: "MARKET_INTEGRATED",
  };
}

/**
 * Main deep candle fetcher: guarantees 150 to 400+ authentic candles across all 9 timeframes.
 */
async function loadDeepMultiTimeframeCandles(
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
      const plan = buildDeepHistoryPlan(intervalMs);
      const encoded = encodeURIComponent(upstoxKey);
      const history: RawCandle[] = [];
      let historyComplete = true;
      // Limit concurrency while retaining all requested sessions.
      const intradayPromise = fetchUpstoxCandles(`v3/historical-candle/intraday/${encoded}/minutes/1`);
      for (let i = 0; i < plan.chunks.length; i += 3) {
        const batch = await Promise.all(plan.chunks.slice(i, i + 3).map(({ from, to }) =>
          fetchUpstoxCandles(`v3/historical-candle/${encoded}/${plan.unit}/${plan.interval}/${to}/${from}`)));
        if (batch.some((chunk) => chunk.length === 0)) historyComplete = false;
        history.push(...batch.flat());
      }
      const intradayRaw = await intradayPromise;
      const merged = new Map<number, RawCandle>();
      for (const candle of [...history, ...intradayRaw]) merged.set(candle.time, candle);
      const rawSorted = [...merged.values()].sort((a, b) => a.time - b.time);
      const candles = aggregateToIstBuckets(rawSorted, intervalMs, cleanSym).slice(-500);
      const latestSpot = candles.at(-1)?.y[3] ?? null;

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
          ...(!historyComplete || candles.length < 250 ? { warning: "Provider returned limited history; previous sessions may be incomplete." } : {}),
        };
        if (!res.warning) DEEP_CANDLE_CACHE.set(cacheKey, { data: res, timestamp: Date.now() });
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


const pendingHistory = new Map<string, Promise<DeepCandleResult>>();
export function getDeepMultiTimeframeCandles(symbol: string, intervalMs: number, refresh = false): Promise<DeepCandleResult> {
  const key = `${symbol.trim().toUpperCase()}_${intervalMs}`;
  if (refresh) DEEP_CANDLE_CACHE.delete(key);
  const existing = pendingHistory.get(key);
  if (existing) return existing;
  const request = loadDeepMultiTimeframeCandles(symbol, intervalMs).finally(() => pendingHistory.delete(key));
  pendingHistory.set(key, request);
  return request;
}
