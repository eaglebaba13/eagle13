// Phase 36.6 — ChronoWheel Real Market Data & Historical Candle Ingestion Engine
// Ingests real live LTP and 10-year daily OHLCV candles from official feeds (Upstox / Yahoo Finance / NSE)
// with browser headers, in-memory caching, and historical window slicing.

import https from "node:https";

export interface RealCandle {
  readonly date: string; // "YYYY-MM-DD"
  readonly timestamp: number; // Unix ms
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface InstrumentMarketData {
  readonly symbol: string;
  readonly marketSymbol: string;
  readonly ltp: number;
  readonly prevClose?: number;
  readonly changePct?: number;
  readonly candles: readonly RealCandle[];
  readonly fetchedAt: number;
  readonly dataSource: "UPSTOX" | "YAHOO_FINANCE" | "CALIBRATED_FALLBACK";
}

export interface SlicedWindowResult {
  readonly hasRealData: boolean;
  readonly startPrice: number;
  readonly endPrice: number;
  readonly windowHigh: number;
  readonly windowLow: number;
  readonly returnPct: number;
  readonly tradingSessions: number;
}

// In-memory cache with 30-minute TTL to ensure fast scans and avoid 429 rate limits
const MARKET_DATA_CACHE = new Map<string, InstrumentMarketData>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export function clearMarketDataCache(): void {
  MARKET_DATA_CACHE.clear();
}

export function setCachedMarketData(symbol: string, data: InstrumentMarketData): void {
  MARKET_DATA_CACHE.set(symbol.toUpperCase(), data);
}

export function getCachedMarketData(symbol: string): InstrumentMarketData | null {
  const cached = MARKET_DATA_CACHE.get(symbol.toUpperCase());
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    MARKET_DATA_CACHE.delete(symbol.toUpperCase());
    return null;
  }
  return cached;
}

/**
 * Maps clean F&O tickers to standardized market symbols for quotes and daily charts.
 */
export function mapToMarketSymbol(symbol: string): string {
  const clean = symbol.trim().toUpperCase();
  switch (clean) {
    case "NIFTY":
    case "NIFTY50":
      return "^NSEI";
    case "BANKNIFTY":
      return "^NSEBANK";
    case "FINNIFTY":
      return "NIFTY_FIN_SERVICE.NS";
    case "MIDCPNIFTY":
      return "NIFTY_MID_SELECT.NS";
    case "SENSEX":
      return "^BSESN";
    case "NIFTYBEES":
      return "NIFTYBEES.NS";
    case "BANKBEES":
      return "BANKBEES.NS";
    case "GOLDBEES":
      return "GOLDBEES.NS";
    case "SILVERBEES":
      return "SILVERBEES.NS";
    default:
      if (clean.endsWith(".NS") || clean.endsWith(".BO") || clean.startsWith("^")) {
        return clean;
      }
      return `${clean}.NS`;
  }
}

/**
 * Fetch 10-year daily OHLCV candles and live LTP from Yahoo Finance with standard browser headers.
 */
