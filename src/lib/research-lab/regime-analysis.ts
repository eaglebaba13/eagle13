// Phase 3E — Segment study pairs by canonical regime fields.

import { computeMetrics, type Pair } from "./metrics";
import type {
  HistoricalRow,
  OutcomeThresholds,
  RegimeBucket,
} from "./types";
import { DEFAULT_OUTCOME_THRESHOLDS } from "./types";

export type RegimeDimension =
  | "VIX"
  | "WEEKDAY"
  | "MONTH"
  | "DECISION"
  | "PCR"
  | "BREADTH"
  | "GTI"
  | "INSTITUTIONAL_FLOW"
  | "GAP_SIZE";

export function keyForRow(
  row: HistoricalRow,
  pair: Pair,
  dimension: RegimeDimension,
): string {
  switch (dimension) {
    case "VIX":
      if (row.vix == null) return "UNAVAILABLE";
      if (row.vix < 15) return "VIX_LT_15";
      if (row.vix < 20) return "VIX_15_20";
      return "VIX_GTE_20";
    case "WEEKDAY": return `DOW_${row.weekday}`;
    case "MONTH": return row.sessionDate.slice(0, 7);
    case "DECISION": return row.decision?.state ?? "UNAVAILABLE";
    case "PCR":
      if (row.pcr == null) return "UNAVAILABLE";
      if (row.pcr < 0.9) return "PCR_LT_0_9";
      if (row.pcr < 1.1) return "PCR_NEUTRAL";
      return "PCR_GTE_1_1";
    case "BREADTH":
      if (row.breadth == null) return "UNAVAILABLE";
      return row.breadth > 0 ? "BREADTH_POS" : row.breadth < 0 ? "BREADTH_NEG" : "BREADTH_FLAT";
    case "GTI":
      if (row.gti == null) return "UNAVAILABLE";
      return row.gti > 0 ? "GTI_POS" : row.gti < 0 ? "GTI_NEG" : "GTI_FLAT";
    case "INSTITUTIONAL_FLOW": return row.institutionalFlow?.summary ?? "UNAVAILABLE";
    case "GAP_SIZE": {
      const g = pair.gapPoints ?? 0;
      const a = Math.abs(g);
      if (a < 20) return "TINY";
      if (a < 60) return "SMALL";
      if (a < 150) return "MEDIUM";
      return "LARGE";
    }
  }
}

export function bucketByRegime(
  rows: readonly HistoricalRow[],
  pairs: readonly Pair[],
  dimension: RegimeDimension,
  thresholds: OutcomeThresholds = DEFAULT_OUTCOME_THRESHOLDS,
): readonly RegimeBucket[] {
  const map = new Map<string, Pair[]>();
  const n = Math.min(rows.length, pairs.length);
  for (let i = 0; i < n; i++) {
    const k = keyForRow(rows[i], pairs[i], dimension);
    (map.get(k) ?? map.set(k, []).get(k)!).push(pairs[i]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, ps]) => ({ key: k, label: k, metrics: computeMetrics(ps, thresholds) }));
}
