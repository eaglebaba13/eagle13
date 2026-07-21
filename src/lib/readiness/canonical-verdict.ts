// Phase 41 — Canonical readiness verdict model.
//
// Single deterministic mapping from the aggregated RuntimeReadinessReport
// to the three verdicts every readiness surface must render:
//   - runtime     (mirror of RuntimeReadinessReport.overall)
//   - subscription (paid-user gate)
//   - closedBeta   (controlled beta gate)
//
// Dependency rules (enforced by tests):
//   - runtime NOT_READY  → subscription must be BLOCKED
//                        → closedBeta must not be READY (may be HOLD)
//   - runtime PARTIALLY_READY → subscription HOLD, closedBeta READY-with-caveat
//   - runtime READY      → subscription READY, closedBeta READY
//
// Pure. No I/O.

import type { RuntimeReadinessReport } from "@/lib/runtime-readiness/runtime-readiness";

export type CanonicalGate = "READY" | "HOLD" | "BLOCKED";

export interface CanonicalReadinessVerdict {
  readonly runtime: "READY" | "PARTIALLY_READY" | "NOT_READY";
  readonly subscription: CanonicalGate;
  readonly closedBeta: CanonicalGate;
  readonly caveats: readonly string[];
  readonly rationale: string;
  readonly generatedAt: string;
}

export function deriveCanonicalVerdict(
  report: RuntimeReadinessReport | null,
): CanonicalReadinessVerdict {
  if (!report) {
    return {
      runtime: "NOT_READY",
      subscription: "BLOCKED",
      closedBeta: "BLOCKED",
      caveats: ["Runtime readiness report unavailable"],
      rationale: "No runtime evidence collected",
      generatedAt: new Date().toISOString(),
    };
  }
  const runtime = report.overall;
  const criticalContradictions = report.contradictions.some(
    (c) => c.severity === "critical",
  );
  const caveats: string[] = [];

  if (runtime === "NOT_READY" || criticalContradictions) {
    return {
      runtime,
      subscription: "BLOCKED",
      closedBeta: criticalContradictions ? "BLOCKED" : "HOLD",
      caveats: criticalContradictions
        ? ["Critical cross-module contradictions detected — subscription and closed beta blocked"]
        : ["Runtime NOT READY — subscription blocked; closed beta on hold until blockers clear"],
      rationale:
        criticalContradictions
          ? "Critical contradictions between modules"
          : "Runtime aggregator reports NOT_READY",
      generatedAt: report.generatedAt,
    };
  }

  if (runtime === "PARTIALLY_READY") {
    caveats.push(
      "Runtime degraded but acceptable for controlled closed beta. Subscription remains on hold until READY.",
    );
    if (report.warnings.length > 0) {
      caveats.push(`${report.warnings.length} runtime warning(s) present`);
    }
    return {
      runtime,
      subscription: "HOLD",
      closedBeta: "READY",
      caveats,
      rationale:
        "Runtime PARTIALLY_READY — closed beta permitted with caveats; paid subscription requires full READY",
      generatedAt: report.generatedAt,
    };
  }

  return {
    runtime: "READY",
    subscription: "READY",
    closedBeta: "READY",
    caveats: [],
    rationale: "Runtime READY — all critical modules healthy",
    generatedAt: report.generatedAt,
  };
}

export function verdictLabel(g: CanonicalGate): string {
  return g === "READY" ? "READY" : g === "HOLD" ? "ON HOLD" : "BLOCKED";
}

export function verdictTone(g: CanonicalGate): "ok" | "warn" | "err" {
  return g === "READY" ? "ok" : g === "HOLD" ? "warn" : "err";
}