// Phase 3F.2A — Gold / Silver ratio types (research-only).
// Pure data shapes. No trading, no execution.

export type MetalNormalizedUnit = "TROY_OUNCE";

export type MetalClassification =
  | "VERIFIED_SPOT_METAL"
  | "TOKENIZED_GOLD"
  | "TOKENIZED_SILVER"
  | "UNKNOWN";

export type MetalFreshness = "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";

export type GoldSilverSignal =
  | "BUY_GOLD"
  | "BUY_SILVER"
  | "NEUTRAL"
  | "UNAVAILABLE";

export interface MetalQuoteInput {
  readonly instrument: string;
  readonly classification: MetalClassification;
  readonly price: number | null;
  readonly quoteCurrency: string | null;
  /** Number of troy ounces represented per one unit of `price`. */
  readonly troyOuncesPerUnit: number | null;
  readonly timestamp: string | null;
  readonly freshness: MetalFreshness;
}

export interface GoldSilverRatioInput {
  readonly gold: MetalQuoteInput | null;
  readonly silver: MetalQuoteInput | null;
  readonly now?: number;
}

export interface GoldSilverRatioResult {
  readonly ratio: number | null;
  readonly signal: GoldSilverSignal;
  readonly goldPrice: number | null;
  readonly silverPrice: number | null;
  readonly normalizedGoldPrice: number | null;
  readonly normalizedSilverPrice: number | null;
  readonly quoteCurrency: string | null;
  readonly normalizedUnit: MetalNormalizedUnit | null;
  readonly goldInstrument: string | null;
  readonly silverInstrument: string | null;
  readonly goldClassification: MetalClassification | null;
  readonly silverClassification: MetalClassification | null;
  readonly calculatedAt: string | null;
  readonly freshness: MetalFreshness;
  readonly isUnitCompatible: boolean;
  readonly isQuoteCompatible: boolean;
  readonly conversionMethod: "PRICE_PER_TROY_OUNCE" | null;
  readonly reason: string | null;
  readonly formulaVersion: string;
  readonly lowerThreshold: number;
  readonly upperThreshold: number;
}

export const METAL_RATIO_FORMULA_VERSION = "gold-silver-ratio@3F.2A";