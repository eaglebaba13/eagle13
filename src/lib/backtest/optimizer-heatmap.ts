// Phase 21.9 · Stage 2 — Heatmap overlay for the parameter surface.
// Pure. Reuses existing sensitivity cells and the optimizer result to
// classify every cell as ACCEPTED / ALTERNATIVE / REJECTED / UNAVAILABLE.

import type {
  ParameterCombination,
  SensitivityCell,
} from "./parameter-sensitivity";
import type { OptimizerResult } from "./explainable-optimizer";

export type HeatmapClass = "ACCEPTED" | "ALTERNATIVE" | "REJECTED" | "UNAVAILABLE";

export const HEATMAP_COLORS: Record<HeatmapClass, string> = Object.freeze({
  ACCEPTED: "#4fd18a",
  ALTERNATIVE: "#f0a742",
  REJECTED: "#f0656f",
  UNAVAILABLE: "#8a8a8a",
});

export type HeatmapCell = {
  readonly params: ParameterCombination;
  readonly classification: HeatmapClass;
  readonly color: string;
  readonly note?: string;
};

function sameParams(a: ParameterCombination, b: ParameterCombination): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k]; const vb = b[k];
    if (va === undefined || vb === undefined) return false;
    if (Math.abs(va - vb) > 1e-6) return false;
  }
  return true;
}

export function buildHeatmapOverlay(
  cells: readonly SensitivityCell[],
  result: OptimizerResult,
): readonly HeatmapCell[] {
  const recommended = result.recommendedRegion;
  const acceptedCenters = recommended ? [recommended.center] : [];
  const altCenters = result.alternatives.map((a) => a.center);
  const rejectedCenters = result.rejectedRegions.map((r) => r.center);

  const isAccepted = (p: ParameterCombination): boolean =>
    acceptedCenters.some((c) => sameParams(c, p)) ||
    inSafeRange(p, recommended);
  const isAlt = (p: ParameterCombination): boolean =>
    altCenters.some((c) => sameParams(c, p));
  const isRejected = (p: ParameterCombination): boolean =>
    rejectedCenters.some((c) => sameParams(c, p));

  return cells.map((c) => {
    if (!c.metrics) {
      return { params: c.params, classification: "UNAVAILABLE", color: HEATMAP_COLORS.UNAVAILABLE, note: c.reason };
    }
    if (isAccepted(c.params)) {
      return { params: c.params, classification: "ACCEPTED", color: HEATMAP_COLORS.ACCEPTED };
    }
    if (isAlt(c.params)) {
      return { params: c.params, classification: "ALTERNATIVE", color: HEATMAP_COLORS.ALTERNATIVE };
    }
    if (isRejected(c.params)) {
      return { params: c.params, classification: "REJECTED", color: HEATMAP_COLORS.REJECTED };
    }
    return { params: c.params, classification: "REJECTED", color: HEATMAP_COLORS.REJECTED };
  });
}

function inSafeRange(
  p: ParameterCombination,
  region: OptimizerResult["recommendedRegion"],
): boolean {
  if (!region) return false;
  for (const k of Object.keys(region.safeRange)) {
    const v = p[k];
    const r = region.safeRange[k];
    if (v === undefined || !r) return false;
    if (v < r.min - 1e-9 || v > r.max + 1e-9) return false;
  }
  return true;
}