// Pure, deterministic Gamma Exposure (GEX) engine.
// Models market maker / dealer inventory hedging pressure:
//   Dealer Call GEX = + (CallGamma * CallOI * Spot^2 * 0.01)  (Dealers long calls -> long gamma)
//   Dealer Put GEX  = - (PutGamma  * PutOI  * Spot^2 * 0.01)  (Dealers short puts -> short gamma)
//   Net GEX         = Call GEX + Put GEX (where put is signed negative)
//
// Key Milestones:
//   Zero-Gamma Flip Level: The spot/strike price where cumulative Net GEX switches signs.
//   Gamma Wall: The strike with the single highest concentrated GEX exposure.
//   Positive Gamma Regime: Net GEX > 0 -> Dealers counter-trade market moves (buy dips, sell rallies -> low vol / rangebound).
//   Negative Gamma Regime: Net GEX < 0 -> Dealers amplify moves (sell dips, buy rips -> high vol / momentum breakout).

export interface StrikeGammaInput {
  readonly strike: number;
  readonly callOi: number;
  readonly putOi: number;
  readonly callGamma?: number | null;
  readonly putGamma?: number | null;
  readonly callIv?: number | null;
  readonly putIv?: number | null;
}

export interface StrikeGexBreakdown {
  readonly strike: number;
  readonly callOi: number;
  readonly putOi: number;
  readonly callGamma: number;
  readonly putGamma: number;
  readonly callGex: number;
  readonly putGex: number; // Signed negative for dealer short put gamma
  readonly netGex: number;
  readonly cumulativeGex: number;
}

export interface GammaExposureResult {
  readonly totalNetGex: number;
  readonly totalCallGex: number;
  readonly totalPutGex: number;
  readonly zeroGammaFlipLevel: number | null;
  readonly gammaWallStrike: number | null;
  readonly maxCallGexStrike: number | null;
  readonly maxPutGexStrike: number | null;
  readonly regime: "POSITIVE_GAMMA" | "NEGATIVE_GAMMA" | "NEUTRAL_TRANSITION";
  readonly marketImpact: string;
  readonly strikes: readonly StrikeGexBreakdown[];
}

