// Phase 2F — Canonical runtime-readiness aggregator (pure).
//
// Consumes a set of `RuntimeEvidence` items and produces one overall
// readiness verdict, including blockers, warnings and contradictions.
// No I/O. No fetching. The server-side collector is responsible for
// building the evidence list from already-cached canonical results.

import type { RuntimeEvidence, ModuleId } from "./runtime-evidence";
import { RUNTIME_EVIDENCE_SCHEMA_VERSION } from "./runtime-evidence";
import type { Contradiction } from "./contradictions";
import { detectContradictions } from "./contradictions";

export const CRITICAL_LAUNCH_MODULES: readonly ModuleId[] = [
  "MARKET_DATA",
  "INDIA_VIX",
  "OPTION_CHAIN_NIFTY",
  "OPTION_CHAIN_BANKNIFTY",
  "COMBINED_PCR",
  "DECISION_ENGINE",
];

export type OverallReadiness = "READY" | "PARTIALLY_READY" | "NOT_READY";

export interface RuntimeReadinessReport {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly overall: OverallReadiness;
  readonly criticalModules: readonly ModuleId[];
  readonly evidence: readonly RuntimeEvidence[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly contradictions: readonly Contradiction[];
  readonly provenance: {
    readonly modules: number;
    readonly healthy: number;
    readonly degraded: number;
    readonly blocked: number;
    readonly demo: number;
  };
}

export function aggregateRuntimeReadiness(
  evidence: readonly RuntimeEvidence[],
  opts: { generatedAt: string; criticalModules?: readonly ModuleId[] },
): RuntimeReadinessReport {
  const critical = new Set(opts.criticalModules ?? CRITICAL_LAUNCH_MODULES);
  const contradictions = detectContradictions(evidence);

  const blockers: string[] = [];
  const warnings: string[] = [];
  let healthy = 0, degraded = 0, blocked = 0, demo = 0;
  let criticalNotReady = false;
  let anyDegraded = false;

  for (const e of evidence) {
    if (e.status === "HEALTHY") healthy++;
    else if (e.status === "DEGRADED") { degraded++; anyDegraded = true; }
    else if (e.status === "DEMO") demo++;
    else if (e.status === "BLOCKED" || e.status === "UNAVAILABLE") blocked++;

    for (const b of e.blockers) blockers.push(`${e.module}: ${b}`);
    for (const w of e.warnings) warnings.push(`${e.module}: ${w}`);

    if (critical.has(e.module)) {
      if (e.readiness !== "READY") {
        criticalNotReady = true;
      }
      if (e.status === "DEMO") {
        criticalNotReady = true;
      }
    }
  }

  const criticalContradictions = contradictions.filter((c) => c.severity === "critical");
  const overall: OverallReadiness =
    criticalNotReady || criticalContradictions.length > 0 || blockers.length > 0
      ? "NOT_READY"
      : anyDegraded || demo > 0 || warnings.length > 0 || contradictions.length > 0
        ? "PARTIALLY_READY"
        : "READY";

  return {
    schemaVersion: RUNTIME_EVIDENCE_SCHEMA_VERSION,
    generatedAt: opts.generatedAt,
    overall,
    criticalModules: [...critical],
    evidence,
    blockers,
    warnings,
    contradictions,
    provenance: {
      modules: evidence.length,
      healthy,
      degraded,
      blocked,
      demo,
    },
  };
}

export function exportRuntimeReadiness(report: RuntimeReadinessReport): string {
  // Redaction is trivial here — evidence never contains URLs or secrets.
  return JSON.stringify(report, null, 2);
}
