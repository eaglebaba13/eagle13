// Phase 21.5 · Stage 1 — Stability score + research status classification.
// Pure. Every weight is exported so the UI can render the formula.

import type { DegradationReport, WalkForwardResult, WindowMetrics } from "./walk-forward";

export type StabilityFactorId =
  | "profitFactorStability"
  | "drawdownStability"
  | "expectancyStability"
  | "longShortBalance"
  | "tradeCountAdequacy"
  | "outOfSampleConsistency"
  | "recoveryConsistency";

export const STABILITY_WEIGHTS: Readonly<Record<StabilityFactorId, number>> =
  Object.freeze({
    profitFactorStability: 0.2,
    drawdownStability: 0.15,
    expectancyStability: 0.15,
    longShortBalance: 0.1,
    tradeCountAdequacy: 0.1,
    outOfSampleConsistency: 0.2,
    recoveryConsistency: 0.1,
  });

export const STABILITY_FORMULAS: Readonly<Record<StabilityFactorId, string>> =
  Object.freeze({
    profitFactorStability:
      "100 - min(100, |Δ profit factor%|)",
    drawdownStability: "100 - min(100, |Δ drawdown%|)",
    expectancyStability: "100 - min(100, |Δ expectancy%|)",
    longShortBalance:
      "100 - min(100, |longCount - shortCount| / max(1, longCount + shortCount) * 100)",
    tradeCountAdequacy:
      "min(100, validationTradeCount / minSample * 100), minSample=20",
    outOfSampleConsistency:
      "100 if training and validation same sign, else max(0, 100 - |Δ netPnl%|)",
    recoveryConsistency: "100 - min(100, |Δ recovery%|)",
  });

export type StabilityFactor = {
  id: StabilityFactorId;
  value: number;
  weight: number;
  formula: string;
};

export type StabilityReport = {
  score: number;
  factors: readonly StabilityFactor[];
  status: ResearchStatus;
};

export type ResearchStatus =
  | "EXCELLENT"
  | "GOOD"
  | "AVERAGE"
  | "WEAK"
  | "UNSTABLE"
  | "INSUFFICIENT_DATA";

function clampAbs(pct: number): number {
  if (!Number.isFinite(pct)) return 100;
  return Math.min(100, Math.abs(pct));
}

function stabilityFrom(pct: number): number {
  return Math.max(0, 100 - clampAbs(pct));
}

export function classifyStatus(score: number, tradeCount: number): ResearchStatus {
  if (tradeCount < 20) return "INSUFFICIENT_DATA";
  if (score >= 80) return "EXCELLENT";
  if (score >= 65) return "GOOD";
  if (score >= 50) return "AVERAGE";
  if (score >= 30) return "WEAK";
  return "UNSTABLE";
}

export function computeStabilityForWindow(
  training: WindowMetrics,
  validation: WindowMetrics,
  degradation: DegradationReport,
): StabilityReport {
  const balanceDelta =
    validation.longCount + validation.shortCount > 0
      ? (Math.abs(validation.longCount - validation.shortCount) /
          Math.max(1, validation.longCount + validation.shortCount)) *
        100
      : 100;
  const sameSign =
    (training.netPnl >= 0 && validation.netPnl >= 0) ||
    (training.netPnl < 0 && validation.netPnl < 0);
  const oosConsistency = sameSign ? 100 : stabilityFrom(degradation.netPnl);
  const factors: StabilityFactor[] = [
    {
      id: "profitFactorStability",
      value: stabilityFrom(degradation.profitFactor),
      weight: STABILITY_WEIGHTS.profitFactorStability,
      formula: STABILITY_FORMULAS.profitFactorStability,
    },
    {
      id: "drawdownStability",
      value: stabilityFrom(degradation.drawdown),
      weight: STABILITY_WEIGHTS.drawdownStability,
      formula: STABILITY_FORMULAS.drawdownStability,
    },
    {
      id: "expectancyStability",
      value: stabilityFrom(degradation.expectancy),
      weight: STABILITY_WEIGHTS.expectancyStability,
      formula: STABILITY_FORMULAS.expectancyStability,
    },
    {
      id: "longShortBalance",
      value: Math.max(0, 100 - balanceDelta),
      weight: STABILITY_WEIGHTS.longShortBalance,
      formula: STABILITY_FORMULAS.longShortBalance,
    },
    {
      id: "tradeCountAdequacy",
      value: Math.min(100, (validation.tradeCount / 20) * 100),
      weight: STABILITY_WEIGHTS.tradeCountAdequacy,
      formula: STABILITY_FORMULAS.tradeCountAdequacy,
    },
    {
      id: "outOfSampleConsistency",
      value: oosConsistency,
      weight: STABILITY_WEIGHTS.outOfSampleConsistency,
      formula: STABILITY_FORMULAS.outOfSampleConsistency,
    },
    {
      id: "recoveryConsistency",
      value: stabilityFrom(degradation.recovery),
      weight: STABILITY_WEIGHTS.recoveryConsistency,
      formula: STABILITY_FORMULAS.recoveryConsistency,
    },
  ];
  const raw = factors.reduce((acc, f) => acc + f.value * f.weight, 0);
  const score = Math.round(raw * 100) / 100;
  return {
    score,
    factors,
    status: classifyStatus(score, validation.tradeCount),
  };
}

/** Aggregates window-level reports into a single walk-forward-level report. */
export function aggregateStability(result: WalkForwardResult): StabilityReport {
  if (result.windows.length === 0) {
    return {
      score: 0,
      factors: [],
      status: "INSUFFICIENT_DATA",
    };
  }
  const perWindow = result.windows.map((w) =>
    computeStabilityForWindow(w.trainingMetrics, w.validationMetrics, w.degradation),
  );
  const n = perWindow.length;
  const factorIds = Object.keys(STABILITY_WEIGHTS) as StabilityFactorId[];
  const avgFactors: StabilityFactor[] = factorIds.map((id) => {
    const avg =
      perWindow.reduce((acc, r) => {
        const f = r.factors.find((x) => x.id === id);
        return acc + (f?.value ?? 0);
      }, 0) / n;
    return {
      id,
      value: Math.round(avg * 100) / 100,
      weight: STABILITY_WEIGHTS[id],
      formula: STABILITY_FORMULAS[id],
    };
  });
  const score = Math.round(
    (perWindow.reduce((a, r) => a + r.score, 0) / n) * 100,
  ) / 100;
  const totalValidationTrades = result.windows.reduce(
    (a, w) => a + w.validationMetrics.tradeCount,
    0,
  );
  return {
    score,
    factors: avgFactors,
    status: classifyStatus(score, totalValidationTrades),
  };
}