// Phase 3F.2 — Canonical multi-asset market types.
// Market-data only. No trading, no orders, no positions.

export type AssetClass =
  | "EQUITY"
  | "INDEX"
  | "OPTION"
  | "CRYPTO"
  | "TOKENIZED_METAL"
  | "COMMODITY"
  | "FOREX";

export type AssetGroup = "NSE" | "CRYPTO" | "COMMODITY" | "FOREX";

export type MarketQuoteStatus =
  | "LIVE"
  | "DELAYED"
  | "OFFLINE"
  | "UNAVAILABLE";

/**
 * Canonical normalised quote every provider produces. Providers MUST NOT
 * fabricate prices — an unsupported symbol MUST be returned with
 * `status = "UNAVAILABLE"` and `last = null`.
 */
export interface MarketQuote {
  readonly symbol: string;          // canonical registry symbol e.g. "NIFTY50", "BTC", "GOLD", "USDINR"
  readonly displayName: string;
  readonly assetClass: AssetClass;
  readonly group: AssetGroup;
  readonly provider: string;        // e.g. "yahoo", "coindcx", "upstox", "unavailable"
  readonly last: number | null;
  readonly changeAbs: number | null;
  readonly changePct: number | null;
  readonly currency: string | null; // e.g. "INR", "USD", "USDT"
  readonly status: MarketQuoteStatus;
  readonly ageSec: number | null;
  readonly updatedAt: string | null; // ISO
  readonly reason?: string;         // e.g. "provider-not-wired"
}

export interface MarketGroupSummary {
  readonly group: AssetGroup;
  readonly displayName: string;
  readonly totalAssets: number;
  readonly online: number;
  readonly offline: number;
  readonly unavailable: number;
  readonly topGainer: MarketQuote | null;
  readonly topLoser: MarketQuote | null;
  readonly bestPerformer: MarketQuote | null;
  readonly worstPerformer: MarketQuote | null;
  readonly freshestAgeSec: number | null;
  readonly worstStatus: MarketQuoteStatus;
  readonly providerHealth: "OK" | "DEGRADED" | "UNAVAILABLE";
}

export interface MultiAssetSnapshot {
  readonly generatedAt: string;
  readonly quotes: readonly MarketQuote[];
  readonly summaries: readonly MarketGroupSummary[];
}

/**
 * Provider abstraction contract. Every provider — NSE, crypto,
 * commodities, forex — MUST implement this. Dashboard components MUST NOT
 * import provider modules directly; they consume `MultiAssetSnapshot`.
 */
export interface MarketProvider {
  readonly id: string;
  readonly group: AssetGroup;
  discover(): Promise<readonly string[]>;
  markets(): Promise<readonly MarketQuote[]>;
  ticker(symbol: string): Promise<MarketQuote | null>;
  history(): Promise<readonly []>;
  health(): Promise<{ status: "OK" | "DEGRADED" | "UNAVAILABLE"; reason?: string }>;
}

export const GROUP_DISPLAY_NAMES: Readonly<Record<AssetGroup, string>> = {
  NSE: "NSE",
  CRYPTO: "Crypto",
  COMMODITY: "Commodities",
  FOREX: "Forex",
};