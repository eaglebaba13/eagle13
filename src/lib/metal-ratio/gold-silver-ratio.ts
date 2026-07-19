// Phase 3F.2A — Gold / Silver ratio engine (deterministic, research-only).
//
// Signal rules (Phase 3F.2A spec, DIFFERENT from the Phase 24A engine):
//   ratio > 80              → BUY_SILVER
//   ratio < 50              → BUY_GOLD
//   50 ≤ ratio ≤ 80         → NEUTRAL (inclusive band)
//
// This module is intentionally separate from `src/lib/gold-silver-ratio.ts`
// (Phase 24A, thresholds 55/75). We do not modify existing formulas.

import type {
  GoldSilverRatioInput,
  GoldSilverRatioResult,
  GoldSilverSignal,
  MetalQuoteInput,
  MetalFreshness,
} from "./types";
import { METAL_RATIO_FORMULA_VERSION } from "./types";

export const GOLD_SILVER_BUY_GOLD_THRESHOLD = 50;
export const GOLD_SILVER_BUY_SILVER_THRESHOLD = 80;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const FRESHNESS_RANK: Record<MetalFreshness, number> = {
  LIVE: 0,
  DELAYED: 1,
  STALE: 2,
  UNAVAILABLE: 3,
};

export function worstFreshness(a: MetalFreshness, b: MetalFreshness): MetalFreshness {
  return FRESHNESS_RANK[a] >= FRESHNESS_RANK[b] ? a : b;
}

export function classifyRatio(ratio: number): GoldSilverSignal {
  if (!Number.isFinite(ratio)) return "UNAVAILABLE";
  if (ratio > GOLD_SILVER_BUY_SILVER_THRESHOLD) return "BUY_SILVER";
  if (ratio < GOLD_SILVER_BUY_GOLD_THRESHOLD) return "BUY_GOLD";
  return "NEUTRAL";
}

function isValidPrice(p: number | null | undefined): p is number {
  return typeof p === "number" && Number.isFinite(p) && p > 0;
}

function unavailable(
  input: GoldSilverRatioInput,
  reason: string,
  overrides: Partial<GoldSilverRatioResult> = {},
): GoldSilverRatioResult {
  return {
    ratio: null,
    signal: "UNAVAILABLE",
    goldPrice: input.gold?.price ?? null,
    silverPrice: input.silver?.price ?? null,
    normalizedGoldPrice: null,
    normalizedSilverPrice: null,
    quoteCurrency: input.gold?.quoteCurrency ?? input.silver?.quoteCurrency ?? null,
    normalizedUnit: null,
    goldInstrument: input.gold?.instrument ?? null,
    silverInstrument: input.silver?.instrument ?? null,
    goldClassification: input.gold?.classification ?? null,
    silverClassification: input.silver?.classification ?? null,
    calculatedAt: null,
    freshness: "UNAVAILABLE",
    isUnitCompatible: false,
    isQuoteCompatible: false,
    conversionMethod: null,
    reason,
    formulaVersion: METAL_RATIO_FORMULA_VERSION,
    lowerThreshold: GOLD_SILVER_BUY_GOLD_THRESHOLD,
    upperThreshold: GOLD_SILVER_BUY_SILVER_THRESHOLD,
    ...overrides,
  };
}

function normalizePerOunce(q: MetalQuoteInput): number | null {
  if (!isValidPrice(q.price)) return null;
  if (!isValidPrice(q.troyOuncesPerUnit)) return null;
  // price is per unit; troyOuncesPerUnit tells how many oz each unit represents.
  return q.price / q.troyOuncesPerUnit;
}

export function computeGoldSilverRatio(
  input: GoldSilverRatioInput,
): GoldSilverRatioResult {
  const now = input.now ?? Date.now();
  const { gold, silver } = input;

  if (!gold) return unavailable(input, "Gold instrument unavailable — ratio not calculated");
  if (!silver) return unavailable(input, "Silver instrument unavailable — ratio not calculated");

  if (!isValidPrice(gold.price)) return unavailable(input, "Gold price missing or invalid");
  if (!isValidPrice(silver.price)) return unavailable(input, "Silver price missing or invalid");

  const isQuoteCompatible =
    !!gold.quoteCurrency &&
    !!silver.quoteCurrency &&
    gold.quoteCurrency === silver.quoteCurrency;
  if (!isQuoteCompatible) {
    return unavailable(input, "Gold/Silver Ratio unavailable — incompatible quote currencies", {
      quoteCurrency: null,
    });
  }

  const normGold = normalizePerOunce(gold);
  const normSilver = normalizePerOunce(silver);
  const isUnitCompatible = normGold != null && normSilver != null;
  if (!isUnitCompatible) {
    return unavailable(input, "Gold/Silver Ratio unavailable — incompatible units", {
      isQuoteCompatible: true,
      quoteCurrency: gold.quoteCurrency,
    });
  }

  const freshness = worstFreshness(gold.freshness, silver.freshness);
  if (freshness === "UNAVAILABLE" || freshness === "STALE") {
    return unavailable(input, `Gold/Silver Ratio unavailable — ${freshness.toLowerCase()} data`, {
      normalizedGoldPrice: round2(normGold!),
      normalizedSilverPrice: round2(normSilver!),
      quoteCurrency: gold.quoteCurrency,
      normalizedUnit: "TROY_OUNCE",
      isUnitCompatible: true,
      isQuoteCompatible: true,
      conversionMethod: "PRICE_PER_TROY_OUNCE",
      freshness,
    });
  }

  const ratio = normGold! / normSilver!;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return unavailable(input, "Gold/Silver Ratio unavailable — invalid computation");
  }
  const signal = classifyRatio(ratio);
  const reason =
    signal === "BUY_SILVER"
      ? "Ratio above 80 — Silver relatively cheaper under configured methodology."
      : signal === "BUY_GOLD"
        ? "Ratio below 50 — Gold relatively cheaper under configured methodology."
        : "Ratio inside neutral 50–80 band.";

  return {
    ratio,
    signal,
    goldPrice: gold.price,
    silverPrice: silver.price,
    normalizedGoldPrice: round2(normGold!),
    normalizedSilverPrice: round2(normSilver!),
    quoteCurrency: gold.quoteCurrency,
    normalizedUnit: "TROY_OUNCE",
    goldInstrument: gold.instrument,
    silverInstrument: silver.instrument,
    goldClassification: gold.classification,
    silverClassification: silver.classification,
    calculatedAt: new Date(now).toISOString(),
    freshness,
    isUnitCompatible: true,
    isQuoteCompatible: true,
    conversionMethod: "PRICE_PER_TROY_OUNCE",
    reason,
    formulaVersion: METAL_RATIO_FORMULA_VERSION,
    lowerThreshold: GOLD_SILVER_BUY_GOLD_THRESHOLD,
    upperThreshold: GOLD_SILVER_BUY_SILVER_THRESHOLD,
  };
}

/**
 * Registry of known tokenized metal bases → troy ounces per token.
 * Unknown bases return `null` and force an INCOMPATIBLE_UNITS result.
 */
const TOKEN_TROY_OUNCES: Record<string, number> = {
  PAXG: 1, // Paxos Gold — 1 token = 1 troy oz
  XAUT: 1, // Tether Gold — 1 token = 1 troy oz
};

export function troyOuncesForToken(base: string): number | null {
  return TOKEN_TROY_OUNCES[base.toUpperCase()] ?? null;
}

export function formatRatio(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return round2(ratio).toFixed(2);
}