// Phase 21.2 · Instrument + provisional-policy configuration for the
// Absolute-Degree Intraday Astro Engine. See spec §§6, 9, 11, 13, 17, 18.

import { UnsupportedInstrumentError } from "./gann-intraday.types";

export type InstrumentSymbol = "NIFTY50" | "BANKNIFTY";

export type InstrumentPolicy = {
  symbol: InstrumentSymbol;
  /** Safe zone half-width around previous close (spot points). */
  safeDistance: number;
  /** Cluster tolerance — EAGLEBABA_PROVISIONAL_CLUSTER_POLICY. */
  clusterTolerancePoints: number;
  /** Exact-360 confluence tolerance — EAGLEBABA_PROVISIONAL_360_TOLERANCE. */
  exact360TolerancePoints: number;
  /** Max entry deviation from Astro level — EAGLEBABA_PROVISIONAL_ENTRY_DEVIATION. */
  maximumEntryDeviation: number;
  /** Intraday fixed stop (spot points). Course-backed. */
  stopLossPoints: number;
  /** Intraday initial target (spot points). Course-backed 1:1 RR. */
  targetPoints: number;
};

export const INSTRUMENT_POLICIES: Record<InstrumentSymbol, InstrumentPolicy> = {
  NIFTY50: {
    symbol: "NIFTY50",
    safeDistance: 100,
    clusterTolerancePoints: 5,
    exact360TolerancePoints: 10,
    maximumEntryDeviation: 15,
    stopLossPoints: 51,
    targetPoints: 51,
  },
  BANKNIFTY: {
    symbol: "BANKNIFTY",
    safeDistance: 300,
    clusterTolerancePoints: 10,
    exact360TolerancePoints: 20,
    maximumEntryDeviation: 30,
    stopLossPoints: 101,
    targetPoints: 101,
  },
};

export function getInstrumentPolicy(symbol: string): InstrumentPolicy {
  const policy = (INSTRUMENT_POLICIES as Record<string, InstrumentPolicy>)[symbol];
  if (!policy) throw new UnsupportedInstrumentError(symbol);
  return policy;
}

/**
 * Provisional policy identifiers surfaced in methodology metadata so that
 * downstream reports can distinguish original-course rules from EagleBaba
 * implementation defaults.
 */
export const PROVISIONAL_POLICIES = {
  EXACT_BOUNDARY: "PROVISIONAL_EXACT_BOUNDARY_POLICY",
  CLUSTER: "EAGLEBABA_PROVISIONAL_CLUSTER_POLICY",
  EXACT_360: "EAGLEBABA_PROVISIONAL_360_TOLERANCE",
  ENTRY_DEVIATION: "EAGLEBABA_PROVISIONAL_ENTRY_DEVIATION",
  EXECUTION_EXTENSION: "EAGLEBABA_EXECUTION_EXTENSION",
} as const;