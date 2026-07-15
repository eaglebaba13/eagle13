// Phase 21.2 · Stage 5 — deterministic Readiness Gate for the Absolute-Degree
// Intraday methodology. Display-only. Never mutates production defaults.

import { READINESS_GATE_VERSION } from "./engine-version";
import type { CoreMetrics, CubeGrade } from "./gann-intraday-metrics";

export type ReadinessVerdict =
  | "NOT_READY"
  | "READY_FOR_LIMITED_BETA"
  | "READY_FOR_PRODUCTION_REVIEW";

export type ReadinessCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type ReadinessInputs = {
  monthsCovered: number;
  validSessions: number;
  overall: CoreMetrics;
  cubeGrades: Record<CubeGrade, CoreMetrics>;
  causalityFailures: number;
  snapshotMutations: number;
  formulaMixingDetected: boolean;
  shadowAlertErrors: number;
  providerErrorRate: number; // 0..1
  mobileAuditPassed: boolean;
  hydrationAuditPassed: boolean;
};

export type ReadinessReport = {
  version: typeof READINESS_GATE_VERSION;
  verdict: ReadinessVerdict;
  checks: ReadinessCheck[];
  labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION";
};

export function evaluateReadiness(i: ReadinessInputs): ReadinessReport {
  const checks: ReadinessCheck[] = [];
  const push = (id: string, label: string, passed: boolean, detail: string) =>
    checks.push({ id, label, passed, detail });

  push(
    "months_covered",
    "≥ 3 months of valid 5-minute data",
    i.monthsCovered >= 3,
    `${i.monthsCovered.toFixed(1)} months`,
  );
  push(
    "min_trades",
    "≥ 100 confirmed trades combined",
    i.overall.totalTrades >= 100,
    `${i.overall.totalTrades} trades`,
  );
  push(
    "no_causality_failure",
    "No causality failure",
    i.causalityFailures === 0,
    `${i.causalityFailures} failures`,
  );
  push(
    "no_snapshot_mutation",
    "No snapshot mutation",
    i.snapshotMutations === 0,
    `${i.snapshotMutations} mutations`,
  );
  push(
    "no_formula_mix",
    "No formula-version mixing",
    !i.formulaMixingDetected,
    i.formulaMixingDetected ? "mixed" : "isolated",
  );
  push(
    "expectancy_positive",
    "Cost-adjusted expectancy > 0",
    i.overall.expectancy > 0,
    `${i.overall.expectancy.toFixed(2)}`,
  );
  push(
    "drawdown_bounded",
    "Max drawdown ≤ 40% of net PnL",
    i.overall.netPnL <= 0 || i.overall.maxDrawdown <= 0.4 * Math.max(1, i.overall.netPnL),
    `DD=${i.overall.maxDrawdown.toFixed(0)} / PnL=${i.overall.netPnL.toFixed(0)}`,
  );
  const aWr = i.cubeGrades.A?.winRate ?? 0;
  const cWr = i.cubeGrades.C?.winRate ?? 0;
  push(
    "cube_monotonic",
    "Cube A win-rate ≥ Cube C win-rate",
    aWr >= cWr,
    `A=${(aWr * 100).toFixed(1)}% C=${(cWr * 100).toFixed(1)}%`,
  );
  push(
    "shadow_stable",
    "Shadow alerts stable",
    i.shadowAlertErrors === 0,
    `${i.shadowAlertErrors} errors`,
  );
  push(
    "provider_reliable",
    "Provider error rate < 5%",
    i.providerErrorRate < 0.05,
    `${(i.providerErrorRate * 100).toFixed(2)}%`,
  );
  push("mobile_audit", "Mobile audit passed", i.mobileAuditPassed, "");
  push("hydration_audit", "Hydration audit passed", i.hydrationAuditPassed, "");

  const hardFails = checks.filter(
    (c) =>
      !c.passed &&
      [
        "no_causality_failure",
        "no_snapshot_mutation",
        "no_formula_mix",
      ].includes(c.id),
  ).length;
  const softPassed = checks.filter((c) => c.passed).length;
  const total = checks.length;

  let verdict: ReadinessVerdict = "NOT_READY";
  if (hardFails === 0) {
    if (softPassed === total) verdict = "READY_FOR_PRODUCTION_REVIEW";
    else if (softPassed >= Math.ceil(total * 0.75)) verdict = "READY_FOR_LIMITED_BETA";
  }
  return {
    version: READINESS_GATE_VERSION,
    verdict,
    checks,
    labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
  };
}