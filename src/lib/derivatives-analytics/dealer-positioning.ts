// Pure, deterministic Dealer Positioning & Institutional Flow synthesizer.
// Unifies:
//   1. Put/Call Ratio (PCR-OI)
//   2. Max Pain Strike & Distance from Spot (Magnet effect)
//   3. Net Gamma Exposure (GEX) & Zero-Gamma Flip boundary
//   4. Open Interest Build-Up Dynamics

import type { BuildupRegime } from "./oi-buildup";

export type InstitutionalBias =
  | "STRONG_BULLISH"
  | "BULLISH"
  | "NEUTRAL"
  | "BEARISH"
  | "STRONG_BEARISH";

export interface PositioningFactor {
  readonly score: number; // -1 to +1 normalized
  readonly weight: number; // 0 to 1
  readonly label: string;
  readonly status: "BULLISH" | "BEARISH" | "NEUTRAL";
}

export interface DealerPositioningInput {
  readonly pcrOi: number | null;
  readonly maxPainStrike: number | null;
  readonly spotPrice: number | null;
  readonly totalNetGex: number | null;
  readonly zeroGammaFlipLevel: number | null;
  readonly gammaWallStrike: number | null;
  readonly dominantBuildup?: BuildupRegime | null;
  readonly institutionalSentiment?: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
}

export interface DealerPositioningResult {
  readonly bias: InstitutionalBias;
  readonly institutionalScore: number; // -1.0 (Extreme Bearish) to +1.0 (Extreme Bullish)
  readonly confidence: number; // 0.0 to 1.0
  readonly commentary: string;
  readonly factors: {
    readonly pcr: PositioningFactor;
    readonly maxPain: PositioningFactor;
    readonly gamma: PositioningFactor;
    readonly buildup: PositioningFactor;
  };
  readonly keyLevels: {
    readonly spot: number | null;
    readonly maxPain: number | null;
    readonly zeroGammaFlip: number | null;
    readonly gammaWall: number | null;
  };
}

