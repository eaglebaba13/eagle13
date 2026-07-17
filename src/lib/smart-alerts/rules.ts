// Phase 3C — Rule configuration and safe defaults. Pure. Versioned.

import { SMART_ALERTS_RULES_VERSION } from "./types";

export const RULES_VERSION = SMART_ALERTS_RULES_VERSION;

export interface AlertRuleConfig {
  readonly version: string;
  readonly vixLowUpper: number;   // <15 → LOW
  readonly vixMidUpper: number;   // 15–20 → MID; >20 → HIGH
  readonly gannApproachPoints: number; // distance threshold to fire APPROACHING
  readonly gannTouchTolerancePoints: number; // ± tolerance considered a touch
  readonly astroLeadMinutes: number;   // window starting-soon lead
  readonly staleThresholdSec: number;  // freshness before firing DATA_STALE
  readonly runtimeDegradedGraceSec: number; // grace before firing degraded
}

export const DEFAULT_RULE_CONFIG: AlertRuleConfig = {
  version: RULES_VERSION,
  vixLowUpper: 15,
  vixMidUpper: 20,
  gannApproachPoints: 25,
  gannTouchTolerancePoints: 5,
  astroLeadMinutes: 30,
  staleThresholdSec: 60 * 10,
  runtimeDegradedGraceSec: 30,
};

export function classifyVixRegime(
  value: number | null,
  cfg: AlertRuleConfig = DEFAULT_RULE_CONFIG,
): "LOW" | "MID" | "HIGH" | "UNKNOWN" {
  if (value == null || !Number.isFinite(value)) return "UNKNOWN";
  if (value < cfg.vixLowUpper) return "LOW";
  if (value <= cfg.vixMidUpper) return "MID";
  return "HIGH";
}