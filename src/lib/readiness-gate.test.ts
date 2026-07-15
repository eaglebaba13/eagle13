import { describe, it, expect } from "vitest";
import { evaluateReadiness } from "./readiness-gate";
import type { CoreMetrics, CubeGrade } from "./gann-intraday-metrics";

const zeroMetrics: CoreMetrics = {
  sessions: 0,
  totalTrades: 0,
  wins: 0,
  losses: 0,
  ambiguous: 0,
  buys: 0,
  sells: 0,
  missedChase: 0,
  cubeApproved: 0,
  cubeRejected: 0,
  firstTouches: 0,
  confirmed: 0,
  retest: 0,
  winRate: 0,
  profitFactor: 0,
  expectancy: 0,
  netPnL: 0,
  maxDrawdown: 0,
  maxConsecutiveWins: 0,
  maxConsecutiveLosses: 0,
  avgMfe: 0,
  avgMae: 0,
};

const gradesAllZero: Record<CubeGrade, CoreMetrics> = {
  A: zeroMetrics,
  B: zeroMetrics,
  C: zeroMetrics,
  NONE: zeroMetrics,
};

describe("Phase 21.2 Stage 5 · readiness gate", () => {
  it("returns NOT_READY with zero coverage", () => {
    const r = evaluateReadiness({
      monthsCovered: 0,
      validSessions: 0,
      overall: zeroMetrics,
      cubeGrades: gradesAllZero,
      causalityFailures: 0,
      snapshotMutations: 0,
      formulaMixingDetected: false,
      shadowAlertErrors: 0,
      providerErrorRate: 0,
      mobileAuditPassed: true,
      hydrationAuditPassed: true,
    });
    expect(r.verdict).toBe("NOT_READY");
  });

  it("returns NOT_READY on any hard-fail regardless of soft passes", () => {
    const overall: CoreMetrics = { ...zeroMetrics, totalTrades: 200, expectancy: 5, netPnL: 1000 };
    const grades: Record<CubeGrade, CoreMetrics> = {
      ...gradesAllZero,
      A: { ...zeroMetrics, winRate: 0.7 },
      C: { ...zeroMetrics, winRate: 0.4 },
    };
    const r = evaluateReadiness({
      monthsCovered: 6,
      validSessions: 120,
      overall,
      cubeGrades: grades,
      causalityFailures: 1,
      snapshotMutations: 0,
      formulaMixingDetected: false,
      shadowAlertErrors: 0,
      providerErrorRate: 0.01,
      mobileAuditPassed: true,
      hydrationAuditPassed: true,
    });
    expect(r.verdict).toBe("NOT_READY");
  });

  it("returns READY_FOR_PRODUCTION_REVIEW when every check passes", () => {
    const overall: CoreMetrics = { ...zeroMetrics, totalTrades: 200, expectancy: 5, netPnL: 1000 };
    const grades: Record<CubeGrade, CoreMetrics> = {
      ...gradesAllZero,
      A: { ...zeroMetrics, winRate: 0.7 },
      C: { ...zeroMetrics, winRate: 0.4 },
    };
    const r = evaluateReadiness({
      monthsCovered: 6,
      validSessions: 120,
      overall,
      cubeGrades: grades,
      causalityFailures: 0,
      snapshotMutations: 0,
      formulaMixingDetected: false,
      shadowAlertErrors: 0,
      providerErrorRate: 0.01,
      mobileAuditPassed: true,
      hydrationAuditPassed: true,
    });
    expect(r.verdict).toBe("READY_FOR_PRODUCTION_REVIEW");
  });
});