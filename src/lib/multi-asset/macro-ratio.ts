// Phase 44A — Gold / Silver macro-bias ratio engine.
//
// This engine is INTENTIONALLY separate from the existing
// `src/lib/metal-ratio/gold-silver-ratio.ts` (Phase 3F.2A, 50/80 thresholds)
// and `src/lib/gold-silver-ratio.ts` (Phase 24A, 55/75 thresholds).
//
// Phase 44 spec thresholds:
//   ratio > 80              -> BUY_SILVER      (gold BEARISH_REL, silver BULLISH_REL)
//   ratio < 55              -> BUY_GOLD        (gold BULLISH_REL, silver BEARISH_REL)
//   55 <= ratio <= 80       -> NEUTRAL / WAIT
//
// The macro ratio provides RELATIVE ASSET BIAS ONLY. It must never emit an
// executable trade — entries/stops/targets come from the technical signal
// engine for XAUUSD or XAGUSD.

export const MACRO_RATIO_VERSION = "MACRO_GS_RATIO_V44A";
export const MACRO_LOWER_THRESHOLD = 55;
export const MACRO_UPPER_THRESHOLD = 80;

export type MacroBias = "BUY_GOLD" | "BUY_SILVER" | "NEUTRAL" | "UNAVAILABLE";
export type AssetRelativeBias =
  | "BULLISH_RELATIVE"
  | "BEARISH_RELATIVE"
  | "NEUTRAL"
  | "UNAVAILABLE";
export type MacroFreshness = "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";
export type NormalizationMethod =
  | "PRICE_PER_TROY_OUNCE"
  | "NATIVE"
  | "UNAVAILABLE";

export interface MacroPriceInput {
  /** Price per unit in the quoted currency. */
  readonly price: number | null;
  readonly quoteCurrency: string | null;
  /** Troy ounces represented per one unit of `price`. */
  readonly troyOuncesPerUnit: number | null;
  readonly timestamp: string | null;
  readonly freshness: MacroFreshness;
  readonly provider: string | null;
}

export interface MacroRatioInput {
  readonly gold: MacroPriceInput | null;
  readonly silver: MacroPriceInput | null;
  readonly now?: number;
}

export interface MacroRatioResult {
  readonly ratio: number | null;
  readonly macroBias: MacroBias;
  readonly goldBias: AssetRelativeBias;
  readonly silverBias: AssetRelativeBias;
  readonly action: "WAIT" | "OBSERVE";
  readonly lowerThreshold: number;
  readonly upperThreshold: number;
  readonly normalizedGold: number | null;
  readonly normalizedSilver: number | null;
  readonly quoteCurrency: string | null;
  readonly normalizationMethod: NormalizationMethod;
  readonly freshness: MacroFreshness;
  readonly calculatedAt: string;
  readonly goldSource: { price: number | null; timestamp: string | null; provider: string | null };
  readonly silverSource: { price: number | null; timestamp: string | null; provider: string | null };
  readonly reason: string | null;
  readonly version: string;
}

function isValidPrice(p: number | null | undefined): p is number {
  return typeof p === "number" && Number.isFinite(p) && p > 0;
}

const FRESHNESS_RANK: Record<MacroFreshness, number> = {
  LIVE: 0,
  DELAYED: 1,
  STALE: 2,
  UNAVAILABLE: 3,
};

function worstFreshness(a: MacroFreshness, b: MacroFreshness): MacroFreshness {
  return FRESHNESS_RANK[a] >= FRESHNESS_RANK[b] ? a : b;
}

function normalize(p: MacroPriceInput): number | null {
  if (!isValidPrice(p.price) || !isValidPrice(p.troyOuncesPerUnit)) return null;
  return p.price / p.troyOuncesPerUnit;
}

function unavailable(
  input: MacroRatioInput,
  reason: string,
  overrides: Partial<MacroRatioResult> = {},
): MacroRatioResult {
  const now = input.now ?? Date.now();
  return {
    ratio: null,
    macroBias: "UNAVAILABLE",
    goldBias: "UNAVAILABLE",
    silverBias: "UNAVAILABLE",
    action: "WAIT",
    lowerThreshold: MACRO_LOWER_THRESHOLD,
    upperThreshold: MACRO_UPPER_THRESHOLD,
    normalizedGold: null,
    normalizedSilver: null,
    quoteCurrency: null,
    normalizationMethod: "UNAVAILABLE",
    freshness: "UNAVAILABLE",
    calculatedAt: new Date(now).toISOString(),
    goldSource: {
      price: input.gold?.price ?? null,
      timestamp: input.gold?.timestamp ?? null,
      provider: input.gold?.provider ?? null,
    },
    silverSource: {
      price: input.silver?.price ?? null,
      timestamp: input.silver?.timestamp ?? null,
      provider: input.silver?.provider ?? null,
    },
    reason,
    version: MACRO_RATIO_VERSION,
    ...overrides,
  };
}

