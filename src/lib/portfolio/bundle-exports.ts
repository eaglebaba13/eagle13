// Phase 22 · Stage 2 — Full research bundle export. Read-only aggregation of
// already-computed research outputs. Does NOT recompute anything and does
// NOT modify any existing per-module export.

import { PORTFOLIO_DISCLAIMER, type PortfolioResearchResult } from "./portfolio-types";
import type { PortfolioMcResult } from "./portfolio-monte-carlo";
import type { PortfolioHistoryEntry } from "./portfolio-history";
import type { PortfolioComparison } from "./preset-comparison";
import type { CandidateRow } from "./candidate-discovery";

export type ResearchBundle = {
  readonly portfolio: PortfolioResearchResult;
  readonly candidates: readonly CandidateRow[];
  readonly monteCarlo?: PortfolioMcResult | null;
  readonly history?: readonly PortfolioHistoryEntry[];
  readonly comparison?: PortfolioComparison | null;
  readonly attachments?: Readonly<Record<string, unknown>>; // optimizer / recommendation / validation / sensitivity JSON refs
};

export function buildResearchBundleJson(bundle: ResearchBundle): string {
  return JSON.stringify(
    {
      disclaimer: PORTFOLIO_DISCLAIMER,
      generatedAt: new Date().toISOString(),
      bundle,
    },
    null,
    2,
  );
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCandidatesCsv(rows: readonly CandidateRow[], portfolioRunId: string): string {
  const header = [
    `# ${PORTFOLIO_DISCLAIMER}`,
    `# portfolioRunId=${portfolioRunId}`,
    "",
  ].join("\n");
  const cols = [
    "assetId","runId","strategy","formulaVersion","instrument","timeframe","from","to",
    "trades","winRate","profitFactor","expectancy","maxDrawdown","netPnl",
    "robustness","recommendation","optimizerStatus","reliability","selectable","blockReason",
  ];
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => csvEscape((r as unknown as Record<string, unknown>)[c])).join(","));
  }
  return header + lines.join("\n") + "\n";
}

export function buildComparisonCsv(cmp: PortfolioComparison): string {
  const header = [
    `# ${PORTFOLIO_DISCLAIMER}`,
    `# a=${cmp.aRunId}`,
    `# b=${cmp.bRunId}`,
    "",
  ].join("\n");
  const lines = ["metric,a,b,delta,pctDelta"];
  for (const m of cmp.metrics) {
    lines.push([m.metric, csvEscape(m.a), csvEscape(m.b), csvEscape(m.delta), csvEscape(m.pctDelta)].join(","));
  }
  lines.push("");
  lines.push("assetId,a,b,delta");
  for (const a of cmp.allocations) {
    lines.push([a.assetId, String(a.a), String(a.b), String(a.delta)].join(","));
  }
  return header + lines.join("\n") + "\n";
}

export function buildHistoryCsv(entries: readonly PortfolioHistoryEntry[]): string {
  const header = [`# ${PORTFOLIO_DISCLAIMER}`, ""].join("\n");
  const cols = ["id","recordedAt","runId","method","sizingMethod","rebalance","netPnl","sharpe","maxDrawdownPct","note"];
  const lines = [cols.join(",")];
  for (const e of entries) {
    lines.push([
      e.id,
      e.recordedAt,
      e.result.runId,
      e.result.config.method,
      e.result.config.sizingPolicy.method,
      e.result.config.rebalancePolicy,
      String(e.result.metrics.netPnl),
      String(e.result.metrics.sharpe),
      String(e.result.metrics.maxDrawdownPct),
      csvEscape(e.note),
    ].join(","));
  }
  return header + lines.join("\n") + "\n";
}