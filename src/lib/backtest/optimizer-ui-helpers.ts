// Phase 21.9 · Stage 2A — Pure UI helpers for the Optimizer section.
// Deterministic, side-effect-free adapters that translate research-context
// state and Stage-2 outputs into shapes the React UI can render directly.
// Nothing here executes engines or mutates production configuration.

import type { ResolvedResearchContext, ResearchContextGap } from "./research-context";
import { inspectResearchContext } from "./research-context";
import type { HeatmapCell } from "./optimizer-heatmap";
import type { ParameterDriftReport, DriftLevel } from "./optimizer-drift";

export type ContextRowStatus = "READY" | "MISSING";

export type ContextRow = {
  readonly key: string;
  readonly label: string;
  readonly status: ContextRowStatus;
  readonly detail: string;
};

const ROWS: readonly { key: string; label: string; get: (c: ResolvedResearchContext) => string | number | null | undefined }[] = [
  { key: "strategy", label: "Strategy", get: (c) => c.strategy },
  { key: "formulaVersion", label: "Formula Version", get: (c) => c.formulaVersion },
  { key: "baseRunId", label: "Base Run ID", get: (c) => c.baseRunId },
  { key: "parameterSpace", label: "Parameter Space", get: (c) => c.parameterSpace.length },
  { key: "sensitivity", label: "Sensitivity Cells", get: (c) => c.sensitivityCells.length },
  { key: "walkForward", label: "Walk-Forward Windows", get: (c) => c.aggregate?.walkForwardWindows },
  { key: "monteCarlo", label: "Monte Carlo Simulations", get: (c) => c.aggregate?.monteCarloSimulations },
  { key: "robustness", label: "Robustness Status", get: (c) => c.aggregate?.robustnessStatus },
  { key: "recValidation", label: "Recommendation Validation", get: (c) => c.aggregate?.calibrationRating },
  { key: "crossAsset", label: "Cross-Asset Consistency", get: (c) => c.aggregate?.crossAssetConsistency },
  { key: "dataQuality", label: "Data Quality", get: (c) => c.aggregate?.dataQuality },
  { key: "range", label: "Date Range", get: (c) => `${c.from} → ${c.to}` },
  { key: "dataHash", label: "Data Hash", get: (c) => c.dataHash },
  { key: "provider", label: "Provider", get: (c) => c.provider },
];

export function buildContextRows(
  ctx: Partial<ResolvedResearchContext> | null | undefined,
): { readonly ready: boolean; readonly gaps: readonly ResearchContextGap[]; readonly rows: readonly ContextRow[] } {
  const { ready, gaps } = inspectResearchContext(ctx);
  const rows: ContextRow[] = ROWS.map((r) => {
    const raw = ctx ? r.get(ctx as ResolvedResearchContext) : undefined;
    const present = raw !== undefined && raw !== null && raw !== "" && !(typeof raw === "number" && !Number.isFinite(raw));
    return {
      key: r.key,
      label: r.label,
      status: present ? "READY" : "MISSING",
      detail: present ? String(raw) : "—",
    };
  });
  return { ready, gaps, rows };
}

// Group a flat list of heatmap cells into a 2D matrix along two parameter
// axes. When more than two parameters exist we collapse extras by taking the
// first sighted combination. Returns null when we cannot build a stable grid.
export type HeatmapMatrix = {
  readonly xKey: string;
  readonly yKey: string;
  readonly xValues: readonly number[];
  readonly yValues: readonly number[];
  readonly cells: ReadonlyArray<ReadonlyArray<HeatmapCell | null>>;
};

export function buildHeatmapMatrix(cells: readonly HeatmapCell[]): HeatmapMatrix | null {
  if (cells.length === 0) return null;
  const keys = Object.keys(cells[0].params);
  if (keys.length === 0) return null;
  const xKey = keys[0];
  const yKey = keys[1] ?? keys[0];
  const xSet = new Set<number>();
  const ySet = new Set<number>();
  for (const c of cells) {
    const x = c.params[xKey];
    const y = c.params[yKey];
    if (typeof x === "number") xSet.add(x);
    if (typeof y === "number") ySet.add(y);
  }
  const xValues = [...xSet].sort((a, b) => a - b);
  const yValues = [...ySet].sort((a, b) => a - b);
  const matrix: (HeatmapCell | null)[][] = yValues.map(() => xValues.map(() => null));
  for (const c of cells) {
    const xi = xValues.indexOf(c.params[xKey]);
    const yi = yValues.indexOf(c.params[yKey]);
    if (xi >= 0 && yi >= 0 && !matrix[yi][xi]) matrix[yi][xi] = c;
  }
  return { xKey, yKey, xValues, yValues, cells: matrix };
}

export const DRIFT_LABELS: Record<DriftLevel, string> = Object.freeze({
  STABLE: "STABLE",
  SMALL_DRIFT: "SMALL DRIFT",
  LARGE_DRIFT: "LARGE DRIFT",
  UNSAFE_DRIFT: "UNSAFE DRIFT",
});

export const DRIFT_COLORS: Record<DriftLevel, string> = Object.freeze({
  STABLE: "#4fd18a",
  SMALL_DRIFT: "#4faaf0",
  LARGE_DRIFT: "#f0a742",
  UNSAFE_DRIFT: "#f0656f",
});

export function hasUnsafeDrift(report: ParameterDriftReport | null | undefined): boolean {
  return !!report && report.overall === "UNSAFE_DRIFT";
}

export type DataHashMismatch = {
  readonly mismatch: boolean;
  readonly reason: string | null;
};

export function checkDataHashMismatch(
  a: { readonly dataHash?: string; readonly from?: string; readonly to?: string; readonly instrument?: string } | null | undefined,
  b: { readonly dataHash?: string; readonly from?: string; readonly to?: string; readonly instrument?: string } | null | undefined,
): DataHashMismatch {
  if (!a || !b) return { mismatch: false, reason: null };
  if (a.dataHash && b.dataHash && a.dataHash !== b.dataHash) {
    return { mismatch: true, reason: `data hash differs (${a.dataHash} vs ${b.dataHash})` };
  }
  if (a.from !== b.from || a.to !== b.to) {
    return { mismatch: true, reason: `date range differs (${a.from}→${a.to} vs ${b.from}→${b.to})` };
  }
  if (a.instrument && b.instrument && a.instrument !== b.instrument) {
    return { mismatch: true, reason: `instrument differs (${a.instrument} vs ${b.instrument})` };
  }
  return { mismatch: false, reason: null };
}

export const OPTIMIZER_UI_MARKER = "OPTIMIZER_UI_V1" as const;