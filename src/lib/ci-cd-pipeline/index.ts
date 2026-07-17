// Phase 31 · CI/CD pipeline definition.
//
// Declarative pipeline used to (a) render an admin overview and (b) drive
// deployment-audit tests. Pure data + a validator; no execution here.

export type PipelineStageId =
  | "lint"
  | "typescript"
  | "unit-tests"
  | "build"
  | "security-scan"
  | "dependency-audit"
  | "bundle-analysis"
  | "deploy"
  | "post-deploy-health"
  | "rollback";

export type PipelineStage = {
  id: PipelineStageId;
  label: string;
  dependsOn: PipelineStageId[];
  blocking: boolean;
  description: string;
};

export const PRODUCTION_PIPELINE: PipelineStage[] = [
  { id: "lint", label: "Lint", dependsOn: [], blocking: true, description: "ESLint across src/**" },
  { id: "typescript", label: "TypeScript", dependsOn: ["lint"], blocking: true, description: "tsgo strict typecheck" },
  { id: "unit-tests", label: "Unit tests", dependsOn: ["typescript"], blocking: true, description: "Vitest suite" },
  { id: "build", label: "Build", dependsOn: ["unit-tests"], blocking: true, description: "Production Vite build" },
  { id: "security-scan", label: "Security scan", dependsOn: ["build"], blocking: true, description: "Backend + code security" },
  { id: "dependency-audit", label: "Dependency audit", dependsOn: ["build"], blocking: true, description: "npm audit for high/critical" },
  { id: "bundle-analysis", label: "Bundle analysis", dependsOn: ["build"], blocking: false, description: "Bundle size budgets" },
  { id: "deploy", label: "Deploy", dependsOn: ["security-scan", "dependency-audit"], blocking: true, description: "Blue/Green candidate deploy" },
  { id: "post-deploy-health", label: "Post-deploy health", dependsOn: ["deploy"], blocking: true, description: "Health endpoints must be green" },
  { id: "rollback", label: "Rollback", dependsOn: ["post-deploy-health"], blocking: false, description: "Automatic rollback trigger on failure" },
];

export function validatePipeline(stages: PipelineStage[] = PRODUCTION_PIPELINE): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const known = new Set(stages.map((s) => s.id));
  for (const s of stages) {
    for (const dep of s.dependsOn) {
      if (!known.has(dep)) errors.push(`${s.id} depends on unknown stage ${dep}`);
    }
  }
  // Detect cycles via topological sort.
  const indeg = new Map<PipelineStageId, number>();
  for (const s of stages) indeg.set(s.id, 0);
  for (const s of stages) for (const d of s.dependsOn) indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1);
  const q: PipelineStageId[] = [...indeg].filter(([, v]) => v === 0).map(([k]) => k);
  let visited = 0;
  while (q.length) {
    const cur = q.shift()!;
    visited++;
    for (const s of stages) {
      if (s.dependsOn.includes(cur)) {
        indeg.set(s.id, (indeg.get(s.id) ?? 0) - 1);
        if (indeg.get(s.id) === 0) q.push(s.id);
      }
    }
  }
  if (visited !== stages.length) errors.push("cycle detected in pipeline");
  return { ok: errors.length === 0, errors };
}

export type PipelineRunResult = {
  stageResults: Array<{ id: PipelineStageId; ok: boolean; skipped?: boolean }>;
  verdict: "PASS" | "FAIL";
};

/** Evaluate a run given per-stage outcomes (missing = skipped). */
export function evaluatePipelineRun(
  outcomes: Partial<Record<PipelineStageId, boolean>>,
  stages: PipelineStage[] = PRODUCTION_PIPELINE,
): PipelineRunResult {
  const stageResults = stages.map((s) => {
    const v = outcomes[s.id];
    return { id: s.id, ok: v === true, skipped: v === undefined };
  });
  const failedBlocking = stageResults.some((r) => {
    const stage = stages.find((s) => s.id === r.id)!;
    return stage.blocking && (!r.ok || r.skipped);
  });
  return { stageResults, verdict: failedBlocking ? "FAIL" : "PASS" };
}