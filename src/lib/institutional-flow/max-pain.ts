// Phase 3D — Deterministic Max Pain.
// Definition: pain(K) = Σ callOi(S) * max(K - S, 0) + putOi(S) * max(S - K, 0).
// Max Pain = strike K that minimises pain(K).

import type { OptionChainSnapshot } from "@/lib/option-chain/types";
import type { MaxPainResult, CalcAvailability } from "./types";

export interface MaxPainInput {
  readonly snapshot: OptionChainSnapshot;
  /** Optional prior Max Pain for shift computation (research only). */
  readonly historicalMaxPain?: number | null;
}

export function computeMaxPain(input: MaxPainInput): MaxPainResult {
  const { snapshot } = input;
  const strikes = snapshot.strikes;
  const anyOi = strikes.some((s) => s.call.oi != null || s.put.oi != null);
  const availability: CalcAvailability = !anyOi
    ? "UNAVAILABLE"
    : strikes.every((s) => s.call.oi != null && s.put.oi != null)
      ? "OK"
      : "PARTIAL";

  if (!anyOi || strikes.length === 0) {
    return {
      currentMaxPain: null,
      nearestMaxPain: null,
      distanceFromSpot: null,
      distanceFromSpotPct: null,
      painShift: null,
      historicalMaxPain: input.historicalMaxPain ?? null,
      perStrikePain: [],
      availability,
    };
  }

  const perStrikePain = strikes.map((row) => {
    let pain = 0;
    for (const s of strikes) {
      const co = s.call.oi ?? 0;
      const po = s.put.oi ?? 0;
      pain += co * Math.max(row.strike - s.strike, 0);
      pain += po * Math.max(s.strike - row.strike, 0);
    }
    return { strike: row.strike, pain };
  });

  let minStrike = perStrikePain[0].strike;
  let minPain = perStrikePain[0].pain;
  for (const p of perStrikePain) {
    if (p.pain < minPain) { minPain = p.pain; minStrike = p.strike; }
  }

  const spot = snapshot.spotPrice;
  let nearest: number | null = null;
  if (spot != null && Number.isFinite(spot)) {
    let best = strikes[0].strike;
    let bd = Math.abs(best - spot);
    for (const s of strikes) {
      const d = Math.abs(s.strike - spot);
      if (d < bd) { bd = d; best = s.strike; }
    }
    nearest = best;
  }

  const distance = spot != null ? minStrike - spot : null;
  const distancePct = spot != null && spot !== 0 ? ((minStrike - spot) / spot) * 100 : null;
  const historical = input.historicalMaxPain ?? null;
  const painShift = historical != null ? minStrike - historical : null;

  return {
    currentMaxPain: minStrike,
    nearestMaxPain: nearest,
    distanceFromSpot: distance,
    distanceFromSpotPct: distancePct,
    painShift,
    historicalMaxPain: historical,
    perStrikePain,
    availability,
  };
}