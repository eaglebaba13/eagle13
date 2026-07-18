// Phase 3D — OI analysis (deterministic).

import type { OptionChainSnapshot } from "@/lib/option-chain/types";
import type { OiAnalysis, OiRow, CalcAvailability } from "./types";

function rank(values: readonly (number | null)[]): readonly (number | null)[] {
  const paired = values.map((v, i) => ({ v, i }));
  const sorted = paired
    .filter((p) => p.v != null)
    .sort((a, b) => (b.v as number) - (a.v as number));
  const rankById = new Map<number, number>();
  sorted.forEach((p, idx) => rankById.set(p.i, idx + 1));
  return values.map((_, i) => rankById.get(i) ?? null);
}

function moneyness(strike: number, spot: number | null): OiRow["moneyness"] {
  if (spot == null || !Number.isFinite(spot)) return "UNKNOWN";
  const diff = strike - spot;
  const tol = Math.max(1, spot * 0.0015);
  if (Math.abs(diff) <= tol) return "ATM";
  return diff < 0 ? "ITM_CE" : "OTM_CE";
}

function closestStrike(strikes: readonly number[], target: number | null): number | null {
  if (target == null || strikes.length === 0) return null;
  let best = strikes[0];
  let bestDist = Math.abs(strikes[0] - target);
  for (const s of strikes) {
    const d = Math.abs(s - target);
    if (d < bestDist) { best = s; bestDist = d; }
  }
  return best;
}

export function analyzeOi(snapshot: OptionChainSnapshot): OiAnalysis {
  const rowsIn = snapshot.strikes;
  const strikeList = rowsIn.map((s) => s.strike);
  const spot = snapshot.spotPrice;
  const atm = closestStrike(strikeList, spot);
  const callOis = rowsIn.map((s) => s.call.oi);
  const putOis = rowsIn.map((s) => s.put.oi);
  const callRanks = rank(callOis);
  const putRanks = rank(putOis);
  const missing: string[] = [];

  const validCall = callOis.filter((v): v is number => v != null);
  const validPut = putOis.filter((v): v is number => v != null);
  const highestCall = validCall.length > 0 ? Math.max(...validCall) : null;
  const highestPut = validPut.length > 0 ? Math.max(...validPut) : null;
  const lowestCall = validCall.length > 0 ? Math.min(...validCall) : null;
  const lowestPut = validPut.length > 0 ? Math.min(...validPut) : null;

  let hcStrike: number | null = null;
  let hpStrike: number | null = null;

  const rows: OiRow[] = rowsIn.map((s, i) => {
    const isHC = s.call.oi != null && s.call.oi === highestCall;
    const isHP = s.put.oi != null && s.put.oi === highestPut;
    if (isHC && hcStrike == null) hcStrike = s.strike;
    if (isHP && hpStrike == null) hpStrike = s.strike;
    return {
      strike: s.strike,
      callOi: s.call.oi,
      putOi: s.put.oi,
      callChangeOi: s.call.changeOi,
      putChangeOi: s.put.changeOi,
      callVolume: s.call.volume,
      putVolume: s.put.volume,
      callOiRank: callRanks[i],
      putOiRank: putRanks[i],
      moneyness: moneyness(s.strike, spot),
      isAtm: atm != null && s.strike === atm,
      isHighestCallOi: isHC,
      isHighestPutOi: isHP,
      isLowestCallOi: s.call.oi != null && s.call.oi === lowestCall,
      isLowestPutOi: s.put.oi != null && s.put.oi === lowestPut,
    };
  });

  if (validCall.length === 0) missing.push("call.oi");
  if (validPut.length === 0) missing.push("put.oi");
  if (rowsIn.every((s) => s.call.changeOi == null)) missing.push("call.changeOi");
  if (rowsIn.every((s) => s.put.changeOi == null)) missing.push("put.changeOi");

  const availability: CalcAvailability =
    validCall.length === 0 && validPut.length === 0
      ? "UNAVAILABLE"
      : missing.length === 0
        ? "OK"
        : "PARTIAL";

  const sum = (xs: readonly (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length === 0 ? null : v.reduce((a, b) => a + b, 0);
  };

  return {
    rows,
    totalCallOi: sum(callOis),
    totalPutOi: sum(putOis),
    totalCallChangeOi: sum(rowsIn.map((s) => s.call.changeOi)),
    totalPutChangeOi: sum(rowsIn.map((s) => s.put.changeOi)),
    highestCallOiStrike: hcStrike,
    highestPutOiStrike: hpStrike,
    atmStrike: atm,
    availability,
    missing,
  };
}