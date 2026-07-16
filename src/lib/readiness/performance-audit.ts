import type { PerformanceMeasurement, StagingCheck } from "./staging/staging-validation-types";

export interface PerformanceBudget {
  id: string;
  label: string;
  warnMs: number;
  failMs: number;
}

export interface PerformanceSample {
  id: string;
  valueMs: number;
}

export const DEFAULT_PERFORMANCE_BUDGETS: readonly PerformanceBudget[] = [
  { id: "server.response", label: "Server response time", warnMs: 400, failMs: 1500 },
  { id: "route.load", label: "Route load", warnMs: 1200, failMs: 3500 },
  { id: "ttfd", label: "Time to first data", warnMs: 800, failMs: 2500 },
  { id: "lcp", label: "Largest contentful paint", warnMs: 2500, failMs: 4000 },
  { id: "inp", label: "Interaction delay", warnMs: 200, failMs: 500 },
  { id: "hydration", label: "Hydration duration", warnMs: 600, failMs: 2000 },
  { id: "bundle.transferred", label: "Bundle transferred (KB→ms proxy)", warnMs: 350, failMs: 700 },
  { id: "backtest.exec", label: "Backtest execution", warnMs: 4000, failMs: 12000 },
  { id: "research.exec", label: "Research execution", warnMs: 6000, failMs: 20000 },
  { id: "portfolio.exec", label: "Portfolio execution", warnMs: 5000, failMs: 15000 },
  { id: "shadow.cycle", label: "Shadow cycle", warnMs: 3000, failMs: 8000 },
  { id: "export.duration", label: "Export duration", warnMs: 2000, failMs: 8000 },
];

export function auditPerformance(
  samples: readonly PerformanceSample[],
  budgets: readonly PerformanceBudget[] = DEFAULT_PERFORMANCE_BUDGETS,
): { measurements: PerformanceMeasurement[]; checks: StagingCheck[] } {
  const measurements: PerformanceMeasurement[] = [];
  const checks: StagingCheck[] = [];
  const byId = new Map(budgets.map((b) => [b.id, b] as const));
  for (const s of samples) {
    const b = byId.get(s.id);
    if (!b) continue;
    const status: PerformanceMeasurement["status"] =
      s.valueMs >= b.failMs ? "FAIL" : s.valueMs >= b.warnMs ? "WARNING" : "PASS";
    measurements.push({
      id: b.id,
      label: b.label,
      valueMs: s.valueMs,
      warnMs: b.warnMs,
      failMs: b.failMs,
      status,
    });
    checks.push({
      id: `performance.${b.id}`,
      category: "PERFORMANCE",
      title: b.label,
      status,
      severity: status === "FAIL" ? "critical" : status === "WARNING" ? "warning" : "info",
      detail: `value=${s.valueMs}ms warn=${b.warnMs}ms fail=${b.failMs}ms`,
    });
  }
  return { measurements, checks };
}