export function classifyMacroBias(ratio: number): {
  macroBias: MacroBias;
  goldBias: AssetRelativeBias;
  silverBias: AssetRelativeBias;
  action: "WAIT" | "OBSERVE";
  reason: string;
} {
  if (!Number.isFinite(ratio)) {
    return {
      macroBias: "UNAVAILABLE",
      goldBias: "UNAVAILABLE",
      silverBias: "UNAVAILABLE",
      action: "WAIT",
      reason: "Invalid ratio.",
    };
  }
  if (ratio > MACRO_UPPER_THRESHOLD) {
    return {
      macroBias: "BUY_SILVER",
      goldBias: "BEARISH_RELATIVE",
      silverBias: "BULLISH_RELATIVE",
      action: "OBSERVE",
      reason: `Ratio ${ratio.toFixed(2)} above ${MACRO_UPPER_THRESHOLD} — silver relatively cheaper.`,
    };
  }
  if (ratio < MACRO_LOWER_THRESHOLD) {
    return {
      macroBias: "BUY_GOLD",
      goldBias: "BULLISH_RELATIVE",
      silverBias: "BEARISH_RELATIVE",
      action: "OBSERVE",
      reason: `Ratio ${ratio.toFixed(2)} below ${MACRO_LOWER_THRESHOLD} — gold relatively cheaper.`,
    };
  }
  return {
    macroBias: "NEUTRAL",
    goldBias: "NEUTRAL",
    silverBias: "NEUTRAL",
    action: "WAIT",
    reason: `Ratio ${ratio.toFixed(2)} inside neutral ${MACRO_LOWER_THRESHOLD}-${MACRO_UPPER_THRESHOLD} band.`,
  };
}

export function computeMacroRatio(input: MacroRatioInput): MacroRatioResult {
  const now = input.now ?? Date.now();
  const { gold, silver } = input;
  if (!gold) return unavailable(input, "Gold input missing.");
  if (!silver) return unavailable(input, "Silver input missing.");
  if (!isValidPrice(gold.price)) return unavailable(input, "Gold price invalid or missing.");
  if (!isValidPrice(silver.price)) return unavailable(input, "Silver price invalid or missing.");

  if (!gold.quoteCurrency || !silver.quoteCurrency || gold.quoteCurrency !== silver.quoteCurrency) {
    return unavailable(input, "Incompatible quote currencies.");
  }

  const normGold = normalize(gold);
  const normSilver = normalize(silver);
  if (normGold == null || normSilver == null || normSilver <= 0) {
    return unavailable(input, "Incompatible units — cannot normalize to per-troy-ounce.", {
      quoteCurrency: gold.quoteCurrency,
    });
  }

  const freshness = worstFreshness(gold.freshness, silver.freshness);
  if (freshness === "UNAVAILABLE" || freshness === "STALE") {
    return unavailable(input, `Stale or unavailable inputs (${freshness}).`, {
      normalizedGold: round2(normGold),
      normalizedSilver: round2(normSilver),
      quoteCurrency: gold.quoteCurrency,
      normalizationMethod: "PRICE_PER_TROY_OUNCE",
      freshness,
    });
  }

  const ratio = normGold / normSilver;
  const cls = classifyMacroBias(ratio);
  return {
    ratio: round2(ratio),
    macroBias: cls.macroBias,
    goldBias: cls.goldBias,
    silverBias: cls.silverBias,
    action: cls.action,
    lowerThreshold: MACRO_LOWER_THRESHOLD,
    upperThreshold: MACRO_UPPER_THRESHOLD,
    normalizedGold: round2(normGold),
    normalizedSilver: round2(normSilver),
    quoteCurrency: gold.quoteCurrency,
    normalizationMethod: "PRICE_PER_TROY_OUNCE",
    freshness,
    calculatedAt: new Date(now).toISOString(),
    goldSource: { price: gold.price, timestamp: gold.timestamp, provider: gold.provider },
    silverSource: { price: silver.price, timestamp: silver.timestamp, provider: silver.provider },
    reason: cls.reason,
    version: MACRO_RATIO_VERSION,
  };
}

/**
 * Threshold-crossing detector. Returns `true` only when the *bias band*
 * (BUY_GOLD / NEUTRAL / BUY_SILVER / UNAVAILABLE) actually changes.
 * Callers persist `currentBias` after emitting an alert.
 */
export function hasCrossedThreshold(
  previousBias: MacroBias | null,
  currentBias: MacroBias,
): boolean {
  if (currentBias === "UNAVAILABLE") return false;
  if (previousBias == null) return false;
  return previousBias !== currentBias;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}