// Phase 3E — Smart Alert historical study.

import { computeOutcome } from "./outcomes";
import type {
  HistoricalRow,
  OutcomeThresholds,
  SmartAlertStudyReport,
} from "./types";
import { DEFAULT_OUTCOME_THRESHOLDS } from "./types";

export function runSmartAlertStudy(
  rows: readonly HistoricalRow[],
  thresholds: OutcomeThresholds = DEFAULT_OUTCOME_THRESHOLDS,
): SmartAlertStudyReport {
  const byFamily: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let total = 0;
  let dup = 0;
  let readinessBlocked = 0;
  let stale = 0;
  let aligned = 0;
  let falsePositives = 0;
  const warnings: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const outcome = computeOutcome(i, rows, thresholds);
    for (const a of r.smartAlerts) {
      total++;
      byFamily[a.family] = (byFamily[a.family] ?? 0) + 1;
      bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
      if (a.duplicateSuppressed) dup++;
      if (a.readinessBlocked) readinessBlocked++;
      if (a.staleData) stale++;
      if (!outcome.available) continue;
      // Coarse alignment: HIGH/CRITICAL severity with a directional next-session move.
      const severe = a.severity === "HIGH" || a.severity === "CRITICAL";
      if (severe) {
        if (outcome.gapDirection === "GAP_UP" || outcome.gapDirection === "GAP_DOWN") aligned++;
        else if (outcome.gapDirection === "FLAT") falsePositives++;
      }
    }
  }
  return {
    totalAlerts: total,
    byFamily,
    bySeverity,
    duplicateSuppressed: dup,
    readinessBlocked,
    staleData: stale,
    falsePositives,
    alignedOutcomes: aligned,
    averageResolutionSessions: null,
    warnings,
  };
}
