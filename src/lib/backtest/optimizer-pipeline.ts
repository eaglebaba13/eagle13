// Phase 21.9 · Stage 2 — Deterministic optimizer pipeline.
// Consumes a ResolvedResearchContext and calls the existing
// runExplainableOptimization exactly once. Never recomputes upstream
// research; never mutates production defaults.

import {
  runExplainableOptimization,
  type OptimizerConfig,
  type OptimizerResult,
} from "./explainable-optimizer";
import {
  assertResearchContext,
  type ResolvedResearchContext,
} from "./research-context";

export type OptimizerPipelineResult = {
  readonly context: ResolvedResearchContext;
  readonly result: OptimizerResult;
  readonly completedAt: string;
};

export function runOptimizerPipeline(
  ctx: ResolvedResearchContext,
  config?: OptimizerConfig,
  now: () => string = () => new Date().toISOString(),
): OptimizerPipelineResult {
  assertResearchContext(ctx);
  const result = runExplainableOptimization({
    strategy: ctx.strategy,
    formulaVersion: ctx.formulaVersion,
    baseRunId: ctx.baseRunId,
    researchRunIds: ctx.researchRunIds,
    parameterSpace: ctx.parameterSpace,
    sensitivityCells: ctx.sensitivityCells,
    aggregate: ctx.aggregate,
    provider: ctx.provider,
    from: ctx.from,
    to: ctx.to,
    dataHash: ctx.dataHash,
    costs: ctx.costs,
    config,
  });
  return { context: ctx, result, completedAt: now() };
}