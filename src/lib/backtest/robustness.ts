// Phase 21.6 · Stage 1 — Composite robustness score.
// Transparent: exposes weights, formulas, per-factor scores. Never mutates
// production defaults; consumers must supply the inputs from the existing
// walk-forward, Monte Carlo and sensitivity engines.

import type { SensitivityClassification } from "./parameter-sensitivity";

export type RobustnessInputs = {
  readonly walkForwardStability: number; // 0..1 (from research-stability)
  readonly oosConsistency: number; // 0..1
  readonly monteCarloP5FinalEquity: number;
  readonly monteCarloMedianFinalEquity: number;
  readonly startingCapital: number;
  readonly maxDrawdownPct: number; // 0..1 (Monte Carlo maxDD.p95 / startingCapital)
  readonly sensitivityClassification: SensitivityClassification;
  readonly tradeCount: number;
  readonly profitFactorConsistency: number; // 0..1 across walk-forward windows
};

export type RobustnessFactor = {
  readonly key: string;
  readonly weight: number;
  readonly value: number; // raw
  readonly score: number; // normalised 0..1
  readonly formula: string;
};

export type RobustnessStatus =
  | "ROBUST"
  | "ACCEPTABLE"
  | "FRAGILE"
  | "OVERFIT"
  | "INSUFFICIENT_DATA";

export type RobustnessResult = {
  readonly version: "ROBUSTNESS_V1";
  readonly factors: readonly RobustnessFactor[];
  readonly total: number; // 0..1
  readonly status: RobustnessStatus;
  readonly reason: string;
};

export const ROBUSTNESS_WEIGHTS = Object.freeze({
  walkForwardStability: 0.2,
  oosConsistency: 0.15,
  monteCarloP5: 0.2,
  drawdownResilience: 0.15,
  sensitivitySmoothness: 0.1,
  tradeCountAdequacy: 0.1,
  profitFactorConsistency: 0.1,
});

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function sensitivityToScore(c: SensitivityClassification): { score: number; formula: string } {
  switch (c) {
    case "STABLE_PLATEAU": return { score: 1, formula: "surface=STABLE_PLATEAU ⇒ 1.0" };
    case "MONOTONIC": return { score: 0.7, formula: "surface=MONOTONIC ⇒ 0.7" };
    case "NARROW_OPTIMUM": return { score: 0.3, formula: "surface=NARROW_OPTIMUM ⇒ 0.3" };
    case "ERRATIC": return { score: 0.1, formula: "surface=ERRATIC ⇒ 0.1" };
    default: return { score: 0, formula: "surface=INSUFFICIENT_DATA ⇒ 0" };
  }
}

export function computeRobustnessScore(inp: RobustnessInputs): RobustnessResult {
  if (inp.tradeCount < 20) {
    return {
      version: "ROBUSTNESS_V1",
      factors: [],
      total: 0,
      status: "INSUFFICIENT_DATA",
      reason: `INSUFFICIENT_DATA: tradeCount=${inp.tradeCount} (< 20)`,
    };
  }
  const w = ROBUSTNESS_WEIGHTS;
  const mcRatio = inp.startingCapital > 0 ? inp.monteCarloP5FinalEquity / inp.startingCapital : 0;
  const mcScore = clamp01((mcRatio - 0.8) / 0.4); // 0.8→0, 1.2→1
  const ddScore = clamp01(1 - inp.maxDrawdownPct / 0.5); // 0dd→1, 50%→0
  const tradesScore = clamp01((inp.tradeCount - 20) / 80); // 20→0, 100→1
  const sens = sensitivityToScore(inp.sensitivityClassification);

  const factors: RobustnessFactor[] = [
    { key: "walkForwardStability", weight: w.walkForwardStability, value: inp.walkForwardStability, score: clamp01(inp.walkForwardStability), formula: "clamp(walkForwardStability, 0, 1)" },
    { key: "oosConsistency", weight: w.oosConsistency, value: inp.oosConsistency, score: clamp01(inp.oosConsistency), formula: "clamp(oosConsistency, 0, 1)" },
    { key: "monteCarloP5", weight: w.monteCarloP5, value: mcRatio, score: mcScore, formula: "clamp((mcP5Final / capital − 0.8) / 0.4, 0, 1)" },
    { key: "drawdownResilience", weight: w.drawdownResilience, value: inp.maxDrawdownPct, score: ddScore, formula: "clamp(1 − maxDrawdownPct / 0.5, 0, 1)" },
    { key: "sensitivitySmoothness", weight: w.sensitivitySmoothness, value: 0, score: sens.score, formula: sens.formula },
    { key: "tradeCountAdequacy", weight: w.tradeCountAdequacy, value: inp.tradeCount, score: tradesScore, formula: "clamp((tradeCount − 20) / 80, 0, 1)" },
    { key: "profitFactorConsistency", weight: w.profitFactorConsistency, value: inp.profitFactorConsistency, score: clamp01(inp.profitFactorConsistency), formula: "clamp(profitFactorConsistency, 0, 1)" },
  ];
  const total = factors.reduce((a, f) => a + f.weight * f.score, 0);

  // Overfit detection: strong walk-forward stability but weak OOS + narrow optimum.
  const overfit = inp.walkForwardStability >= 0.7 && inp.oosConsistency <= 0.4 &&
    (inp.sensitivityClassification === "NARROW_OPTIMUM" || inp.sensitivityClassification === "ERRATIC");

  let status: RobustnessStatus;
  let reason: string;
  if (overfit) {
    status = "OVERFIT";
    reason = "Strong in-sample stability but weak out-of-sample consistency with unstable parameter surface — likely overfit.";
  } else if (total >= 0.75) {
    status = "ROBUST";
    reason = `Composite score ${total.toFixed(2)} across all seven factors.`;
  } else if (total >= 0.55) {
    status = "ACCEPTABLE";
    reason = `Composite score ${total.toFixed(2)} — usable but review weak factors.`;
  } else {
    status = "FRAGILE";
    reason = `Composite score ${total.toFixed(2)} — strategy is fragile under stress.`;
  }
  return { version: "ROBUSTNESS_V1", factors, total, status, reason };
}

// -- Deterministic Run ID.
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeRobustnessRunId(input: {
  researchRunId: string;
  monteCarloRunId?: string;
  sensitivityRunId?: string;
}): string {
  const key = [input.researchRunId, input.monteCarloRunId ?? "", input.sensitivityRunId ?? ""].join("|");
  return `ROBUSTNESS_V1:${fnv1a(key)}`;
}

export const ROBUSTNESS_VERSION = "ROBUSTNESS_V1";
