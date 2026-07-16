// Phase 27 · Stage 3 — India VIX regime classifier (pure, deterministic).

import type { VixRegime, VixRegimeReading } from "./types";

export interface VixRegimeThresholds {
  readonly low: number;    // BELOW_15 boundary
  readonly mid: number;    // BETWEEN_15_AND_20 upper
  readonly high: number;   // ABOVE_20
  readonly extreme: number;// ABOVE_25
}

export const DEFAULT_VIX_THRESHOLDS: VixRegimeThresholds = {
  low: 15, mid: 20, high: 20, extreme: 25,
};

export function classifyVix(vix: number | null, t: VixRegimeThresholds = DEFAULT_VIX_THRESHOLDS): VixRegime {
  if (vix == null || !Number.isFinite(vix)) return "UNKNOWN";
  if (vix >= t.extreme) return "ABOVE_25";
  if (vix >= t.high) return "ABOVE_20";
  if (vix >= t.low) return "BETWEEN_15_AND_20";
  return "BELOW_15";
}

export interface VixRegimeInput {
  readonly currentVix: number | null;
  readonly previousVix?: number | null;
  readonly previousRegime?: VixRegime;
  readonly provider: string;
  readonly timestamp: string;
  readonly freshness?: "FRESH" | "STALE" | "UNKNOWN";
  readonly thresholds?: VixRegimeThresholds;
}

export function evaluateVixRegime(input: VixRegimeInput): VixRegimeReading {
  const regime = classifyVix(input.currentVix, input.thresholds);
  const prevRegime = input.previousRegime ?? classifyVix(input.previousVix ?? null, input.thresholds);
  const rising = input.currentVix != null && input.previousVix != null
    ? input.currentVix > input.previousVix
    : false;
  return {
    currentVix: input.currentVix,
    previousVix: input.previousVix ?? null,
    regime,
    previousRegime: prevRegime,
    regimeChanged: regime !== prevRegime,
    rising,
    freshness: input.freshness ?? "UNKNOWN",
    provider: input.provider,
    timestamp: input.timestamp,
  };
}
