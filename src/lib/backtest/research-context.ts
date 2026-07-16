// Phase 21.9 · Stage 2 — ResolvedResearchContext.
// Pure, immutable snapshot of already-computed research outputs. The
// optimizer pipeline consumes this without ever recomputing upstream
// research. Nothing in this module executes engines or touches Run IDs.

import type {
  ParameterSpec,
  SensitivityCell,
} from "./parameter-sensitivity";
import type {
  OptimizerAggregateInputs,
  OptimizerStrategyId,
} from "./explainable-optimizer";

export type ResolvedResearchContext = {
  readonly strategy: OptimizerStrategyId;
  readonly formulaVersion: string;
  readonly baseRunId: string;
  readonly researchRunIds: Readonly<Record<string, string>>;
  readonly provider: string;
  readonly instrument: string;
  readonly from: string;
  readonly to: string;
  readonly dataHash: string;
  readonly parameterSpace: readonly ParameterSpec[];
  readonly sensitivityCells: readonly SensitivityCell[];
  readonly aggregate: OptimizerAggregateInputs;
  readonly currentParameters?: Readonly<Record<string, number>>;
  readonly costs?: string;
};

export type ResearchContextGap = {
  readonly key: string;
  readonly message: string;
};

// Report missing pieces without throwing. Used by the UI to gate the
// "Run Optimizer" button and to explain what the user still owes.
export function inspectResearchContext(
  ctx: Partial<ResolvedResearchContext> | null | undefined,
): { readonly ready: boolean; readonly gaps: readonly ResearchContextGap[] } {
  const gaps: ResearchContextGap[] = [];
  if (!ctx) {
    gaps.push({ key: "context", message: "No research context provided." });
    return { ready: false, gaps };
  }
  if (!ctx.strategy) gaps.push({ key: "strategy", message: "Strategy is required." });
  if (!ctx.formulaVersion) gaps.push({ key: "formulaVersion", message: "Formula version is required." });
  if (!ctx.baseRunId) gaps.push({ key: "baseRunId", message: "Base backtest Run ID is required." });
  if (!ctx.parameterSpace || ctx.parameterSpace.length === 0) {
    gaps.push({ key: "parameterSpace", message: "Parameter space is required." });
  }
  if (!ctx.sensitivityCells || ctx.sensitivityCells.length === 0) {
    gaps.push({ key: "sensitivity", message: "Sensitivity output is required." });
  }
  if (!ctx.aggregate) {
    gaps.push({ key: "aggregate", message: "Walk-forward / Monte Carlo / robustness aggregate is required." });
  }
  if (!ctx.from || !ctx.to) gaps.push({ key: "range", message: "Date range is required." });
  if (!ctx.dataHash) gaps.push({ key: "dataHash", message: "Data hash is required." });
  return { ready: gaps.length === 0, gaps };
}

export function assertResearchContext(
  ctx: Partial<ResolvedResearchContext> | null | undefined,
): asserts ctx is ResolvedResearchContext {
  const { ready, gaps } = inspectResearchContext(ctx);
  if (!ready) {
    throw new Error(`INCOMPLETE_RESEARCH_CONTEXT: ${gaps.map((g) => g.key).join(",")}`);
  }
}

// Deterministic signature: the same context always produces the same key.
// Used for cache identity in the optimizer history store.
export function researchContextSignature(ctx: ResolvedResearchContext): string {
  const spaceKey = ctx.parameterSpace
    .map((s) => `${s.name}:${s.min}:${s.max}:${s.step}`)
    .join(",");
  const rrids = Object.keys(ctx.researchRunIds)
    .sort()
    .map((k) => `${k}=${ctx.researchRunIds[k]}`)
    .join(",");
  return [
    ctx.strategy,
    ctx.formulaVersion,
    ctx.baseRunId,
    ctx.provider,
    ctx.instrument,
    ctx.from,
    ctx.to,
    ctx.dataHash,
    spaceKey,
    rrids,
    ctx.costs ?? "",
  ].join("|");
}