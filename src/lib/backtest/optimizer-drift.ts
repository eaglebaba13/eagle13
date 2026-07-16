// Phase 21.9 · Stage 2 — Parameter drift classification.
// Compares "current" (production-in-use) parameters against the optimizer's
// recommended region and produces a research-only advisory. Never mutates
// production settings.

import type { ParameterCombination, ParameterSpec } from "./parameter-sensitivity";
import type { SafeRange } from "./explainable-optimizer";

export type DriftLevel = "STABLE" | "SMALL_DRIFT" | "LARGE_DRIFT" | "UNSAFE_DRIFT";

export type ParameterDriftEntry = {
  readonly name: string;
  readonly current: number;
  readonly recommended: number;
  readonly safeMin: number;
  readonly safeMax: number;
  readonly step: number;
  readonly deltaSteps: number;
  readonly withinSafeRange: boolean;
  readonly level: DriftLevel;
};

export type ParameterDriftReport = {
  readonly overall: DriftLevel;
  readonly entries: readonly ParameterDriftEntry[];
  readonly summary: string;
};

const RANK: Record<DriftLevel, number> = {
  STABLE: 0,
  SMALL_DRIFT: 1,
  LARGE_DRIFT: 2,
  UNSAFE_DRIFT: 3,
};

function classifyEntry(
  deltaSteps: number,
  withinSafeRange: boolean,
): DriftLevel {
  if (!withinSafeRange) return "UNSAFE_DRIFT";
  const d = Math.abs(deltaSteps);
  if (d < 0.5) return "STABLE";
  if (d <= 1.0001) return "SMALL_DRIFT";
  return "LARGE_DRIFT";
}

export function computeParameterDrift(
  current: ParameterCombination,
  recommended: ParameterCombination,
  space: readonly ParameterSpec[],
  safeRange: SafeRange,
): ParameterDriftReport {
  const entries: ParameterDriftEntry[] = space.map((spec) => {
    const c = current[spec.name] ?? 0;
    const r = recommended[spec.name] ?? 0;
    const range = safeRange[spec.name] ?? { min: r, max: r };
    const step = Math.max(1e-9, spec.step);
    const deltaSteps = (r - c) / step;
    const withinSafeRange = c >= range.min - 1e-9 && c <= range.max + 1e-9;
    return {
      name: spec.name,
      current: c,
      recommended: r,
      safeMin: range.min,
      safeMax: range.max,
      step: spec.step,
      deltaSteps,
      withinSafeRange,
      level: classifyEntry(deltaSteps, withinSafeRange),
    };
  });
  let overall: DriftLevel = "STABLE";
  for (const e of entries) if (RANK[e.level] > RANK[overall]) overall = e.level;
  const summary =
    overall === "STABLE" ? "All current parameters sit inside the recommended safe range."
    : overall === "SMALL_DRIFT" ? "Current parameters are close to the recommendation (≤ 1 step)."
    : overall === "LARGE_DRIFT" ? "Current parameters differ from the recommendation by more than 1 step."
    : "One or more current parameters fall outside the recommended safe range.";
  return { overall, entries, summary };
}