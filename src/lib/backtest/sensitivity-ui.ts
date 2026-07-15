// Phase 21.6 · Stage 3 — Pure UI helpers for the Research sensitivity sub-tab.
// Owns only validation / grid estimation / typed error codes. All heavy
// execution lives in `sensitivity-execution.ts`. Nothing here mutates any
// production default and no engine is imported.

import type { ParameterSpec } from "./parameter-sensitivity";

export const RESEARCH_UI_MAX_CELLS = 100;
export const RESEARCH_UI_MAX_VALUES_PER_AXIS = 10;

export type SensitivityUiErrorCode =
  | "RESEARCH_PAYLOAD_MISSING"
  | "DATA_RANGE_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "DATA_QUALITY_FAILURE"
  | "INVALID_PARAMETER_GRID"
  | "GRID_TOO_LARGE"
  | "INSUFFICIENT_DATA"
  | "RUN_CANCELLED"
  | "DATA_LEAKAGE_ERROR"
  | "WALK_FORWARD_LEAKAGE_ERROR";

/** Deterministic value count for a single axis. Excludes empty / invalid axes. */
export function axisValueCount(spec: ParameterSpec): number {
  if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max) || !Number.isFinite(spec.step)) return 0;
  if (spec.step <= 0 || spec.max < spec.min) return 0;
  return Math.floor((spec.max - spec.min) / spec.step + 1e-9) + 1;
}

/** Cross-product cell count for the supplied specs. */
export function estimateGridCells(specs: readonly ParameterSpec[]): number {
  if (specs.length === 0) return 0;
  let cells = 1;
  for (const s of specs) {
    const n = axisValueCount(s);
    if (n <= 0) return 0;
    cells *= n;
  }
  return cells;
}

export type GridValidation =
  | { readonly ok: true; readonly cells: number }
  | { readonly ok: false; readonly code: SensitivityUiErrorCode; readonly message: string };

/** Validate a sensitivity grid before dispatching to the executor. */
export function validateSensitivityGrid(
  specs: readonly ParameterSpec[],
): GridValidation {
  if (specs.length === 0) {
    return { ok: false, code: "INVALID_PARAMETER_GRID", message: "select at least one parameter" };
  }
  for (const s of specs) {
    if (!s.name) return { ok: false, code: "INVALID_PARAMETER_GRID", message: "unnamed parameter" };
    if (!Number.isFinite(s.min) || !Number.isFinite(s.max) || !Number.isFinite(s.step)) {
      return { ok: false, code: "INVALID_PARAMETER_GRID", message: `${s.name}: non-finite min/max/step` };
    }
    if (s.step <= 0) return { ok: false, code: "INVALID_PARAMETER_GRID", message: `${s.name}: step must be > 0` };
    if (s.max < s.min) return { ok: false, code: "INVALID_PARAMETER_GRID", message: `${s.name}: max < min` };
    const n = axisValueCount(s);
    if (n <= 0) return { ok: false, code: "INVALID_PARAMETER_GRID", message: `${s.name}: empty axis` };
    if (n > RESEARCH_UI_MAX_VALUES_PER_AXIS) {
      return {
        ok: false,
        code: "GRID_TOO_LARGE",
        message: `${s.name}: ${n} values exceeds axis cap ${RESEARCH_UI_MAX_VALUES_PER_AXIS}`,
      };
    }
  }
  const cells = estimateGridCells(specs);
  if (cells > RESEARCH_UI_MAX_CELLS) {
    return { ok: false, code: "GRID_TOO_LARGE", message: `grid has ${cells} cells (max ${RESEARCH_UI_MAX_CELLS})` };
  }
  return { ok: true, cells };
}

/** Human-readable label for typed UI error codes. */
export const SENSITIVITY_UI_ERROR_LABEL: Record<SensitivityUiErrorCode, string> = {
  RESEARCH_PAYLOAD_MISSING: "Load SMC or Hybrid data first",
  DATA_RANGE_UNAVAILABLE: "Data range unavailable for this request",
  PROVIDER_UNAVAILABLE: "Intraday provider is unavailable",
  DATA_QUALITY_FAILURE: "Data quality check failed",
  INVALID_PARAMETER_GRID: "Invalid parameter grid",
  GRID_TOO_LARGE: `Grid exceeds ${RESEARCH_UI_MAX_CELLS}-cell cap`,
  INSUFFICIENT_DATA: "Insufficient data for this configuration",
  RUN_CANCELLED: "Run cancelled — partial results preserved",
  DATA_LEAKAGE_ERROR: "Data leakage detected",
  WALK_FORWARD_LEAKAGE_ERROR: "Walk-forward window leakage detected",
};

export const SENSITIVITY_UI_MARKER = "SENSITIVITY_UI_V1";