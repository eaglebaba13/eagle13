// Phase 27 · Stage 1 — Combined PCR types.
//
// Research-only. No BUY / SELL emitted. Consumes the Option Chain
// Foundation (types, engines, snapshot history) and never touches
// providers, brokers or execution paths.

import type { OptionUnderlying } from "../option-chain/types";

export type PcrSignalState =
  | "STRONG_CE_FOCUS"
  | "CE_FOCUS"
  | "BULLISH_WEAKENING"
  | "NO_TRADE"
  | "BEARISH_WEAKENING"
  | "PE_FOCUS"
  | "STRONG_PE_FOCUS";

export const PCR_SIGNAL_STATES: readonly PcrSignalState[] = [
  "STRONG_CE_FOCUS",
  "CE_FOCUS",
  "BULLISH_WEAKENING",
  "NO_TRADE",
  "BEARISH_WEAKENING",
  "PE_FOCUS",
  "STRONG_PE_FOCUS",
] as const;

export interface InstrumentPcr {
  readonly underlying: OptionUnderlying;
  readonly rawOiPcr: number | null;
  readonly rawChangeOiPcr: number | null;
  readonly normalizedOiPcr: number | null;
  readonly normalizedChangeOiPcr: number | null;
  readonly instrumentScore: number | null;
  readonly weight: number;              // effective weight (renormalized)
  readonly configuredWeight: number;    // requested weight before renorm
  readonly strikeCount: number;
  readonly atm: number | null;
  readonly expiry: string | null;
  readonly provider: string;
  readonly timestamp: string;
  readonly snapshotId: string;
  readonly missing: readonly string[];
}

export interface CombinedPcrReading {
  readonly combinedScore: number | null;
  readonly direction: "CE" | "NEUTRAL" | "PE";
  readonly emaFast: number | null;
  readonly emaSlow: number | null;
  readonly slope: number | null;
  readonly previousSlope: number | null;
  readonly slopeChange: number | null;
  readonly zeroCross: boolean;
  readonly signalState: PcrSignalState;
  readonly confirmedState: PcrSignalState;
  readonly pendingState: PcrSignalState;
  readonly confirmationCount: number;
  readonly instruments: readonly InstrumentPcr[];
  readonly timestamp: string;
  readonly warnings: readonly string[];
  readonly runId: string;
}

export const FORMULA_VERSION = "combined-pcr@1.0.0";

export const DISCLAIMER = "RESEARCH ONLY — not a BUY / SELL signal.";

export interface CombinedPcrWeights {
  readonly NIFTY: number;
  readonly BANKNIFTY: number;
}

export const DEFAULT_COMBINED_PCR_WEIGHTS: CombinedPcrWeights = {
  NIFTY: 0.6,
  BANKNIFTY: 0.4,
};