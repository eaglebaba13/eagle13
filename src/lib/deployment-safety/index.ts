// Phase 31 · Deployment safety.
//
// Deterministic evaluator for blue/green style deployments: given the
// post-deploy health of the candidate colour and manual approval status,
// decide PROMOTE | HOLD | ROLLBACK.

import type { HealthStatus } from "@/lib/health-endpoints";

export type DeploymentColour = "blue" | "green";

export type DeploymentDecision = "PROMOTE" | "HOLD" | "ROLLBACK";

export type DeploymentEvaluationInput = {
  activeColour: DeploymentColour;
  candidateColour: DeploymentColour;
  candidateHealth: HealthStatus;
  candidateErrorRate: number; // 0..1 over post-deploy window
  candidateLatencyP95Ms: number;
  manualApproval: boolean;
  targetEnvironment: "staging" | "production";
  thresholds?: { maxErrorRate: number; maxLatencyP95Ms: number };
};

export type DeploymentEvaluation = {
  decision: DeploymentDecision;
  reasons: string[];
  automaticRollback: boolean;
};

const DEFAULT_THRESHOLDS = { maxErrorRate: 0.02, maxLatencyP95Ms: 1500 };

export function evaluateDeployment(input: DeploymentEvaluationInput): DeploymentEvaluation {
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  const reasons: string[] = [];
  let automaticRollback = false;

  if (input.candidateColour === input.activeColour) {
    reasons.push("candidate colour must differ from active colour");
  }
  if (input.candidateHealth === "unhealthy") {
    reasons.push("candidate health is unhealthy");
    automaticRollback = true;
  }
  if (input.candidateErrorRate > t.maxErrorRate) {
    reasons.push(`error rate ${input.candidateErrorRate.toFixed(4)} exceeds ${t.maxErrorRate}`);
    automaticRollback = true;
  }
  if (input.candidateLatencyP95Ms > t.maxLatencyP95Ms) {
    reasons.push(`p95 latency ${input.candidateLatencyP95Ms}ms exceeds ${t.maxLatencyP95Ms}ms`);
  }

  if (automaticRollback) {
    return { decision: "ROLLBACK", reasons, automaticRollback };
  }

  if (input.targetEnvironment === "production" && !input.manualApproval) {
    reasons.push("manual approval required for production");
    return { decision: "HOLD", reasons, automaticRollback: false };
  }

  if (input.candidateHealth === "degraded" || reasons.length > 0) {
    return {
      decision: "HOLD",
      reasons: reasons.length ? reasons : ["candidate is degraded"],
      automaticRollback: false,
    };
  }

  return { decision: "PROMOTE", reasons: ["all gates passed"], automaticRollback: false };
}