export function synthesizeDealerPositioning(
  input: DealerPositioningInput,
): DealerPositioningResult {
  const {
    pcrOi,
    maxPainStrike,
    spotPrice,
    totalNetGex,
    zeroGammaFlipLevel,
    gammaWallStrike,
    dominantBuildup,
    institutionalSentiment,
  } = input;

  // 1. PCR Factor (Weight: 0.30)
  let pcrScore = 0;
  let pcrStatus: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let pcrLabel = "PCR unavailable";

  if (pcrOi != null && Number.isFinite(pcrOi)) {
    if (pcrOi >= 1.25) {
      pcrScore = 0.8;
      pcrStatus = "BULLISH";
      pcrLabel = `Strong Put Writing (PCR: ${pcrOi.toFixed(2)})`;
    } else if (pcrOi >= 1.05) {
      pcrScore = 0.4;
      pcrStatus = "BULLISH";
      pcrLabel = `Mild Bullish Put Skew (PCR: ${pcrOi.toFixed(2)})`;
    } else if (pcrOi <= 0.75) {
      pcrScore = -0.8;
      pcrStatus = "BEARISH";
      pcrLabel = `Heavy Call Writing Overhead (PCR: ${pcrOi.toFixed(2)})`;
    } else if (pcrOi <= 0.9) {
      pcrScore = -0.4;
      pcrStatus = "BEARISH";
      pcrLabel = `Mild Bearish Call Skew (PCR: ${pcrOi.toFixed(2)})`;
    } else {
      pcrScore = 0;
      pcrStatus = "NEUTRAL";
      pcrLabel = `Balanced PCR (${pcrOi.toFixed(2)})`;
    }
  }

  // 2. Max Pain Factor (Weight: 0.25)
  // When spot is below Max Pain, Max Pain pulls spot upward towards expiration.
  // When spot is above Max Pain, Max Pain exerts downward gravitational drag.
  let mpScore = 0;
  let mpStatus: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let mpLabel = "Max Pain unavailable";

  if (
    maxPainStrike != null &&
    spotPrice != null &&
    Number.isFinite(maxPainStrike) &&
    Number.isFinite(spotPrice) &&
    spotPrice > 0
  ) {
    const diff = maxPainStrike - spotPrice;
    const diffPct = (diff / spotPrice) * 100;

    if (diffPct > 0.4) {
      mpScore = Math.min(1, diffPct / 1.5);
      mpStatus = "BULLISH";
      mpLabel = `Max Pain (${maxPainStrike}) is +${diff.toFixed(0)} pts above spot (upward magnet)`;
    } else if (diffPct < -0.4) {
      mpScore = Math.max(-1, diffPct / 1.5);
      mpStatus = "BEARISH";
      mpLabel = `Max Pain (${maxPainStrike}) is ${diff.toFixed(0)} pts below spot (downward drag)`;
    } else {
      mpScore = 0;
      mpStatus = "NEUTRAL";
      mpLabel = `Spot is pinned near Max Pain strike ${maxPainStrike} (${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(2)}%)`;
    }
  }

  // 3. Gamma / GEX Factor (Weight: 0.25)
  let gexScore = 0;
  let gexStatus: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let gexLabel = "Gamma profile unavailable";

  if (totalNetGex != null && Number.isFinite(totalNetGex)) {
    const isAboveFlip =
      spotPrice != null && zeroGammaFlipLevel != null && spotPrice >= zeroGammaFlipLevel;

    if (totalNetGex > 0 && isAboveFlip) {
      gexScore = 0.6;
      gexStatus = "BULLISH";
      gexLabel = `Positive GEX above Flip (${zeroGammaFlipLevel}) · Dealers stabilizing dips`;
    } else if (totalNetGex < 0 && !isAboveFlip) {
      gexScore = -0.6;
      gexStatus = "BEARISH";
      gexLabel = `Negative GEX below Flip (${zeroGammaFlipLevel}) · Volatility acceleration risk`;
    } else if (totalNetGex > 0) {
      gexScore = 0.2;
      gexStatus = "BULLISH";
      gexLabel = "Net Positive Dealer Gamma";
    } else if (totalNetGex < 0) {
      gexScore = -0.2;
      gexStatus = "BEARISH";
      gexLabel = "Net Negative Dealer Gamma";
    } else {
      gexScore = 0;
      gexStatus = "NEUTRAL";
      gexLabel = "Zero-Gamma transition zone";
    }
  }

  // 4. OI Buildup Factor (Weight: 0.20)
  let buildupScore = 0;
  let buildupStatus: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let buildupLabel = "Build-up dynamics unavailable";

  if (institutionalSentiment != null) {
    if (institutionalSentiment === "BULLISH") {
      buildupScore = 0.7;
      buildupStatus = "BULLISH";
      buildupLabel = `Bullish OI Build-up (${dominantBuildup ?? "Net Accumulation"})`;
    } else if (institutionalSentiment === "BEARISH") {
      buildupScore = -0.7;
      buildupStatus = "BEARISH";
      buildupLabel = `Bearish OI Build-up (${dominantBuildup ?? "Net Distribution"})`;
    } else {
      buildupScore = 0;
      buildupStatus = "NEUTRAL";
      buildupLabel = `Neutral OI Build-up (${dominantBuildup ?? "Equilibrium"})`;
    }
  } else if (dominantBuildup != null) {
    if (dominantBuildup === "LONG_BUILDUP" || dominantBuildup === "SHORT_COVERING") {
      buildupScore = 0.4;
      buildupStatus = "BULLISH";
      buildupLabel = dominantBuildup.replace(/_/g, " ");
    } else if (dominantBuildup === "SHORT_BUILDUP" || dominantBuildup === "LONG_UNWINDING") {
      buildupScore = -0.4;
      buildupStatus = "BEARISH";
      buildupLabel = dominantBuildup.replace(/_/g, " ");
    }
  }

  // Composite Weighted Institutional Score
  const weights = { pcr: 0.3, maxPain: 0.25, gamma: 0.25, buildup: 0.2 };
  let netWeight = 0;
  let weightedSum = 0;

  if (pcrOi != null) {
    weightedSum += pcrScore * weights.pcr;
    netWeight += weights.pcr;
  }
  if (maxPainStrike != null && spotPrice != null) {
    weightedSum += mpScore * weights.maxPain;
    netWeight += weights.maxPain;
  }
  if (totalNetGex != null) {
    weightedSum += gexScore * weights.gamma;
    netWeight += weights.gamma;
  }
  if (dominantBuildup != null || institutionalSentiment != null) {
    weightedSum += buildupScore * weights.buildup;
    netWeight += weights.buildup;
  }

  const rawScore = netWeight > 0 ? weightedSum / netWeight : 0;
  const institutionalScore = Math.max(-1, Math.min(1, Math.round(rawScore * 100) / 100));

  let bias: InstitutionalBias = "NEUTRAL";
  if (institutionalScore >= 0.45) bias = "STRONG_BULLISH";
  else if (institutionalScore >= 0.15) bias = "BULLISH";
  else if (institutionalScore <= -0.45) bias = "STRONG_BEARISH";
  else if (institutionalScore <= -0.15) bias = "BEARISH";

  const confidence = Math.min(1, Math.max(0.2, netWeight));

  const commentary =
    bias === "STRONG_BULLISH"
      ? "Institutional Positioning: Strong Bullish alignment across PCR, Max Pain pull, and dealer Gamma cushion."
      : bias === "BULLISH"
        ? "Institutional Positioning: Moderate Bullish bias with supportive writer floor and positive skew."
        : bias === "STRONG_BEARISH"
          ? "Institutional Positioning: Strong Bearish overhang with aggressive call writing and negative dealer gamma."
          : bias === "BEARISH"
            ? "Institutional Positioning: Moderate Bearish pressure with writer resistance overhead."
            : "Institutional Positioning: Neutral / Balanced equilibrium between option buyers and writers.";

  return {
    bias,
    institutionalScore,
    confidence,
    commentary,
    factors: {
      pcr: { score: pcrScore, weight: weights.pcr, label: pcrLabel, status: pcrStatus },
      maxPain: { score: mpScore, weight: weights.maxPain, label: mpLabel, status: mpStatus },
      gamma: { score: gexScore, weight: weights.gamma, label: gexLabel, status: gexStatus },
      buildup: { score: buildupScore, weight: weights.buildup, label: buildupLabel, status: buildupStatus },
    },
    keyLevels: {
      spot: spotPrice ?? null,
      maxPain: maxPainStrike ?? null,
      zeroGammaFlip: zeroGammaFlipLevel ?? null,
      gammaWall: gammaWallStrike ?? null,
    },
  };
}

