// Phase 22 · Stage 1 — Portfolio research exports. Every export carries the
// portfolio Run ID, candidate Run IDs, formula versions, and mandatory
// research-only disclaimer.

import { PORTFOLIO_DISCLAIMER, type PortfolioResearchResult } from "./portfolio-types";
import type { PortfolioMcResult } from "./portfolio-monte-carlo";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function header(result: PortfolioResearchResult): string {
  return [
    `# ${PORTFOLIO_DISCLAIMER}`,
    `# portfolioRunId=${result.runId}`,
    `# candidateRunIds=${result.candidateRunIds.join("|")}`,
    `# allocationMethod=${result.config.method}`,
    `# sizingMethod=${result.config.sizingPolicy.method}`,
    `# rebalance=${result.config.rebalancePolicy}`,
    `# generatedAt=${result.generatedAt}`,
    "",
  ].join("\n");
}

export function buildPortfolioSummaryCsv(result: PortfolioResearchResult): string {
  const m = result.metrics;
  const rows = [
    ["metric", "value"],
    ["totalReturnPct", m.totalReturnPct],
    ["netPnl", m.netPnl],
    ["cagr", m.cagr ?? ""],
    ["annualizedVol", m.annualizedVol],
    ["sharpe", m.sharpe],
    ["sortino", m.sortino],
    ["calmar", m.calmar],
    ["profitFactor", m.profitFactor === Infinity ? "Inf" : m.profitFactor],
    ["expectancy", m.expectancy],
    ["maxDrawdown", m.maxDrawdown],
    ["maxDrawdownPct", m.maxDrawdownPct],
    ["ulcerIndex", m.ulcerIndex],
    ["var95", m.var95],
    ["cvar95", m.cvar95],
    ["exposurePct", m.exposurePct],
    ["strategyConcentration", m.strategyConcentration],
    ["instrumentConcentration", m.instrumentConcentration],
    ["diversificationRatio", m.diversificationRatio],
  ];
  return header(result) + rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

export function buildAllocationCsv(result: PortfolioResearchResult): string {
  const rows = [["assetId", "weight", "rationale"]];
  for (const a of result.allocation.allocations) rows.push([a.assetId, String(a.weight), a.rationale]);
  return header(result) + rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

export function buildRiskContributionCsv(result: PortfolioResearchResult): string {
  const rows = [["assetId", "capitalPct", "volPct", "drawdownPct", "lossPct", "tailPct", "correlationPct"]];
  for (const r of result.riskContributions) {
    rows.push([r.assetId, String(r.capitalPct), String(r.volPct), String(r.drawdownPct), String(r.lossPct), String(r.tailPct), String(r.correlationPct)]);
  }
  return header(result) + rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

export function buildCorrelationCsv(result: PortfolioResearchResult): string {
  const ids = result.correlations.assetIds;
  const rows: string[][] = [["", ...ids]];
  for (let i = 0; i < ids.length; i++) {
    rows.push([ids[i], ...result.correlations.returns[i].map(String)]);
  }
  return header(result) + rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

export function buildStressTestCsv(result: PortfolioResearchResult, mc: PortfolioMcResult): string {
  const rows = [
    ["metric", "value"],
    ["mode", mc.mode],
    ["simulations", String(mc.simulations)],
    ["finalEquity.p5", String(mc.finalEquity.p5)],
    ["finalEquity.p50", String(mc.finalEquity.p50)],
    ["finalEquity.p95", String(mc.finalEquity.p95)],
    ["maxDrawdown.p5", String(mc.maxDrawdown.p5)],
    ["maxDrawdown.p50", String(mc.maxDrawdown.p50)],
    ["maxDrawdown.p95", String(mc.maxDrawdown.p95)],
    ["probabilityOfRuin", String(mc.probabilityOfRuin)],
    ["worstCase", String(mc.worstCase)],
  ];
  return header(result) + rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

export function buildPortfolioJson(result: PortfolioResearchResult): string {
  return JSON.stringify(
    { disclaimer: PORTFOLIO_DISCLAIMER, result },
    null,
    2,
  );
}

export type PortfolioPreset = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly config: PortfolioResearchResult["config"];
  readonly candidateRunIds: readonly string[];
  readonly portfolioRunId: string;
};

export function buildPresetJson(preset: PortfolioPreset): string {
  return JSON.stringify({ disclaimer: PORTFOLIO_DISCLAIMER, preset }, null, 2);
}