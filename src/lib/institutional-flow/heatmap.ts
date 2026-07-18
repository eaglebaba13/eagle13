// Phase 3D — Deterministic option-chain heatmap builder.

import type { OiAnalysis } from "./types";
import type { HeatmapResult, HeatmapCell, CalcAvailability } from "./types";

export function buildHeatmap(oi: OiAnalysis, opts: { atm: number | null; maxPain: number | null }): HeatmapResult {
  const rows = oi.rows;
  if (rows.length === 0) {
    return { cells: [], maxPain: opts.maxPain, atm: opts.atm, availability: "UNAVAILABLE" };
  }
  let maxOi = 0;
  let maxChange = 0;
  const totals = rows.map((r) => {
    const totalOi = (r.callOi ?? 0) + (r.putOi ?? 0);
    const totalChange = (r.callChangeOi ?? 0) + (r.putChangeOi ?? 0);
    maxOi = Math.max(maxOi, totalOi);
    maxChange = Math.max(maxChange, Math.abs(totalChange));
    return { r, totalOi, totalChange };
  });
  const cells: HeatmapCell[] = totals.map(({ r, totalOi, totalChange }) => ({
    strike: r.strike,
    totalOi: r.callOi == null && r.putOi == null ? null : totalOi,
    totalOiChange: r.callChangeOi == null && r.putChangeOi == null ? null : totalChange,
    intensity: maxOi > 0 ? Math.min(1, totalOi / maxOi) : 0,
    changeIntensity: maxChange > 0 ? Math.min(1, Math.abs(totalChange) / maxChange) : 0,
    moneyness: r.moneyness,
    isAtm: r.isAtm,
    isMaxPain: opts.maxPain != null && r.strike === opts.maxPain,
  }));
  const availability: CalcAvailability = oi.availability;
  return { cells, maxPain: opts.maxPain, atm: opts.atm, availability };
}