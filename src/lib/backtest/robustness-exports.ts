// Phase 21.6 · Stage 1 — Robustness / Monte Carlo / Sensitivity exports.
// Structured CSV + JSON with full provenance. Pure functions; no I/O.

import type { MonteCarloResult } from "./monte-carlo";
import type {
  SensitivityCell,
  SensitivitySurface,
} from "./parameter-sensitivity";
import type { RobustnessResult } from "./robustness";

export type ExportProvenance = {
  readonly researchRunId: string;
  readonly monteCarloRunId?: string;
  readonly sensitivityRunId?: string;
  readonly robustnessRunId?: string;
  readonly instrument: string;
  readonly from: string;
  readonly to: string;
  readonly generatedAt: string;
};

const HEADER = "# RESEARCH ANALYSIS — NOT A LIVE TRADE RECOMMENDATION";

export function buildMonteCarloCsv(mc: MonteCarloResult, prov: ExportProvenance): string {
  const lines: string[] = [
    HEADER,
    `# researchRunId=${prov.researchRunId} monteCarloRunId=${prov.monteCarloRunId ?? ""}`,
    `# instrument=${prov.instrument} range=${prov.from}→${prov.to} generatedAt=${prov.generatedAt}`,
    `# sampling=${mc.samplingMode} seed=${mc.seed} sims=${mc.simulations} capital=${mc.startingCapital}`,
    `# ruinFormula=${mc.ruinFormula}`,
    "metric,p5,p25,p50,p75,p95",
    `finalEquity,${mc.finalEquity.p5},${mc.finalEquity.p25},${mc.finalEquity.p50},${mc.finalEquity.p75},${mc.finalEquity.p95}`,
    `maxDrawdown,${mc.maxDrawdown.p5},${mc.maxDrawdown.p25},${mc.maxDrawdown.p50},${mc.maxDrawdown.p75},${mc.maxDrawdown.p95}`,
    `profitFactor,${mc.profitFactor.p5},${mc.profitFactor.p25},${mc.profitFactor.p50},${mc.profitFactor.p75},${mc.profitFactor.p95}`,
    `expectancy,${mc.expectancy.p5},${mc.expectancy.p25},${mc.expectancy.p50},${mc.expectancy.p75},${mc.expectancy.p95}`,
    `# probabilityOfLoss=${mc.probabilityOfLoss}`,
    `# probabilityOfRuin=${mc.probabilityOfRuin}`,
  ];
  return lines.join("\n");
}

export function buildMonteCarloJson(mc: MonteCarloResult, prov: ExportProvenance): string {
  return JSON.stringify({ version: "MONTE_CARLO_V1", provenance: prov, result: mc }, null, 2);
}

export function buildSensitivityCsv(cells: readonly SensitivityCell[], surface: SensitivitySurface, prov: ExportProvenance): string {
  const paramKeys = cells[0] ? Object.keys(cells[0].params) : [];
  const lines: string[] = [
    HEADER,
    `# researchRunId=${prov.researchRunId} sensitivityRunId=${prov.sensitivityRunId ?? ""}`,
    `# classification=${surface.classification} primaryMetric=${String(surface.primaryMetric)} mean=${surface.meanValue} stddev=${surface.stdDev}`,
    `# reason=${surface.reason}`,
    [...paramKeys, "trades", "winRate", "profitFactor", "expectancy", "netPnl", "maxDrawdown", "recoveryFactor", "stabilityScore", "oosScore", "mcMedian", "mcP5", "reason"].join(","),
  ];
  for (const c of cells) {
    const row: (string | number)[] = paramKeys.map((k) => c.params[k]);
    if (c.metrics) {
      const mtx = c.metrics;
      row.push(mtx.trades, mtx.winRate, Number.isFinite(mtx.profitFactor) ? mtx.profitFactor : "Infinity", mtx.expectancy, mtx.netPnl, mtx.maxDrawdown, mtx.recoveryFactor, mtx.stabilityScore, mtx.oosScore, mtx.monteCarloMedian, mtx.monteCarloP5, "");
    } else {
      row.push("", "", "", "", "", "", "", "", "", "", "", c.reason ?? "INSUFFICIENT_DATA");
    }
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

export function buildSensitivityJson(cells: readonly SensitivityCell[], surface: SensitivitySurface, prov: ExportProvenance): string {
  return JSON.stringify({ version: "SENSITIVITY_V1", provenance: prov, surface, cells }, null, 2);
}

export function buildRobustnessCsv(r: RobustnessResult, prov: ExportProvenance): string {
  const lines: string[] = [
    HEADER,
    `# researchRunId=${prov.researchRunId} robustnessRunId=${prov.robustnessRunId ?? ""}`,
    `# status=${r.status} total=${r.total} reason=${r.reason}`,
    "factor,weight,value,score,formula",
    ...r.factors.map((f) => [f.key, f.weight, f.value, f.score, `"${f.formula.replace(/"/g, "'")}"`].join(",")),
  ];
  return lines.join("\n");
}

export function buildRobustnessJson(r: RobustnessResult, prov: ExportProvenance): string {
  return JSON.stringify({ version: "ROBUSTNESS_V1", provenance: prov, result: r }, null, 2);
}
