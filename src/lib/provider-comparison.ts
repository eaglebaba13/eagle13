// Phase 21.2 · Stage 5.1 — compare two provider candle datasets on their
// overlapping trading sessions. Pure. NEVER merges datasets.

import type { ParsedCandle } from "./candle-csv-parser";
import { groupBySessionDate } from "./candle-data-quality";

export type SessionComparison = {
  tradingDate: string;
  aCount: number;
  bCount: number;
  ohlcDiffs: number; // number of same-timestamp candles whose OHLC differs
  missingInA: number;
  missingInB: number;
  highDiff: number;
  lowDiff: number;
  classification: "MATCH" | "MINOR_DIFFERENCE" | "MATERIAL_DIFFERENCE";
};

export type ProviderComparisonResult = {
  overlapDates: string[];
  perSession: SessionComparison[];
  overall: "MATCH" | "MINOR_DIFFERENCE" | "MATERIAL_DIFFERENCE";
};

function classify(c: Omit<SessionComparison, "classification">): SessionComparison["classification"] {
  if (c.ohlcDiffs === 0 && c.missingInA === 0 && c.missingInB === 0) return "MATCH";
  if (c.highDiff > 5 || c.lowDiff > 5 || c.missingInA > 3 || c.missingInB > 3)
    return "MATERIAL_DIFFERENCE";
  return "MINOR_DIFFERENCE";
}

export function compareProviders(
  a: ParsedCandle[],
  b: ParsedCandle[],
): ProviderComparisonResult {
  const ga = groupBySessionDate(a);
  const gb = groupBySessionDate(b);
  const overlap = [...ga.keys()].filter((d) => gb.has(d)).sort();
  const perSession: SessionComparison[] = [];
  for (const date of overlap) {
    const aa = ga.get(date)!;
    const bb = gb.get(date)!;
    const aMap = new Map(aa.map((c) => [c.openTimeMs, c]));
    const bMap = new Map(bb.map((c) => [c.openTimeMs, c]));
    let ohlcDiffs = 0;
    let missingInA = 0;
    let missingInB = 0;
    let hi = 0;
    let lo = 0;
    for (const [t, ca] of aMap) {
      const cb = bMap.get(t);
      if (!cb) {
        missingInB++;
        continue;
      }
      if (ca.open !== cb.open || ca.high !== cb.high || ca.low !== cb.low || ca.close !== cb.close)
        ohlcDiffs++;
      hi = Math.max(hi, Math.abs(ca.high - cb.high));
      lo = Math.max(lo, Math.abs(ca.low - cb.low));
    }
    for (const t of bMap.keys()) if (!aMap.has(t)) missingInA++;
    const base = {
      tradingDate: date,
      aCount: aa.length,
      bCount: bb.length,
      ohlcDiffs,
      missingInA,
      missingInB,
      highDiff: hi,
      lowDiff: lo,
    };
    perSession.push({ ...base, classification: classify(base) });
  }
  let overall: ProviderComparisonResult["overall"] = "MATCH";
  if (perSession.some((s) => s.classification === "MATERIAL_DIFFERENCE"))
    overall = "MATERIAL_DIFFERENCE";
  else if (perSession.some((s) => s.classification === "MINOR_DIFFERENCE"))
    overall = "MINOR_DIFFERENCE";
  return { overlapDates: overlap, perSession, overall };
}