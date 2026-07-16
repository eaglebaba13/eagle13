import type { ReadinessResult, ReadinessSeverity } from "./production-readiness-types";

export type Traffic = "green" | "yellow" | "red";

export interface ObservabilityInput {
  api: Traffic;
  providers: Traffic;
  cache: Traffic;
  scheduler: Traffic;
  database: Traffic;
  storage: Traffic;
  auth: Traffic;
  payment: Traffic;
  dashboardFreshness: Traffic;
  shadowReadiness: Traffic;
  decisionCenter: Traffic;
  memory: Traffic;
  errorRate: number;
  slowRequestRate: number;
  buildVersion: string | null;
  deploymentVersion: string | null;
}

const TRAFFIC_STATUS: Record<Traffic, "PASS" | "WARNING" | "FAIL"> = {
  green: "PASS",
  yellow: "WARNING",
  red: "FAIL",
};

export function auditObservability(input: ObservabilityInput): ReadinessResult[] {
  const facets: Array<[string, Traffic]> = [
    ["api", input.api],
    ["providers", input.providers],
    ["cache", input.cache],
    ["scheduler", input.scheduler],
    ["database", input.database],
    ["storage", input.storage],
    ["auth", input.auth],
    ["payment", input.payment],
    ["dashboardFreshness", input.dashboardFreshness],
    ["shadowReadiness", input.shadowReadiness],
    ["decisionCenter", input.decisionCenter],
    ["memory", input.memory],
  ];
  const out: ReadinessResult[] = facets.map(([name, t]) => ({
    id: `obs.${name}`,
    category: "OBSERVABILITY" as const,
    title: `Health: ${name}`,
    status: TRAFFIC_STATUS[t],
    severity: (t === "red" ? "critical" : t === "yellow" ? "warning" : "info") as ReadinessSeverity,
  }));

  out.push({
    id: "obs.error-rate",
    category: "OBSERVABILITY",
    title: "Error rate",
    status: input.errorRate > 0.02 ? "WARNING" : "PASS",
    severity: input.errorRate > 0.05 ? "critical" : input.errorRate > 0.02 ? "warning" : "info",
    evidence: [{ key: "errorRate", value: input.errorRate }],
  });
  out.push({
    id: "obs.build-version",
    category: "OBSERVABILITY",
    title: "Build/deployment version recorded",
    status: input.buildVersion && input.deploymentVersion ? "PASS" : "WARNING",
    severity: "info",
    evidence: [
      { key: "build", value: input.buildVersion ?? "unknown" },
      { key: "deploy", value: input.deploymentVersion ?? "unknown" },
    ],
  });
  return out;
}
