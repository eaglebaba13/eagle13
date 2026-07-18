// Phase 3D — Approximate Gamma analytics.
// Honest: if provider does not expose greeks, return UNAVAILABLE.
// Never fabricate Greeks.

import type { OptionChainSnapshot } from "@/lib/option-chain/types";
import type { GammaResult, CalcAvailability } from "./types";

export function computeGamma(snapshot: OptionChainSnapshot): GammaResult {
  const strikes = snapshot.strikes;
  const anyGamma = strikes.some(
    (s) => s.call.greeks?.gamma != null || s.put.greeks?.gamma != null,
  );
  if (!anyGamma) {
    return {
      gammaExposure: null,
      positiveGamma: null,
      negativeGamma: null,
      gammaWallStrike: null,
      gammaFlipStrike: null,
      perStrike: [],
      availability: "UNAVAILABLE" as CalcAvailability,
      reason: "Provider did not expose option Greeks",
    };
  }

  const spot = snapshot.spotPrice ?? 0;
  const perStrike: { strike: number; gex: number | null }[] = [];
  let posGex = 0;
  let negGex = 0;
  let anyMissing = false;

  for (const s of strikes) {
    const cg = s.call.greeks?.gamma;
    const pg = s.put.greeks?.gamma;
    const coi = s.call.oi ?? 0;
    const poi = s.put.oi ?? 0;
    if (cg == null && pg == null) {
      anyMissing = true;
      perStrike.push({ strike: s.strike, gex: null });
      continue;
    }
    if (cg == null || pg == null) anyMissing = true;
    // GEX approx: (callGamma * callOI - putGamma * putOI) * spot^2 * 0.01
    const call = cg != null ? cg * coi : 0;
    const put = pg != null ? pg * poi : 0;
    const gex = (call - put) * Math.max(1, spot) * Math.max(1, spot) * 0.01;
    perStrike.push({ strike: s.strike, gex });
    if (gex >= 0) posGex += gex; else negGex += gex;
  }

  // Gamma wall: strike with max |gex|.
  let wall: number | null = null;
  let wallMag = -1;
  for (const p of perStrike) {
    if (p.gex == null) continue;
    const m = Math.abs(p.gex);
    if (m > wallMag) { wallMag = m; wall = p.strike; }
  }

  // Gamma flip: strike where cumulative gex crosses zero (ascending strikes).
  const sorted = [...perStrike].sort((a, b) => a.strike - b.strike);
  let cum = 0;
  let flip: number | null = null;
  let prev = 0;
  for (const p of sorted) {
    if (p.gex == null) continue;
    prev = cum;
    cum += p.gex;
    if ((prev <= 0 && cum > 0) || (prev >= 0 && cum < 0)) {
      flip = p.strike;
      break;
    }
  }

  const availability: CalcAvailability = anyMissing ? "PARTIAL" : "OK";
  return {
    gammaExposure: posGex + negGex,
    positiveGamma: posGex,
    negativeGamma: negGex,
    gammaWallStrike: wall,
    gammaFlipStrike: flip,
    perStrike,
    availability,
    reason: availability === "OK" ? "Gamma computed from provider greeks" : "Gamma computed on partial greeks coverage",
  };
}