// Phase 23 · Stage 1 — Shadow drift classification.

import type { ShadowMetrics } from "./shadow-types";

export type ShadowDriftStatus =
  | "STABLE"
  | "WATCH"
  | "MATERIAL_DRIFT"
  | "CRITICAL_DRIFT"
  | "INSUFFICIENT_DATA";

export type ShadowDriftDimension =
  | "PERFORMANCE"
  | "CONFIDENCE"
  | "REGIME"
  | "DATA_QUALITY"
  | "STRATEGY_SELECTION"
  | "PORTFOLIO_ALLOCATION"
  | "PARAMETER"
  | "CORRELATION";

export type ShadowDriftReading = {
  readonly dimension: ShadowDriftDimension;
  readonly status: ShadowDriftStatus;
  readonly deltaPct: number;
  readonly reason: string;
};

export type ShadowDriftReport = {
  readonly overall: ShadowDriftStatus;
  readonly readings: readonly ShadowDriftReading[];
  readonly driftScore: number;
};

function classify(deltaPct: number, sampleOk: boolean): ShadowDriftStatus {
  if (!sampleOk) return "INSUFFICIENT_DATA";
  const a = Math.abs(deltaPct);
  if (a <= 10) return "STABLE";
  if (a <= 25) return "WATCH";
  if (a <= 50) return "MATERIAL_DRIFT";
  return "CRITICAL_DRIFT";
}

function pct(current: number, baseline: number): number {
  if (baseline === 0) return current === 0 ? 0 : 100;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

export type DriftInputs = {
  readonly baseline: {
    winRate: number;
    profitFactor: number;
    expectedConfidence: number;
    capitalUtilization: number;
    dataQualityScore: number; // 0..1
    correlation: number;
  };
  readonly current: ShadowMetrics & {
    readonly regimeShift?: number;
    readonly strategyMixShift?: number;
    readonly parameterShift?: number;
    readonly correlationShift?: number;
    readonly dataQualityScore?: number;
  };
  readonly sampleSize: number;
  readonly minSamples?: number;
};

export function classifyShadowDrift(inp: DriftInputs): ShadowDriftReport {
  const sampleOk = inp.sampleSize >= (inp.minSamples ?? 20);
  const perf = pct(inp.current.winRate, inp.baseline.winRate);
  const conf = pct(inp.current.highConfidenceAccuracy, inp.baseline.expectedConfidence);
  const cap = pct(inp.current.capitalUtilization, inp.baseline.capitalUtilization);
  const dq = pct(inp.current.dataQualityScore ?? inp.baseline.dataQualityScore, inp.baseline.dataQualityScore);
  const regime = inp.current.regimeShift ?? 0;
  const strat = inp.current.strategyMixShift ?? 0;
  const param = inp.current.parameterShift ?? 0;
  const corr = inp.current.correlationShift ?? pct(inp.baseline.correlation, inp.baseline.correlation);

  const readings: ShadowDriftReading[] = [
    { dimension: "PERFORMANCE", status: classify(perf, sampleOk), deltaPct: perf, reason: `winRate Δ=${perf.toFixed(1)}%` },
    { dimension: "CONFIDENCE", status: classify(conf, sampleOk), deltaPct: conf, reason: `high-conf accuracy Δ=${conf.toFixed(1)}%` },
    { dimension: "REGIME", status: classify(regime, sampleOk), deltaPct: regime, reason: `regime shift ${regime.toFixed(1)}%` },
    { dimension: "DATA_QUALITY", status: classify(dq, sampleOk), deltaPct: dq, reason: `data quality Δ=${dq.toFixed(1)}%` },
    { dimension: "STRATEGY_SELECTION", status: classify(strat, sampleOk), deltaPct: strat, reason: `strategy mix ${strat.toFixed(1)}%` },
    { dimension: "PORTFOLIO_ALLOCATION", status: classify(cap, sampleOk), deltaPct: cap, reason: `capital util Δ=${cap.toFixed(1)}%` },
    { dimension: "PARAMETER", status: classify(param, sampleOk), deltaPct: param, reason: `parameter drift ${param.toFixed(1)}%` },
    { dimension: "CORRELATION", status: classify(corr, sampleOk), deltaPct: corr, reason: `correlation drift ${corr.toFixed(1)}%` },
  ];

  const rank: Record<ShadowDriftStatus, number> = {
    INSUFFICIENT_DATA: 0,
    STABLE: 1,
    WATCH: 2,
    MATERIAL_DRIFT: 3,
    CRITICAL_DRIFT: 4,
  };
  const overall = readings.reduce<ShadowDriftStatus>(
    (acc, r) => (rank[r.status] > rank[acc] ? r.status : acc),
    sampleOk ? "STABLE" : "INSUFFICIENT_DATA",
  );

  const driftScore = readings.reduce((a, r) => a + Math.abs(r.deltaPct), 0) / readings.length;
  return { overall, readings, driftScore };
}