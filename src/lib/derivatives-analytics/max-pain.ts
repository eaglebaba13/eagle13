// Pure, deterministic Max Pain engine.
// Definition: For each candidate strike K, option writers' total loss is:
//   Loss(K) = Σ CallOI(s) * max(K - s, 0) + Σ PutOI(s) * max(s - K, 0)
// The strike K with the lowest total payout is the Max Pain strike (where writers suffer least).

export interface MaxPainStrikePayoff {
  readonly strike: number;
  readonly callLoss: number;
  readonly putLoss: number;
  readonly totalLoss: number;
}

export interface MaxPainStrikeInput {
  readonly strike: number;
  readonly callOi: number;
  readonly putOi: number;
}

export interface MaxPainInput {
  readonly strikes: readonly MaxPainStrikeInput[];
  readonly spotPrice?: number | null;
}

export interface MaxPainResult {
  readonly maxPainStrike: number | null;
  readonly minPayoff: number | null;
  readonly spotPrice: number | null;
  readonly distanceFromSpot: number | null;
  readonly distanceFromSpotPct: number | null;
  readonly bias: "ABOVE_SPOT" | "BELOW_SPOT" | "AT_SPOT" | "UNKNOWN";
  readonly payoffTable: readonly MaxPainStrikePayoff[];
}

/**
 * Compute the Max Pain strike and payoff curve across candidate strikes.
 * Deterministic tie-breaker: minimum payoff -> nearest to spot -> lowest strike number.
 */
export function calculateMaxPain(input: MaxPainInput): MaxPainResult {
  const { strikes, spotPrice = null } = input;

  if (!strikes || strikes.length === 0) {
    return {
      maxPainStrike: null,
      minPayoff: null,
      spotPrice,
      distanceFromSpot: null,
      distanceFromSpotPct: null,
      bias: "UNKNOWN",
      payoffTable: [],
    };
  }

  // Filter out invalid/negative entries and sort ascending by strike
  const valid = strikes
    .filter((s) => Number.isFinite(s.strike) && s.strike > 0)
    .sort((a, b) => a.strike - b.strike);

  if (valid.length === 0) {
    return {
      maxPainStrike: null,
      minPayoff: null,
      spotPrice,
      distanceFromSpot: null,
      distanceFromSpotPct: null,
      bias: "UNKNOWN",
      payoffTable: [],
    };
  }

  const payoffTable: MaxPainStrikePayoff[] = valid.map((cand) => {
    const k = cand.strike;
    let callLoss = 0;
    let putLoss = 0;

    for (const s of valid) {
      const co = Math.max(0, s.callOi || 0);
      const po = Math.max(0, s.putOi || 0);

      // In the money for Call if market expires at k > strike s
      if (k > s.strike) {
        callLoss += co * (k - s.strike);
      }
      // In the money for Put if market expires at k < strike s
      if (k < s.strike) {
        putLoss += po * (s.strike - k);
      }
    }

    return {
      strike: k,
      callLoss: Math.round(callLoss),
      putLoss: Math.round(putLoss),
      totalLoss: Math.round(callLoss + putLoss),
    };
  });

  // Find minimum totalLoss with deterministic tie-breaking
  const spotValid = spotPrice != null && Number.isFinite(spotPrice);
  const distToSpot = (k: number) => (spotValid ? Math.abs(k - spotPrice) : 0);

  let best = payoffTable[0];
  for (let i = 1; i < payoffTable.length; i++) {
    const cand = payoffTable[i];
    if (cand.totalLoss < best.totalLoss) {
      best = cand;
    } else if (cand.totalLoss === best.totalLoss) {
      const dCand = distToSpot(cand.strike);
      const dBest = distToSpot(best.strike);
      if (dCand < dBest || (dCand === dBest && cand.strike < best.strike)) {
        best = cand;
      }
    }
  }

  const maxPainStrike = best.strike;
  const minPayoff = best.totalLoss;

  let distanceFromSpot: number | null = null;
  let distanceFromSpotPct: number | null = null;
  let bias: "ABOVE_SPOT" | "BELOW_SPOT" | "AT_SPOT" | "UNKNOWN" = "UNKNOWN";

  if (spotValid && spotPrice > 0) {
    distanceFromSpot = Math.round((maxPainStrike - spotPrice) * 100) / 100;
    distanceFromSpotPct = Math.round(((maxPainStrike - spotPrice) / spotPrice) * 10000) / 100;

    // Threshold of 0.25% for AT_SPOT
    if (Math.abs(distanceFromSpotPct) <= 0.25) {
      bias = "AT_SPOT";
    } else if (distanceFromSpot > 0) {
      bias = "ABOVE_SPOT";
    } else {
      bias = "BELOW_SPOT";
    }
  }

  return {
    maxPainStrike,
    minPayoff,
    spotPrice,
    distanceFromSpot,
    distanceFromSpotPct,
    bias,
    payoffTable,
  };
}

