// Phase 3E — Gann Gap historical validation study.

import { checkSignalLeakage } from "./alignment";
import { computeOutcome } from "./outcomes";
import { buildConfusion, computeMetrics, type Pair } from "./metrics";
import type {
  GannGapStudyReport,
  HistoricalRow,
  OutcomeThresholds,
  RegimeBucket,
  SignalEvent,
} from "./types";
import { DEFAULT_OUTCOME_THRESHOLDS } from "./types";
import { eventsForRow } from "./signal-events";

function bucketMetrics(pairs: readonly Pair[], thresholds: OutcomeThresholds, label: string, key: string): RegimeBucket {
  return { key, label, metrics: computeMetrics(pairs, thresholds) };
}

function vixRegime(vix: number | null): string {
  if (vix == null) return "UNAVAILABLE";
  if (vix < 15) return "VIX_LT_15";
  if (vix < 20) return "VIX_15_20";
  if (vix < 25) return "VIX_20_25";
  return "VIX_GTE_25";
}

function distanceBucket(pct: number | null): string {
  if (pct == null) return "UNAVAILABLE";
  const a = Math.abs(pct);
  if (a < 0.001) return "AT_LEVEL";
  if (a < 0.003) return "NEAR_LEVEL";
  if (a < 0.007) return "MID";
  return "FAR";
}

function closePctBucket(p: number | null): string {
  if (p == null) return "UNAVAILABLE";
  if (p < 0.25) return "LOW";
  if (p < 0.5) return "MID_LOW";
  if (p < 0.75) return "MID_HIGH";
  return "HIGH";
}

export function runGannGapStudy(
  rows: readonly HistoricalRow[],
  thresholds: OutcomeThresholds = DEFAULT_OUTCOME_THRESHOLDS,
): GannGapStudyReport {
  const pairs: Pair[] = [];
  const monthBuckets = new Map<string, Pair[]>();
  const vixBuckets = new Map<string, Pair[]>();
  const dayBuckets = new Map<string, Pair[]>();
  const distBuckets = new Map<string, Pair[]>();
  const closeBuckets = new Map<string, Pair[]>();
  const warnings: string[] = [];
  let noTrade = 0;
  let conflict = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.gannGap) continue;
    const evs = eventsForRow(r).filter((e) => e.family === "GANN_GAP");
    const event = evs[0] as SignalEvent | undefined;
    if (!event) continue;
    const leakage = checkSignalLeakage(event, r);
    if (!leakage.ok) { warnings.push(`LEAKAGE:${r.sessionDate}`); continue; }
    const outcome = computeOutcome(i, rows, thresholds);
    const outlook = r.gannGap.outlook;
    const predicted =
      outlook === "GAP_UP" ? "GAP_UP" :
      outlook === "GAP_DOWN" ? "GAP_DOWN" :
      outlook === "NO_TRADE" ? "NO_TRADE" :
      outlook === "CONFLICT" ? "CONFLICT" : null;
    if (predicted === "NO_TRADE") noTrade++;
    if (predicted === "CONFLICT") conflict++;
    const pair: Pair = {
      predicted,
      actual: outcome.gapDirection,
      gapPoints: outcome.nextGapPoints,
      mfe: outcome.mfe,
      mae: outcome.mae,
    };
    pairs.push(pair);
    const monthKey = r.sessionDate.slice(0, 7);
    (monthBuckets.get(monthKey) ?? monthBuckets.set(monthKey, []).get(monthKey)!).push(pair);
    const v = vixRegime(r.vix);
    (vixBuckets.get(v) ?? vixBuckets.set(v, []).get(v)!).push(pair);
    const wk = String(r.weekday);
    (dayBuckets.get(wk) ?? dayBuckets.set(wk, []).get(wk)!).push(pair);
    const dk = distanceBucket(r.gannGap.distanceFromLevelPct);
    (distBuckets.get(dk) ?? distBuckets.set(dk, []).get(dk)!).push(pair);
    const ck = closePctBucket(r.gannGap.closePctInsideZone);
    (closeBuckets.get(ck) ?? closeBuckets.set(ck, []).get(ck)!).push(pair);
  }

  const metrics = computeMetrics(pairs, thresholds);
  const conf = buildConfusion(pairs);
  const toBuckets = (m: Map<string, Pair[]>): RegimeBucket[] =>
    [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([k, ps]) => bucketMetrics(ps, thresholds, k, k));
  return {
    metrics,
    confusionMatrix: conf,
    byMonth: toBuckets(monthBuckets),
    byVixRegime: toBuckets(vixBuckets),
    byWeekday: toBuckets(dayBuckets),
    byDistanceBucket: toBuckets(distBuckets),
    byClosePercentileBucket: toBuckets(closeBuckets),
    noTradeFrequency: pairs.length > 0 ? noTrade / pairs.length : 0,
    conflictFrequency: pairs.length > 0 ? conflict / pairs.length : 0,
    warnings,
  };
}
