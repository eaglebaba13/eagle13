// Phase 3F — CoinDCX allowlisted public endpoints.
// Market-data only. Private trading endpoints are intentionally absent.
// Do not add order/balance/account endpoints to this file.

export const COINDCX_PUBLIC_BASE = "https://api.coindcx.com";
export const COINDCX_PUBLIC_MARKET_BASE = "https://public.coindcx.com";

/** Public endpoint allowlist — the ONLY URLs the market-data adapter may hit. */
export const COINDCX_ENDPOINTS = {
  marketsDetails: `${COINDCX_PUBLIC_BASE}/exchange/v1/markets_details`,
  ticker: `${COINDCX_PUBLIC_BASE}/exchange/ticker`,
  candles: `${COINDCX_PUBLIC_MARKET_BASE}/market_data/candles`,
  orderbook: `${COINDCX_PUBLIC_MARKET_BASE}/market_data/orderbook`,
  trades: `${COINDCX_PUBLIC_MARKET_BASE}/market_data/trade_history`,
} as const;

export type CoindcxEndpointId = keyof typeof COINDCX_ENDPOINTS;

/** Guard against accidental use of any URL outside the allowlist. */
export function assertAllowlistedEndpoint(url: string): void {
  const ok = Object.values(COINDCX_ENDPOINTS).some((base) => url.startsWith(base));
  if (!ok) {
    throw new Error("COINDCX_ENDPOINT_NOT_ALLOWLISTED");
  }
}

/** Timeframe → CoinDCX interval mapping. Only officially supported intervals. */
export const COINDCX_INTERVAL_MAP = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "1d": "1d",
} as const;

export type CoindcxSupportedInterval = keyof typeof COINDCX_INTERVAL_MAP;