/** Standard Normal Probability Density Function: φ(x) = (1 / √(2π)) * exp(-x² / 2) */
function standardNormalPdf(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Standard Black-Scholes gamma approximation when provider does not supply precomputed Greeks.
 * Gamma = φ(d1) / (S * σ * √T)
 */
function approximateBsGamma(
  spot: number,
  strike: number,
  iv: number = 0.15,
  dteDays: number = 3,
): number {
  if (spot <= 0 || strike <= 0 || iv <= 0) return 0;
  const t = Math.max(0.5, dteDays) / 365;
  const sigma = Math.max(0.05, Math.min(2.0, iv > 1 ? iv / 100 : iv));
  const sqrtT = Math.sqrt(t);

  // d1 = (ln(S / K) + 0.5 * σ² * T) / (σ * √T)
  const d1 = (Math.log(spot / strike) + 0.5 * sigma * sigma * t) / (sigma * sqrtT);
  const pdf = standardNormalPdf(d1);
  const gamma = pdf / (spot * sigma * sqrtT);

  return Number.isFinite(gamma) ? gamma : 0;
}

export function computeGammaExposure(
  strikesInput: readonly StrikeGammaInput[],
  spotPrice: number,
  dteDays: number = 3,
): GammaExposureResult {
  if (!strikesInput || strikesInput.length === 0 || spotPrice <= 0) {
    return {
      totalNetGex: 0,
      totalCallGex: 0,
      totalPutGex: 0,
      zeroGammaFlipLevel: null,
      gammaWallStrike: null,
      maxCallGexStrike: null,
      maxPutGexStrike: null,
      regime: "NEUTRAL_TRANSITION",
      marketImpact: "Insufficient data for GEX profile calculation.",
      strikes: [],
    };
  }

  // Sort strikes ascending
  const sorted = [...strikesInput]
    .filter((s) => s.strike > 0)
    .sort((a, b) => a.strike - b.strike);

  const spotMultiplier = spotPrice * spotPrice * 0.01;
  const strikes: StrikeGexBreakdown[] = [];

  let cumGex = 0;
  let totalCallGex = 0;
  let totalPutGex = 0;

  let maxCallGexStrike: number | null = null;
  let maxCallGexVal = -Infinity;
  let maxPutGexStrike: number | null = null;
  let maxPutGexVal = Infinity; // most negative
  let gammaWallStrike: number | null = null;
  let gammaWallAbsVal = -1;

  for (const row of sorted) {
    const k = row.strike;
    const callOi = Math.max(0, row.callOi || 0);
    const putOi = Math.max(0, row.putOi || 0);

    const callGamma =
      row.callGamma != null && Number.isFinite(row.callGamma) && row.callGamma > 0
        ? row.callGamma
        : approximateBsGamma(spotPrice, k, row.callIv ?? 0.15, dteDays);

    const putGamma =
      row.putGamma != null && Number.isFinite(row.putGamma) && row.putGamma > 0
        ? row.putGamma
        : approximateBsGamma(spotPrice, k, row.putIv ?? 0.15, dteDays);

    // Call GEX is positive, Put GEX is signed negative
    const callGex = Math.round(callGamma * callOi * spotMultiplier);
    const putGex = -Math.round(putGamma * putOi * spotMultiplier);
    const netGex = callGex + putGex;

    cumGex += netGex;

    if (callGex > maxCallGexVal) {
      maxCallGexVal = callGex;
      maxCallGexStrike = k;
    }
    if (putGex < maxPutGexVal) {
      maxPutGexVal = putGex;
      maxPutGexStrike = k;
    }

    const absNet = Math.abs(netGex);
    if (absNet > gammaWallAbsVal) {
      gammaWallAbsVal = absNet;
      gammaWallStrike = k;
    }

    totalCallGex += callGex;
    totalPutGex += putGex;

    strikes.push({
      strike: k,
      callOi,
      putOi,
      callGamma,
      putGamma,
      callGex,
      putGex,
      netGex,
      cumulativeGex: cumGex,
    });
  }

  const totalNetGex = totalCallGex + totalPutGex;

  // Determine Zero-Gamma Flip Level:
  // Interpolate or find the strike where cumulative Net GEX flips from negative to positive.
  let zeroGammaFlipLevel: number | null = null;
  for (let i = 0; i < strikes.length - 1; i++) {
    const curr = strikes[i];
    const next = strikes[i + 1];

    if ((curr.cumulativeGex <= 0 && next.cumulativeGex > 0) || (curr.cumulativeGex >= 0 && next.cumulativeGex < 0)) {
      // Linear interpolation between curr and next strike
      const denom = next.cumulativeGex - curr.cumulativeGex;
      if (Math.abs(denom) > 1e-4) {
        const factor = Math.abs(curr.cumulativeGex) / Math.abs(denom);
        zeroGammaFlipLevel = Math.round((curr.strike + (next.strike - curr.strike) * factor) * 10) / 10;
      } else {
        zeroGammaFlipLevel = curr.strike;
      }
      break;
    }
  }

  // Fallback flip level if not crossed: strike closest to 0 cumulative
  if (zeroGammaFlipLevel == null && strikes.length > 0) {
    let closestStrike = strikes[0].strike;
    let minCum = Math.abs(strikes[0].cumulativeGex);
    for (const s of strikes) {
      if (Math.abs(s.cumulativeGex) < minCum) {
        minCum = Math.abs(s.cumulativeGex);
        closestStrike = s.strike;
      }
    }
    zeroGammaFlipLevel = closestStrike;
  }

  // Regime classification
  let regime: "POSITIVE_GAMMA" | "NEGATIVE_GAMMA" | "NEUTRAL_TRANSITION" = "NEUTRAL_TRANSITION";
  let marketImpact = "";

  const threshold = Math.max(1_000_000, Math.abs(totalCallGex) * 0.05);
  if (totalNetGex > threshold) {
    regime = "POSITIVE_GAMMA";
    marketImpact =
      "Positive dealer gamma stabilizes spot: market makers sell rallies and buy dips, dampening volatility.";
  } else if (totalNetGex < -threshold) {
    regime = "NEGATIVE_GAMMA";
    marketImpact =
      "Negative dealer gamma amplifies moves: market makers sell dips and buy rallies, accelerating volatility.";
  } else {
    regime = "NEUTRAL_TRANSITION";
    marketImpact =
      "Net GEX is near zero / transition zone. Spot price is near the gamma flip threshold.";
  }

  return {
    totalNetGex,
    totalCallGex,
    totalPutGex,
    zeroGammaFlipLevel,
    gammaWallStrike,
    maxCallGexStrike,
    maxPutGexStrike,
    regime,
    marketImpact,
    strikes,
  };
}

