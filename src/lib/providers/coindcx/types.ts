// Phase 3F — CoinDCX market-data types.
// Market-data only. No order/execution types allowed.

export type CoindcxAssetClass = "CRYPTO_MAJOR" | "TOKENIZED_METAL" | "OTHER";

export type CoindcxMarketStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "UNKNOWN";

export type MarketSourceStatus =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "UNAVAILABLE"
  | "TRADING_DISABLED";

export interface CoindcxMarket {
  /** CoinDCX pair symbol e.g. "BTCUSDT", "BTCINR", "PAXGUSDT". */
  readonly pair: string;
  /** CoinDCX ecode e.g. "I" (INR), "B" (Binance/USDT), "HB", "KC". */
  readonly ecode: string | null;
  readonly base: string;
  readonly quote: string;
  readonly assetClass: CoindcxAssetClass;
  readonly status: CoindcxMarketStatus;
  readonly minQuantity: number | null;
  readonly maxQuantity: number | null;
  readonly tickSize: number | null;
  readonly baseCurrencyPrecision: number | null;
  readonly targetCurrencyPrecision: number | null;
  /** Underlying commodity when assetClass = TOKENIZED_METAL. */
  readonly linkedUnderlying: "GOLD" | "SILVER" | null;
  readonly notes: readonly string[];
}

export interface CoindcxTicker {
  readonly pair: string;
  readonly last: number;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly high24h: number | null;
  readonly low24h: number | null;
  readonly change24hPct: number | null;
  readonly volume24h: number | null;
  readonly quoteVolume24h: number | null;
  readonly timestamp: string;
}

export interface CoindcxCandle {
  readonly time: string; // ISO close time (UTC)
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null;
}

export interface CoindcxDataSnapshotMeta {
  readonly providerId: "COINDCX";
  readonly endpoint: string;
  readonly status: MarketSourceStatus;
  readonly latencyMs: number;
  readonly fetchedAt: string;
  readonly ageSec: number | null;
  readonly safeError: string | null;
  readonly upstreamCode: string | null;
  readonly requestId: string | null;
  readonly tradingEnabledFlag: boolean;
  readonly sessionSemantics: "24x7";
}

export interface CoindcxMarketSnapshot {
  readonly market: CoindcxMarket;
  readonly ticker: CoindcxTicker | null;
  readonly meta: CoindcxDataSnapshotMeta;
}

export interface CoindcxCandleSnapshot {
  readonly market: CoindcxMarket;
  readonly interval: string;
  readonly candles: readonly CoindcxCandle[];
  readonly meta: CoindcxDataSnapshotMeta;
}

export interface CoindcxDiagnostics {
  readonly providerId: "COINDCX";
  readonly tradingEnabled: false; // never true — enforced by code
  readonly executionGuardActive: true;
  readonly discoveredMarkets: number;
  readonly cryptoMajors: number;
  readonly tokenizedMetals: number;
  readonly lastDiscoveryAt: string | null;
  readonly lastDiscoveryLatencyMs: number | null;
  readonly lastError: string | null;
  readonly endpointsAllowlisted: readonly string[];
  readonly generatedAt: string;
}
