// Phase 22 · Stage 2 — Deterministic before/after / A-vs-B comparison of two
// portfolio research results. Does NOT recompute either side.

import type { PortfolioResearchResult } from "./portfolio-types";

export type MetricDelta = {
  readonly metric: string;
  readonly a: number | null;
  readonly b: number | null;
  readonly delta: number | null;
  readonly pctDelta: number | null;
};

export type AllocationDelta = {
  readonly assetId: string;
  readonly a: number;
  readonly b: number;
  readonly delta: number;
};

export type PortfolioComparison = {
  readonly aRunId: string;
  readonly bRunId: string;
  readonly metrics: readonly MetricDelta[];
  readonly allocations: readonly AllocationDelta[];
  readonly warnings: readonly string[];
};

function delta(a: number | null, b: number | null): { delta: number | null; pct: number | null } {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return { delta: null, pct: null };
  const d = b - a;
  const pct = a !== 0 ? d / Math.abs(a) : null;
  return { delta: d, pct };
}

function metricDelta(name: string, a: number | null, b: number | null): MetricDelta {
  const { delta: d, pct } = delta(a, b);
  return { metric: name, a, b, delta: d, pctDelta: pct };
}

export function compareResults(a: PortfolioResearchResult, b: PortfolioResearchResult): PortfolioComparison {
  const warnings: string[] = [];
  if (a.runId === b.runId) warnings.push("IDENTICAL_RUN_ID");
  if (a.config.method !== b.config.method) warnings.push(`ALLOCATION_METHOD_DIFF:${a.config.method}->${b.config.method}`);
  if (a.config.sizingPolicy.method !== b.config.sizingPolicy.method) warnings.push(`SIZING_METHOD_DIFF:${a.config.sizingPolicy.method}->${b.config.sizingPolicy.method}`);

  const M = (r: PortfolioResearchResult) => r.metrics;
  const metrics: MetricDelta[] = [
    metricDelta("netPnl", M(a).netPnl, M(b).netPnl),
    metricDelta("totalReturnPct", M(a).totalReturnPct, M(b).totalReturnPct),
    metricDelta("sharpe", M(a).sharpe, M(b).sharpe),
    metricDelta("sortino", M(a).sortino, M(b).sortino),
    metricDelta("calmar", M(a).calmar, M(b).calmar),
    metricDelta("maxDrawdown", M(a).maxDrawdown, M(b).maxDrawdown),
    metricDelta("maxDrawdownPct", M(a).maxDrawdownPct, M(b).maxDrawdownPct),
    metricDelta("var95", M(a).var95, M(b).var95),
    metricDelta("cvar95", M(a).cvar95, M(b).cvar95),
    metricDelta("diversificationRatio", M(a).diversificationRatio, M(b).diversificationRatio),
  ];

  const aMap = new Map(a.allocation.allocations.map((x) => [x.assetId, x.weight]));
  const bMap = new Map(b.allocation.allocations.map((x) => [x.assetId, x.weight]));
  const ids = new Set<string>([...aMap.keys(), ...bMap.keys()]);
  const allocations: AllocationDelta[] = [...ids].sort().map((id) => {
    const wa = aMap.get(id) ?? 0;
    const wb = bMap.get(id) ?? 0;
    return { assetId: id, a: wa, b: wb, delta: wb - wa };
  });

  return { aRunId: a.runId, bRunId: b.runId, metrics, allocations, warnings };
}