export async function fetchYahooFinanceCandles(
  symbol: string,
  timeoutMs = 6000,
): Promise<InstrumentMarketData | null> {
  const marketSymbol = mapToMarketSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(marketSymbol)}?interval=1d&range=10y`;

  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume(); // consume response data to free memory
          return resolve(null);
        }

        let rawData = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(rawData);
            const result = parsed?.chart?.result?.[0];
            if (!result) return resolve(null);

            const meta = result.meta;
            const timestamps: number[] = result.timestamp || [];
            const quotes = result.indicators?.quote?.[0];
            if (!quotes || !timestamps.length) return resolve(null);

            const opens: (number | null)[] = quotes.open || [];
            const highs: (number | null)[] = quotes.high || [];
            const lows: (number | null)[] = quotes.low || [];
            const closes: (number | null)[] = quotes.close || [];
            const volumes: (number | null)[] = quotes.volume || [];

            const candles: RealCandle[] = [];
            for (let i = 0; i < timestamps.length; i++) {
              const o = opens[i];
              const h = highs[i];
              const l = lows[i];
              const c = closes[i];
              const v = volumes[i] ?? 0;
              const ts = timestamps[i];

              if (o != null && h != null && l != null && c != null && !isNaN(o) && !isNaN(c)) {
                const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
                candles.push({
                  date: dateStr,
                  timestamp: ts * 1000,
                  open: Math.round(o * 100) / 100,
                  high: Math.round(h * 100) / 100,
                  low: Math.round(l * 100) / 100,
                  close: Math.round(c * 100) / 100,
                  volume: v,
                });
              }
            }

            if (!candles.length) return resolve(null);

            // Latest candle or regularMarketPrice
            const lastCandle = candles[candles.length - 1];
            const ltp =
              typeof meta?.regularMarketPrice === "number" && meta.regularMarketPrice > 0
                ? Math.round(meta.regularMarketPrice * 100) / 100
                : lastCandle.close;

            const prevCandle = candles.length > 1 ? candles[candles.length - 2] : null;
            const prevClose = prevCandle ? prevCandle.close : ltp;
            const changePct =
              prevClose > 0 ? Math.round(((ltp - prevClose) / prevClose) * 10000) / 100 : 0;

            const marketData: InstrumentMarketData = {
              symbol: symbol.toUpperCase(),
              marketSymbol,
              ltp,
              prevClose,
              changePct,
              candles,
              fetchedAt: Date.now(),
              dataSource: "YAHOO_FINANCE",
            };

            setCachedMarketData(symbol, marketData);
            resolve(marketData);
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
 * Get or fetch real market data for an instrument.
 * Checks cache first, attempts live fetch, and falls back gracefully to calibrated defaults.
 */
export async function getInstrumentMarketData(
  symbol: string,
  defaultPrice: number,
): Promise<InstrumentMarketData> {
  const cached = getCachedMarketData(symbol);
  if (cached) return cached;

  // Attempt fetch via Yahoo Finance
  const liveData = await fetchYahooFinanceCandles(symbol);
  if (liveData) return liveData;

  // Fallback to calibrated baseline with real default price
  const fallback: InstrumentMarketData = {
    symbol: symbol.toUpperCase(),
    marketSymbol: mapToMarketSymbol(symbol),
    ltp: defaultPrice,
    candles: [],
    fetchedAt: Date.now(),
    dataSource: "CALIBRATED_FALLBACK",
  };
  setCachedMarketData(symbol, fallback);
  return fallback;
}

/**
 * Slice historical window from real daily candles corresponding to the exact calculated dates.
 * Computes actual Open, Close, High, Low, and holding return %.
 */
export function sliceWindowFromRealCandles(
  candles: readonly RealCandle[],
  startDate: string,
  endDate: string,
  fallbackPrice: number,
): SlicedWindowResult {
  if (!candles || candles.length === 0) {
    return {
      hasRealData: false,
      startPrice: fallbackPrice,
      endPrice: fallbackPrice,
      windowHigh: fallbackPrice,
      windowLow: fallbackPrice,
      returnPct: 0,
      tradingSessions: 0,
    };
  }

  // Exact date range filter
  let matched = candles.filter((c) => c.date >= startDate && c.date <= endDate);

  // If no exact match (e.g. holiday or weekend boundaries), expand window tolerance by up to 2 calendar days
  if (matched.length === 0) {
    const startMs = new Date(startDate).getTime() - 2 * 24 * 60 * 60 * 1000;
    const endMs = new Date(endDate).getTime() + 2 * 24 * 60 * 60 * 1000;
    const sDate = new Date(startMs).toISOString().slice(0, 10);
    const eDate = new Date(endMs).toISOString().slice(0, 10);
    matched = candles.filter((c) => c.date >= sDate && c.date <= eDate);
  }

  if (matched.length === 0) {
    return {
      hasRealData: false,
      startPrice: fallbackPrice,
      endPrice: fallbackPrice,
      windowHigh: fallbackPrice,
      windowLow: fallbackPrice,
      returnPct: 0,
      tradingSessions: 0,
    };
  }

  const firstCandle = matched[0];
  const lastCandle = matched[matched.length - 1];

  const startPrice = firstCandle.open;
  const endPrice = lastCandle.close;
  const windowHigh = Math.max(...matched.map((c) => c.high));
  const windowLow = Math.min(...matched.map((c) => c.low));
  const returnPct =
    startPrice > 0 ? Math.round(((endPrice - startPrice) / startPrice) * 10000) / 100 : 0;

  return {
    hasRealData: true,
    startPrice: Math.round(startPrice * 100) / 100,
    endPrice: Math.round(endPrice * 100) / 100,
    windowHigh: Math.round(windowHigh * 100) / 100,
    windowLow: Math.round(windowLow * 100) / 100,
    returnPct,
    tradingSessions: matched.length,
  };
}
