// Phase 22 · Stage 3 — Deterministic exports for the institutional
// portfolio surfaces (frontier, risk budget, portfolio recommendation,
// scenario comparison, allocation treemap, and full institutional bundle).

import { PORTFOLIO_DISCLAIMER, type PortfolioResearchResult } from "./portfolio-types";
import type { FrontierResult } from "./efficient-frontier";
import type { RiskBudgetResult } from "./risk-budget";
import type { PortfolioRecommendationResult, ScenarioScore } from "./portfolio-recommendation";
import type { ScenarioComparisonResult } from "./scenario-comparison";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function header(extra: readonly string[] = []): string {
  return [`# ${PORTFOLIO_DISCLAIMER}`, ...extra, ""].join("\n");
}

export function buildFrontierCsv(front: FrontierResult): string {
  const cols = ["type", ...front.assetIds.map((id) => `w_${id}`), "expectedReturn", "volatility", "sharpe", "divRatio", "efficient", "dominated"];
  const rows: string[] = [cols.join(",")];
  const emit = (label: string, p: FrontierResult["feasible"][number] | null) => {
    if (!p) return;
    rows.push([label, ...p.weights.map((w) => w.toFixed(6)), p.expectedReturn.toFixed(6), p.volatility.toFixed(6), p.sharpe.toFixed(6), p.diversificationRatio.toFixed(6), p.efficient, p.dominated].map(csvEscape).join(","));
  };
  for (const p of front.feasible) emit("FEASIBLE", p);
  emit("MIN_VARIANCE", front.minVariance);
  emit("MAX_SHARPE", front.maxSharpe);
  emit("MAX_DIVERSIFICATION", front.maxDiversification);
  emit("TARGET_RETURN", front.targetReturnPortfolio);
  emit("TARGET_VOL", front.targetVolPortfolio);
  return header([`# method=${front.method}`, `# combinationsExplored=${front.combinationsExplored}`, `# rejected=${front.rejected}`]) + rows.join("\n") + "\n";
}

export function buildFrontierJson(front: FrontierResult): string {
  return JSON.stringify({ disclaimer: PORTFOLIO_DISCLAIMER, front }, null, 2);
}

export function buildRiskBudgetCsv(rb: RiskBudgetResult): string {
  const rows = ["key,target,actual,gap,breach,suggestion"];
  for (const r of rb.rows) rows.push([r.key, r.target.toFixed(6), r.actual.toFixed(6), r.gap.toFixed(6), r.breach, r.suggestion].map(csvEscape).join(","));
  return header([`# scope=${rb.scope}`, `# tolerance=${rb.tolerance}`, `# compliance=${rb.compliance.toFixed(4)}`]) + rows.join("\n") + "\n";
}

export function buildRecommendationCsv(rec: PortfolioRecommendationResult): string {
  const rows = ["scenarioId,runId,score,confidence,recommendable,reasons,hardGateFailures"];
  const push = (s: ScenarioScore) => rows.push([
    s.scenarioId, s.runId, s.score.toFixed(6), s.confidence.toFixed(6), s.recommendable,
    s.reasons.join(" | "), s.hardGateFailures.join(" | "),
  ].map(csvEscape).join(","));
  for (const s of rec.scored) push(s);
  return header([`# recommendationRunId=${rec.runId}`]) + rows.join("\n") + "\n";
}

export function buildRecommendationJson(rec: PortfolioRecommendationResult): string {
  return JSON.stringify({ disclaimer: rec.disclaimer, recommendation: rec }, null, 2);
}

export function buildScenarioComparisonCsv(cmp: ScenarioComparisonResult): string {
  const cols = ["scenarioId","label","runId","totalReturnPct","annualizedVol","sharpe","sortino","calmar","maxDrawdownPct","cvar95","diversificationRatio","concentrationHhi","ruinProbability","reliability"];
  const rows = [cols.join(",")];
  for (const r of cmp.rows) rows.push(cols.map((c) => csvEscape((r as unknown as Record<string, unknown>)[c])).join(","));
  return header(cmp.warnings.map((w) => `# WARNING ${w}`)) + rows.join("\n") + "\n";
}

export function buildAllocationTreemapCsv(result: PortfolioResearchResult, assets: { id: string; strategy: string; instrument: string; timeframe: string }[]): string {
  const rows = ["strategy,instrument,timeframe,assetId,weight"];
  for (const a of result.allocation.allocations) {
    const meta = assets.find((x) => x.id === a.assetId);
    rows.push([meta?.strategy ?? "", meta?.instrument ?? "", meta?.timeframe ?? "", a.assetId, a.weight.toFixed(6)].map(csvEscape).join(","));
  }
  return header([`# portfolioRunId=${result.runId}`]) + rows.join("\n") + "\n";
}

export type InstitutionalBundle = {
  readonly portfolio: PortfolioResearchResult;
  readonly frontier?: FrontierResult | null;
  readonly riskBudget?: RiskBudgetResult | null;
  readonly recommendation?: PortfolioRecommendationResult | null;
  readonly comparison?: ScenarioComparisonResult | null;
  readonly attachments?: Readonly<Record<string, unknown>>;
};

export function buildInstitutionalBundleJson(bundle: InstitutionalBundle): string {
  return JSON.stringify({
    disclaimer: PORTFOLIO_DISCLAIMER,
    label: "PORTFOLIO RESEARCH ONLY — NOT A LIVE ALLOCATION INSTRUCTION",
    generatedAt: new Date().toISOString(),
    bundle,
  }, null, 2);
}