// Phase 26 · Stage 5 — Per-strike metrics.
//
// Deterministic. Missing values propagate as null and produce explicit
// `missing` flags. No fabrication.

import type { OptionChainStrike } from "./types";

export interface StrikeMetrics {
  readonly strike: number;
  readonly callOi: number | null;
  readonly putOi: number | null;
  readonly callChangeOi: number | null;
  readonly putChangeOi: number | null;
  readonly callVolume: number | null;
  readonly putVolume: number | null;
  readonly oiDifference: number | null;   // callOi - putOi
  readonly volumeDifference: number | null;
  readonly callIv: number | null;
  readonly putIv: number | null;
  readonly missing: readonly string[];
}

function diff(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

export function computeStrikeMetrics(strike: OptionChainStrike): StrikeMetrics {
  const missing: string[] = [];
  const { call, put } = strike;
  if (call.oi == null) missing.push("call.oi");
  if (put.oi == null) missing.push("put.oi");
  if (call.changeOi == null) missing.push("call.changeOi");
  if (put.changeOi == null) missing.push("put.changeOi");
  if (call.volume == null) missing.push("call.volume");
  if (put.volume == null) missing.push("put.volume");
  if (call.iv == null) missing.push("call.iv");
  if (put.iv == null) missing.push("put.iv");
  return {
    strike: strike.strike,
    callOi: call.oi,
    putOi: put.oi,
    callChangeOi: call.changeOi,
    putChangeOi: put.changeOi,
    callVolume: call.volume,
    putVolume: put.volume,
    oiDifference: diff(call.oi, put.oi),
    volumeDifference: diff(call.volume, put.volume),
    callIv: call.iv,
    putIv: put.iv,
    missing,
  };
}

export function computeAllMetrics(strikes: readonly OptionChainStrike[]): readonly StrikeMetrics[] {
  return strikes.map(computeStrikeMetrics);
}