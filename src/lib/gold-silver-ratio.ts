// Phase 24A · Gold–Silver Ratio engine (pure, deterministic).
//
// Signal policy (per Phase 24A spec):
//   ratio < 55            → BUY_GOLD    ("BUY SIGNAL IN GOLD")
//   55 ≤ ratio ≤ 75       → WAIT        ("Neutral 55–75 range")
//   ratio > 75            → BUY_SILVER  ("BUY SIGNAL IN SILVER")
//
// Boundary behavior is exact: 55 → WAIT and 75 → WAIT (inclusive).
// Any incompatibility (missing price, stale, incompatible units) yields
// DATA_UNAVAILABLE — never a trade signal.

export const GOLD_SILVER_RATIO_VERSION = "GOLD_SILVER_RATIO_V1";
export const GOLD_SILVER_LOWER_THRESHOLD = 55;
export const GOLD_SILVER_UPPER_THRESHOLD = 75;
// Freshness policy — quotes older than this become STALE and are treated
// as DATA_UNAVAILABLE for signal purposes.
export const GOLD_SILVER_LIVE_MAX_MS = 5 * 60_000;
export const GOLD_SILVER_DELAYED_MAX_MS = 30 * 60_000;

export type GoldSilverSignal = "BUY_GOLD" | "BUY_SILVER" | "WAIT" | "DATA_UNAVAILABLE";
export type GoldSilverFreshness = "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";
export type GoldSilverDataQuality = "OK" | "MISSING_PRICE" | "INCOMPATIBLE_UNITS" | "STALE";

export type GoldSilverInput = {
  goldPrice: number | null;
  silverPrice: number | null;
  goldUnit?: string; // e.g. "USD/oz"
  silverUnit?: string;
  goldTimestamp?: string | null;
  silverTimestamp?: string | null;
  provider?: string;
  now?: number; // for deterministic tests
};

export type GoldSilverSnapshot = {
  goldPrice: number | null;
  silverPrice: number | null;
  ratio: number | null;
  signal: GoldSilverSignal;
  reason: string;
  lowerThreshold: number;
  upperThreshold: number;
  provider: string;
  goldTimestamp: string | null;
  silverTimestamp: string | null;
  freshness: GoldSilverFreshness;
  dataQuality: GoldSilverDataQuality;
  version: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ageMs(ts: string | null | undefined, now: number): number | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return null;
  return Math.max(0, now - t);
}

function classifyFreshness(a: number | null): GoldSilverFreshness {
  if (a == null) return "UNAVAILABLE";
  if (a <= GOLD_SILVER_LIVE_MAX_MS) return "LIVE";
  if (a <= GOLD_SILVER_DELAYED_MAX_MS) return "DELAYED";
  return "STALE";
}

export function classifyRatio(ratio: number): GoldSilverSignal {
  // Exact 55/75 → WAIT (inclusive neutral band).
  if (ratio < GOLD_SILVER_LOWER_THRESHOLD) return "BUY_GOLD";
  if (ratio > GOLD_SILVER_UPPER_THRESHOLD) return "BUY_SILVER";
  return "WAIT";
}

function unavailable(input: GoldSilverInput, dataQuality: GoldSilverDataQuality, reason: string): GoldSilverSnapshot {
  return {
    goldPrice: input.goldPrice,
    silverPrice: input.silverPrice,
    ratio: null,
    signal: "DATA_UNAVAILABLE",
    reason,
    lowerThreshold: GOLD_SILVER_LOWER_THRESHOLD,
    upperThreshold: GOLD_SILVER_UPPER_THRESHOLD,
    provider: input.provider ?? "unknown",
    goldTimestamp: input.goldTimestamp ?? null,
    silverTimestamp: input.silverTimestamp ?? null,
    freshness: "UNAVAILABLE",
    dataQuality,
    version: GOLD_SILVER_RATIO_VERSION,
  };
}

export function computeGoldSilverSnapshot(input: GoldSilverInput): GoldSilverSnapshot {
  const now = input.now ?? Date.now();
  const { goldPrice, silverPrice } = input;

  if (goldPrice == null || silverPrice == null || silverPrice <= 0 || goldPrice <= 0) {
    return unavailable(input, "MISSING_PRICE", "Gold or silver price is missing.");
  }

  // Unit compatibility — if both units are provided they must match.
  if (input.goldUnit && input.silverUnit && input.goldUnit !== input.silverUnit) {
    return unavailable(
      input,
      "INCOMPATIBLE_UNITS",
      `Incompatible units (gold=${input.goldUnit}, silver=${input.silverUnit}).`,
    );
  }

  const gAge = ageMs(input.goldTimestamp ?? null, now);
  const sAge = ageMs(input.silverTimestamp ?? null, now);
  const worst = Math.max(gAge ?? 0, sAge ?? 0);
  const freshness = input.goldTimestamp && input.silverTimestamp
    ? classifyFreshness(worst)
    : "UNAVAILABLE";

  if (freshness === "STALE" || freshness === "UNAVAILABLE") {
    // Even if we can compute a numeric ratio, do NOT emit a trade signal
    // from stale or timestamp-less data.
    if (freshness === "STALE") {
      return {
        ...unavailable(input, "STALE", "Gold or silver quote is stale."),
        ratio: round2(goldPrice / silverPrice),
        freshness: "STALE",
      };
    }
  }

  const ratio = round2(goldPrice / silverPrice);
  const signal = classifyRatio(ratio);
  const reason =
    signal === "BUY_GOLD"
      ? "Gold–Silver Ratio is below 55."
      : signal === "BUY_SILVER"
        ? "Gold–Silver Ratio is above 75."
        : "Gold–Silver Ratio is inside the neutral 55–75 range.";

  return {
    goldPrice,
    silverPrice,
    ratio,
    signal,
    reason,
    lowerThreshold: GOLD_SILVER_LOWER_THRESHOLD,
    upperThreshold: GOLD_SILVER_UPPER_THRESHOLD,
    provider: input.provider ?? "unknown",
    goldTimestamp: input.goldTimestamp ?? null,
    silverTimestamp: input.silverTimestamp ?? null,
    freshness: freshness === "UNAVAILABLE" ? "LIVE" : freshness,
    dataQuality: "OK",
    version: GOLD_SILVER_RATIO_VERSION,
  };
}

export function distanceFromNearestThreshold(ratio: number): number {
  return Math.min(
    Math.abs(ratio - GOLD_SILVER_LOWER_THRESHOLD),
    Math.abs(ratio - GOLD_SILVER_UPPER_THRESHOLD),
  );
}