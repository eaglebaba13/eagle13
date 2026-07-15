// Phase 21.6 · Stage 4 — Sensitivity + research bundle exports.
//
// Pure serializers. Never mutate cells or the source payload.

import type { SensitivityCell, SensitivitySurface } from "./parameter-sensitivity";
import type { ResearchDataContext } from "./research-payload";

export type SensitivityExportProvenance = {
  readonly researchRunId: string;
  readonly baseRunId: string;
  readonly sensitivityRunId: string;
  readonly strategy: string;
  readonly formulaVersion: string;
  readonly provider: string;
  readonly dataHash: string;
  readonly requestedRange: { readonly from: string; readonly to: string };
  readonly actualRange: { readonly from: string; readonly to: string };
  readonly timeframe: string;
  readonly timezone: string;
  readonly costs: unknown;
  readonly grid: readonly {
    readonly name: string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
  }[];
  readonly normalizeWeights: boolean;
  readonly includeMonteCarlo: boolean;
  readonly counters: Readonly<Record<string, number>>;
  readonly dataQuality: unknown;
  readonly classification: string;
  readonly partial: boolean;
  readonly generatedAt: string;
};

const DISCLAIMER = "# RESEARCH ANALYSIS — NOT A LIVE TRADE RECOMMENDATION";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function provenanceHeaderLines(p: SensitivityExportProvenance): string[] {
  return [
    DISCLAIMER,
    `# researchRunId=${p.researchRunId}`,
    `# baseRunId=${p.baseRunId}`,
    `# sensitivityRunId=${p.sensitivityRunId}`,
    `# strategy=${p.strategy} formula=${p.formulaVersion}`,
    `# provider=${p.provider} dataHash=${p.dataHash} tf=${p.timeframe} tz=${p.timezone}`,
    `# requestedRange=${p.requestedRange.from}→${p.requestedRange.to} actualRange=${p.actualRange.from}→${p.actualRange.to}`,
    `# grid=${p.grid.map((g) => `${g.name}:${g.min}:${g.max}:${g.step}`).join(",")}`,
    `# normalize=${p.normalizeWeights} monteCarlo=${p.includeMonteCarlo} classification=${p.classification} partial=${p.partial}`,
    `# counters=${Object.entries(p.counters).map(([k, v]) => `${k}=${v}`).join(",")}`,
    `# generatedAt=${p.generatedAt}`,
  ];
}

export function buildSensitivityCellsCsv(
  cells: readonly SensitivityCell[],
  provenance: SensitivityExportProvenance,
): string {
  const paramNames = provenance.grid.map((g) => g.name);
  const header = [
    ...paramNames,
    "trades",
    "winRate",
    "profitFactor",
    "expectancy",
    "netPnl",
    "maxDrawdown",
    "recoveryFactor",
    "stabilityScore",
    "oosScore",
    "monteCarloP5",
    "reason",
  ];
  const rows: string[] = provenanceHeaderLines(provenance);
  rows.push(header.join(","));
  for (const c of cells) {
    const paramVals = paramNames.map((n) => csvCell(c.params[n]));
    if (!c.metrics) {
      rows.push(
        [
          ...paramVals,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          csvCell(c.reason ?? "INSUFFICIENT_DATA"),
        ].join(","),
      );
      continue;
    }
    const m = c.metrics;
    rows.push(
      [
        ...paramVals,
        m.trades,
        m.winRate,
        Number.isFinite(m.profitFactor) ? m.profitFactor : "Infinity",
        m.expectancy,
        m.netPnl,
        m.maxDrawdown,
        Number.isFinite(m.recoveryFactor) ? m.recoveryFactor : "Infinity",
        m.stabilityScore,
        m.oosScore,
        m.monteCarloP5,
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return rows.join("\n");
}

export function buildSensitivityMatrixCsv(
  cells: readonly SensitivityCell[],
  provenance: SensitivityExportProvenance,
  metric: "profitFactor" | "expectancy" | "netPnl" | "maxDrawdown" = "expectancy",
): string {
  const grid = provenance.grid;
  const rows: string[] = provenanceHeaderLines(provenance);
  rows.push(`# matrixMetric=${metric}`);
  if (grid.length === 1) {
    const name = grid[0].name;
    rows.push([name, metric].join(","));
    for (const c of cells) {
      rows.push(
        [csvCell(c.params[name]), c.metrics ? csvCell(c.metrics[metric]) : ""].join(","),
      );
    }
    return rows.join("\n");
  }
  if (grid.length !== 2) return rows.join("\n");
  const [ax, ay] = grid;
  const xs = new Set<number>();
  const ys = new Set<number>();
  const byKey = new Map<string, SensitivityCell>();
  for (const c of cells) {
    const xv = c.params[ax.name];
    const yv = c.params[ay.name];
    xs.add(xv);
    ys.add(yv);
    byKey.set(`${xv}|${yv}`, c);
  }
  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);
  rows.push([`${ay.name}\\${ax.name}`, ...sortedX.map(String)].join(","));
  for (const y of sortedY) {
    const row: string[] = [String(y)];
    for (const x of sortedX) {
      const c = byKey.get(`${x}|${y}`);
      row.push(c && c.metrics ? csvCell(c.metrics[metric]) : "");
    }
    rows.push(row.join(","));
  }
  return rows.join("\n");
}

export function buildSensitivityJson(
  cells: readonly SensitivityCell[],
  surface: SensitivitySurface | null,
  provenance: SensitivityExportProvenance,
): string {
  return JSON.stringify(
    {
      version: "SENSITIVITY_V1",
      disclaimer: DISCLAIMER.replace(/^# /, ""),
      provenance,
      surface,
      cells,
    },
    null,
    2,
  );
}

export type ResearchBundleInput = {
  readonly context: Pick<
    ResearchDataContext,
    | "instrument"
    | "timeframe"
    | "provider"
    | "timezone"
    | "requestedRange"
    | "actualRange"
    | "dataHash"
    | "dataQuality"
    | "baseRunId"
    | "costs"
  >;
  readonly researchRunId: string;
  readonly sensitivity?: {
    readonly runId: string;
    readonly cells: readonly SensitivityCell[];
    readonly surface: SensitivitySurface | null;
    readonly grid: readonly { name: string; min: number; max: number; step: number }[];
    readonly partial: boolean;
    readonly counters: Readonly<Record<string, number>>;
  };
  readonly monteCarlo?: unknown;
  readonly robustness?: unknown;
  readonly walkForward?: unknown;
};

export function buildResearchBundleJson(input: ResearchBundleInput): string {
  return JSON.stringify(
    {
      version: "RESEARCH_BUNDLE_V1",
      disclaimer: DISCLAIMER.replace(/^# /, ""),
      generatedAt: new Date().toISOString(),
      researchRunId: input.researchRunId,
      context: input.context,
      sensitivity: input.sensitivity ?? null,
      monteCarlo: input.monteCarlo ?? null,
      robustness: input.robustness ?? null,
      walkForward: input.walkForward ?? null,
    },
    null,
    2,
  );
}

export const SENSITIVITY_EXPORTS_MARKER = "SENSITIVITY_EXPORTS_V1";