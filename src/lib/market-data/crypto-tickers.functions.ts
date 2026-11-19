// Live 24hr Crypto Ticker Fetcher for Watchlist & Live Chart Synchronization.
// Public API allowlisted: Binance / CoinDCX public tickers with in-memory caching.
// Server-only data fetching, client-safe types.

import { createServerFn } from "@tanstack/react-start";
import https from "node:https";

export interface CryptoTickerItem {
  readonly symbol: string;
  readonly price: number;
  readonly changePct: number;
  readonly high24h?: number;
  readonly low24h?: number;
  readonly volume24h?: number;
  readonly updatedAt: number;
}

let cachedTickers: Record<string, CryptoTickerItem> = {
  BTCUSDT: { symbol: "BTCUSDT", price: 64515.0, changePct: 0.85, updatedAt: 0 },
  ETHUSDT: { symbol: "ETHUSDT", price: 2650.0, changePct: -0.42, updatedAt: 0 },
  SOLUSDT: { symbol: "SOLUSDT", price: 185.5, changePct: 2.15, updatedAt: 0 },
  XRPUSDT: { symbol: "XRPUSDT", price: 0.58, changePct: 1.10, updatedAt: 0 },
  BTCINR: { symbol: "BTCINR", price: 7570000.0, changePct: 0.90, updatedAt: 0 },
  ETHINR: { symbol: "ETHINR", price: 224000.0, changePct: -0.35, updatedAt: 0 },
};

let lastFetchTime = 0;
const CACHE_TTL_MS = 10_000;

function fetchJson<T>(url: string, timeoutMs = 5000): Promise<T | null> {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "EagleBABA-Crypto-Feeder/2.0",
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

export async function fetchLiveCryptoTickersImpl(): Promise<Record<string, CryptoTickerItem>> {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL_MS && lastFetchTime > 0) {
    return cachedTickers;
  }

  try {
    // 1. Try Binance 24hr ticker API (fast, worldwide canonical)
    const binanceUrl =
      'https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT"]';
    interface BinanceTicker {
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
      highPrice: string;
      lowPrice: string;
      volume: string;
    }

    const binanceData = await fetchJson<BinanceTicker[]>(binanceUrl, 4000);
    if (Array.isArray(binanceData) && binanceData.length > 0) {
      const updated = { ...cachedTickers };
      for (const t of binanceData) {
        const p = parseFloat(t.lastPrice);
        const cp = parseFloat(t.priceChangePercent);
        if (Number.isFinite(p) && p > 0) {
          updated[t.symbol] = {
            symbol: t.symbol,
            price: p,
            changePct: Number.isFinite(cp) ? Math.round(cp * 100) / 100 : 0,
            high24h: parseFloat(t.highPrice) || undefined,
            low24h: parseFloat(t.lowPrice) || undefined,
            volume24h: parseFloat(t.volume) || undefined,
            updatedAt: now,
          };
        }
      }

      // Compute INR equivalents if USDINR ~89.5
      if (updated.BTCUSDT?.price) {
        updated.BTCINR = {
          symbol: "BTCINR",
          price: Math.round(updated.BTCUSDT.price * 89.5),
          changePct: updated.BTCUSDT.changePct,
          updatedAt: now,
        };
      }
      if (updated.ETHUSDT?.price) {
        updated.ETHINR = {
          symbol: "ETHINR",
          price: Math.round(updated.ETHUSDT.price * 89.5),
          changePct: updated.ETHUSDT.changePct,
          updatedAt: now,
        };
      }

      cachedTickers = updated;
      lastFetchTime = now;
      return cachedTickers;
    }
  } catch {
    // Fall back to CoinDCX
  }

  try {
    // 2. Try CoinDCX public ticker endpoint
    interface CoinDcxTicker {
      market: string;
      last_price: number | string;
      change_24_hour: number | string;
    }

    const coindcxData = await fetchJson<CoinDcxTicker[]>(
      "https://public.coindcx.com/exchange/ticker",
      4000,
    );
    if (Array.isArray(coindcxData)) {
      const updated = { ...cachedTickers };
      const map: Record<string, string> = {
        BTCUSDT: "BTCUSDT",
        ETHUSDT: "ETHUSDT",
        SOLUSDT: "SOLUSDT",
        XRPUSDT: "XRPUSDT",
        BTCINR: "BTCINR",
        ETHINR: "ETHINR",
      };

      for (const item of coindcxData) {
        const canonical = map[item.market];
        if (canonical) {
          const p = typeof item.last_price === "number" ? item.last_price : parseFloat(item.last_price);
          const cp =
            typeof item.change_24_hour === "number"
              ? item.change_24_hour
              : parseFloat(item.change_24_hour);
          if (Number.isFinite(p) && p > 0) {
            updated[canonical] = {
              symbol: canonical,
              price: p,
              changePct: Number.isFinite(cp) ? Math.round(cp * 100) / 100 : 0,
              updatedAt: now,
            };
          }
        }
      }
      cachedTickers = updated;
      lastFetchTime = now;
      return cachedTickers;
    }
  } catch {
    // Fall back to cached baseline
  }

  return cachedTickers;
}

export const getCryptoTickers = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, CryptoTickerItem>> => {
    return fetchLiveCryptoTickersImpl();
  },
);

export const notifyPriceAlertCreated = createServerFn({ method: "POST" })
  .validator(
    (input: unknown) =>
      input as { symbol: string; targetPrice: number; direction: string; ltp: number },
  )
  .handler(async ({ data }) => {
    const { requireStrictSuperadmin } = await import("../auth/admin-auth.server");
    await requireStrictSuperadmin();
    const { sendPriceAlertTelegram } = await import("../smart-alerts/telegram-delivery.server");
    return sendPriceAlertTelegram({
      symbol: data.symbol,
      targetPrice: data.targetPrice,
      direction: data.direction,
      currentLtp: data.ltp,
      note: `Live chart trigger set at ${data.targetPrice}`,
    });
  });
