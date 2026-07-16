// Phase 27 · Stage 1 — Combined PCR math.
//
// Deterministic, pure. Missing data propagates as null; safe division
// never throws. Normalization: raw = ln(pcr); norm = 100*tanh(1.5*raw);
// PCR = 1 → 0. Clamped to [-100, +100].

import type { OptionChainStrike } from "../option-chain/types";
import type {
  CombinedPcrWeights,
  InstrumentPcr,
} from "./types";

export interface PcrAggregates {
  readonly callOi: number;
  readonly putOi: number;
  readonly callChangeOiPositive: number;
  readonly putChangeOiPositive: number;
  readonly strikeCount: number;
  readonly missing: readonly string[];
}

export function aggregateStrikes(strikes: readonly OptionChainStrike[]): PcrAggregates {
  let callOi = 0;
  let putOi = 0;
  let callChangePos = 0;
  let putChangePos = 0;
  let missingCallOi = 0;
  let missingPutOi = 0;
  let missingCallCh = 0;
  let missingPutCh = 0;
  for (const s of strikes) {
    const co = s.call.oi;
    const po = s.put.oi;
    const cc = s.call.changeOi;
    const pc = s.put.changeOi;
    if (co == null) missingCallOi += 1;
    else if (co > 0) callOi += co;
    if (po == null) missingPutOi += 1;
    else if (po > 0) putOi += po;
    if (cc == null) missingCallCh += 1;
    else if (cc > 0) callChangePos += cc;
    if (pc == null) missingPutCh += 1;
    else if (pc > 0) putChangePos += pc;
  }
  const missing: string[] = [];
  if (missingCallOi > 0) missing.push(`call.oi:${missingCallOi}`);
  if (missingPutOi > 0) missing.push(`put.oi:${missingPutOi}`);
  if (missingCallCh > 0) missing.push(`call.changeOi:${missingCallCh}`);
  if (missingPutCh > 0) missing.push(`put.changeOi:${missingPutCh}`);
  return {
    callOi, putOi,
    callChangeOiPositive: callChangePos,
    putChangeOiPositive: putChangePos,
    strikeCount: strikes.length,
    missing,
  };
}

/** Safe division: returns null on non-positive denominator. */
export function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  if (numerator < 0) return null;
  return numerator / denominator;
}

/** raw = ln(pcr); normalized = 100 * tanh(1.5 * raw); clamp [-100,100]. */
export function normalizePcr(pcr: number | null): number | null {
  if (pcr == null) return null;
  if (!Number.isFinite(pcr) || pcr <= 0) return null;
  const raw = Math.log(pcr);
  const n = 100 * Math.tanh(1.5 * raw);
  return clamp(n, -100, 100);
}

export function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/** Instrument score: 0.55 * normOI + 0.45 * normChange. Missing → null. */
export function instrumentScore(
  normalizedOi: number | null,
  normalizedChange: number | null,
): number | null {
  if (normalizedOi == null || normalizedChange == null) return null;
  const s = 0.55 * normalizedOi + 0.45 * normalizedChange;
  return clamp(s, -100, 100);
}

export interface WeightValidation {
  readonly ok: boolean;
  readonly sum: number;
  readonly error: string | null;
}

export function validateWeights(w: CombinedPcrWeights): WeightValidation {
  const sum = w.NIFTY + w.BANKNIFTY;
  if (w.NIFTY < 0 || w.BANKNIFTY < 0) {
    return { ok: false, sum, error: "weights must be non-negative" };
  }
  if (Math.abs(sum - 1) > 1e-3) {
    return { ok: false, sum, error: `weights must sum to 1 (got ${sum.toFixed(4)})` };
  }
  return { ok: true, sum, error: null };
}

/**
 * Renormalize weights across the subset of instruments that produced a
 * valid score. Instruments with null score are dropped — never counted
 * as zero (that would fabricate direction).
 */
export function renormalizeWeights(
  parts: readonly { readonly weight: number; readonly score: number | null }[],
): readonly (number | null)[] {
  const valid = parts.filter((p) => p.score != null && p.weight > 0);
  const total = valid.reduce((a, b) => a + b.weight, 0);
  return parts.map((p) => {
    if (p.score == null || p.weight <= 0 || total <= 0) return null;
    return p.weight / total;
  });
}

/**
 * Combined score: weighted avg over instruments with a valid score.
 * Returns null when every instrument is missing.
 */
export function combinedScore(instruments: readonly InstrumentPcr[]): number | null {
  const parts = instruments.map((i) => ({ weight: i.configuredWeight, score: i.instrumentScore }));
  const eff = renormalizeWeights(parts);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < instruments.length; i += 1) {
    const w = eff[i];
    const s = instruments[i].instrumentScore;
    if (w == null || s == null) continue;
    sum += w * s;
    count += 1;
  }
  if (count === 0) return null;
  return clamp(sum, -100, 100);
}