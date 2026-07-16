// Phase 27 · Stage 3 — Combined PCR confirmation adapter.
//
// Pure consumer. Never recomputes PCR. If unavailable / stale, emits
// UNAVAILABLE — NEVER substitutes zero or infers a direction.

import type { CombinedPcrReading } from "../combined-pcr/types";
import type { PcrConfirmation, PcrConfirmationState } from "./types";

export interface PcrConfirmationOptions {
  readonly reading: CombinedPcrReading | null;
  readonly staleAfterMs?: number;
  readonly now?: number;
  readonly provider?: string;
}

export function adaptPcrConfirmation(opts: PcrConfirmationOptions): PcrConfirmation {
  const provider = opts.provider ?? "COMBINED_PCR";
  if (!opts.reading) {
    return {
      available: false,
      combinedScore: null,
      confirmedState: "UNAVAILABLE",
      slope: null,
      slopeChange: null,
      freshness: "UNKNOWN",
      dataQuality: "UNAVAILABLE",
      provider,
      timestamp: null,
    };
  }
  const now = opts.now ?? Date.now();
  const stale = opts.staleAfterMs ?? 5 * 60 * 1000;
  const age = Math.max(0, now - Date.parse(opts.reading.timestamp));
  const freshness: "FRESH" | "STALE" | "UNKNOWN" = Number.isFinite(age) ? (age <= stale ? "FRESH" : "STALE") : "UNKNOWN";
  const hasScore = opts.reading.combinedScore != null;
  const partial = opts.reading.warnings.length > 0;
  const dataQuality: PcrConfirmation["dataQuality"] = !hasScore ? "FAILED" : partial ? "PARTIAL" : "OK";
  const stateAvailable = hasScore && freshness !== "STALE";
  const state: PcrConfirmationState = stateAvailable
    ? (opts.reading.confirmedState as PcrConfirmationState)
    : "UNAVAILABLE";
  return {
    available: stateAvailable,
    combinedScore: hasScore ? opts.reading.combinedScore : null,
    confirmedState: state,
    slope: opts.reading.slope,
    slopeChange: opts.reading.slopeChange,
    freshness,
    dataQuality,
    provider,
    timestamp: opts.reading.timestamp,
  };
}
