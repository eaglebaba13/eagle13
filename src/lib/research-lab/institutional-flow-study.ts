// Phase 3E — Institutional Flow historical study.

import { computeOutcome } from "./outcomes";
import { computeMetrics, type Pair } from "./metrics";
import type {
  HistoricalRow,
  InstitutionalFlowStudyReport,
  OutcomeThresholds,
  RegimeBucket,
  StudyMetrics,
} from "./types";
import { DEFAULT_OUTCOME_THRESHOLDS } from "./types";

function maxPainBucket(distPct: number | null): string {
  if (distPct == null) return "UNAVAILABLE";
  const a = Math.abs(distPct);
  if (a < 0.005) return "MP_LT_0_5PCT";
  if (a < 0.015) return "MP_LT_1_5PCT";
  if (a < 0.03) return "MP_LT_3PCT";
  return "MP_FAR";
}

export function runInstitutionalFlowStudy(
  rows: readonly HistoricalRow[],
  thresholds: OutcomeThresholds = DEFAULT_OUTCOME_THRESHOLDS,
): InstitutionalFlowStudyReport {
  const classBuckets = new Map<string, Pair[]>();
  const mpBuckets = new Map<string, Pair[]>();
  const sectorAvail: Record<string, number> = {};
  let gammaAvail = 0;
  let gammaMissing = 0;
  const warnings: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.institutionalFlow) continue;
    const flow = r.institutionalFlow;
    if (flow.gammaAvailable) gammaAvail++; else gammaMissing++;
    sectorAvail[flow.sectorFlow] = (sectorAvail[flow.sectorFlow] ?? 0) + 1;
    const outcome = computeOutcome(i, rows, thresholds);
    const predicted =
      flow.summary === "PUT_WRITERS_ACTIVE" ? "GAP_UP" :
      flow.summary === "CALL_WRITERS_ACTIVE" ? "GAP_DOWN" :
      flow.summary === "BALANCED" ? "NO_TRADE" :
      flow.summary === "CONFLICT" ? "CONFLICT" : null;
    const pair: Pair = {
      predicted,
      actual: outcome.gapDirection,
      gapPoints: outcome.nextGapPoints,
      mfe: outcome.mfe,
      mae: outcome.mae,
    };
    const cls = flow.summary;
    (classBuckets.get(cls) ?? classBuckets.set(cls, []).get(cls)!).push(pair);
    const mp = maxPainBucket(flow.maxPainDistancePct);
    (mpBuckets.get(mp) ?? mpBuckets.set(mp, []).get(mp)!).push(pair);
  }
  const byClass: Record<string, StudyMetrics> = {};
  for (const [k, ps] of classBuckets) byClass[k] = computeMetrics(ps, thresholds);
  const mpOut: RegimeBucket[] = [...mpBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, ps]) => ({ key: k, label: k, metrics: computeMetrics(ps, thresholds) }));
  return {
    byClass,
    gammaAvailableSamples: gammaAvail,
    gammaUnavailableSamples: gammaMissing,
    maxPainBuckets: mpOut,
    sectorAvailability: sectorAvail,
    warnings,
  };
}
