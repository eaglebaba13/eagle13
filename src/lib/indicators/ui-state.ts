// Indicator UI state — provider-neutral, no chart coupling.
// Used by React components to track selected/configured indicators.

import type { IndicatorId, IndicatorParamDef } from "./types";

export interface ActiveIndicator {
  readonly id: IndicatorId;
  readonly enabled: boolean;
  readonly params: Record<string, number>;
}

export type IndicatorPanelType = "overlay" | "oscillator";

/**
 * Create a default ActiveIndicator from parameter definitions.
 */
export function createDefaultActiveIndicator(
  id: IndicatorId,
  paramDefs: readonly IndicatorParamDef[],
): ActiveIndicator {
  const params: Record<string, number> = {};
  for (const def of paramDefs) {
    params[def.key] = def.default;
  }
  return { id, enabled: true, params };
}

/**
 * Validate and clamp parameters to definition bounds.
 */
export function clampParams(
  params: Record<string, number>,
  paramDefs: readonly IndicatorParamDef[],
): Record<string, number> {
  const clamped: Record<string, number> = {};
  for (const def of paramDefs) {
    const raw = params[def.key] ?? def.default;
    const val = def.type === "int" ? Math.floor(raw) : raw;
    clamped[def.key] = Math.max(def.min, Math.min(def.max, val));
  }
  return clamped;
}
