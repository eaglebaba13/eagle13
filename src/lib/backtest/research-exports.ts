// Phase 21.5 · Stage 1 — Research CSV / JSON exporters.

import type {
  ResearchComparison,
  ResearchSummary,
  StrategyResearchRow,
} from "./research-comparison";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function buildComparisonMatrixCsv(c: ResearchComparison): string {
  const header = [
    "strategy",
    "formula",
    "trainingPF",
    "validationPF",
    "pfDegradationPct",
    "trainingWR",
    "validationWR",
    "wrDegradationPct",
    "netPnlValidation",
    "drawdownValidation",
    "stabilityScore",
    "status",
  ];
  const rows = c.rows.map((r) => [
    r.strategy,
    r.formula,
    Number.isFinite(r.training.profitFactor) ? r.training.profitFactor : "Infinity",
    Number.isFinite(r.validation.profitFactor) ? r.validation.profitFactor : "Infinity",
    Number.isFinite(r.degradation.profitFactor) ? r.degradation.profitFactor : "Infinity",
    r.training.winRate,
    r.validation.winRate,
    Number.isFinite(r.degradation.winRate) ? r.degradation.winRate : "Infinity",
    r.validation.netPnl,
    r.validation.drawdown,
    r.stability.score,
    r.status,
  ]);
  return csv([header, ...rows]);
}

export type ResearchJsonPayload = {
  version: "RESEARCH_V1";
  runId: string;
  comparison: ResearchComparison;
  summary: ResearchSummary;
};

export function buildResearchJson(p: ResearchJsonPayload): string {
  return JSON.stringify(p, null, 2);
}

export function pickHeadline(row: StrategyResearchRow): string {
  return `${row.strategy} · ${row.status} · stability ${row.stability.score}`;
}