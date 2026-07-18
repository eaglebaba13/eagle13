// Phase 3D — Institutional Flow Dashboard types.
// Pure, deterministic, provider-neutral. Consumer of canonical modules only.

import type { OptionUnderlying, OptionChainSnapshot } from "@/lib/option-chain/types";

export const INSTITUTIONAL_FLOW_VERSION = "institutional-flow@1.0.0";
export const INSTITUTIONAL_FLOW_DISCLAIMER =
  "RESEARCH ONLY — NOT INVESTMENT ADVICE. Institutional Flow reads canonical snapshots and never places orders.";

export type BuildUpClass =
  | "LONG_BUILDUP"
  | "SHORT_BUILDUP"
  | "LONG_UNWINDING"
  | "SHORT_COVERING"
  | "UNAVAILABLE";

export type CalcAvailability = "OK" | "PARTIAL" | "UNAVAILABLE";

export type FlowBias =
  | "PUT_WRITERS_ACTIVE"
  | "CALL_WRITERS_ACTIVE"
  | "BALANCED"
  | "CONFLICT"
  | "UNAVAILABLE";

export interface OiRow {
  readonly strike: number;
  readonly callOi: number | null;
  readonly putOi: number | null;
  readonly callChangeOi: number | null;
  readonly putChangeOi: number | null;
  readonly callVolume: number | null;
  readonly putVolume: number | null;
  readonly callOiRank: number | null;
  readonly putOiRank: number | null;
  readonly moneyness: "ITM_CE" | "ATM" | "OTM_CE" | "ITM_PE" | "OTM_PE" | "UNKNOWN";
  readonly isAtm: boolean;
  readonly isHighestCallOi: boolean;
  readonly isHighestPutOi: boolean;
  readonly isLowestCallOi: boolean;
  readonly isLowestPutOi: boolean;
}

export interface OiAnalysis {
  readonly rows: readonly OiRow[];
  readonly totalCallOi: number | null;
  readonly totalPutOi: number | null;
  readonly totalCallChangeOi: number | null;
  readonly totalPutChangeOi: number | null;
  readonly highestCallOiStrike: number | null;
  readonly highestPutOiStrike: number | null;
  readonly atmStrike: number | null;
  readonly availability: CalcAvailability;
  readonly missing: readonly string[];
}

export interface AggregateBuildUp {
  readonly callSide: BuildUpClass;
  readonly putSide: BuildUpClass;
  readonly overall: BuildUpClass;
  readonly rationale: string;
  readonly underlyingPriceChange: number | null;
  readonly totalCallChangeOi: number | null;
  readonly totalPutChangeOi: number | null;
  readonly availability: CalcAvailability;
}

export interface MaxPainResult {
  readonly currentMaxPain: number | null;
  readonly nearestMaxPain: number | null;
  readonly distanceFromSpot: number | null;
  readonly distanceFromSpotPct: number | null;
  readonly painShift: number | null;
  readonly historicalMaxPain: number | null;
  readonly perStrikePain: readonly { readonly strike: number; readonly pain: number | null }[];
  readonly availability: CalcAvailability;
}

export interface GammaResult {
  readonly gammaExposure: number | null;
  readonly positiveGamma: number | null;
  readonly negativeGamma: number | null;
  readonly gammaWallStrike: number | null;
  readonly gammaFlipStrike: number | null;
  readonly perStrike: readonly { readonly strike: number; readonly gex: number | null }[];
  readonly availability: CalcAvailability;
  readonly reason: string;
}

export interface HeatmapCell {
  readonly strike: number;
  readonly totalOi: number | null;
  readonly totalOiChange: number | null;
  readonly intensity: number; // 0..1 by |totalOi|
  readonly changeIntensity: number; // 0..1 by |ΔOI|
  readonly moneyness: OiRow["moneyness"];
  readonly isAtm: boolean;
  readonly isMaxPain: boolean;
}

export interface HeatmapResult {
  readonly cells: readonly HeatmapCell[];
  readonly maxPain: number | null;
  readonly atm: number | null;
  readonly availability: CalcAvailability;
}

export interface SectorFlowRow {
  readonly id: string;
  readonly name: string;
  readonly advances: number | null;
  readonly declines: number | null;
  readonly netBreadth: number | null;
  readonly weightedBreadth: number | null;
  readonly bias: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNAVAILABLE";
  readonly coverage: number | null;
}

export interface SectorFlow {
  readonly rows: readonly SectorFlowRow[];
  readonly availability: CalcAvailability;
  readonly registryVersion: string | null;
}

export interface MarketInternals {
  readonly advances: number | null;
  readonly declines: number | null;
  readonly unchanged: number | null;
  readonly advanceDeclineRatio: number | null;
  readonly netBreadth: number | null;
  readonly pcr: number | null;
  readonly pcrState: string;
  readonly vix: number | null;
  readonly decisionAction: string;
  readonly decisionConfidence: number | null;
  readonly gtiState: string;
  readonly gtiConfidence: number;
  readonly availability: CalcAvailability;
}

export interface InstitutionalSummary {
  readonly bias: FlowBias;
  readonly headline: string;
  readonly rationale: readonly string[];
  readonly evidence: readonly string[];
  readonly availability: CalcAvailability;
}

export interface InstitutionalFlowDiagnostics {
  readonly underlying: OptionUnderlying;
  readonly snapshotTimestamp: string | null;
  readonly snapshotProvider: string;
  readonly snapshotFreshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly strikeCoverage: number;
  readonly missingGreeks: boolean;
  readonly unavailableCalculations: readonly string[];
  readonly processingMs: number;
  readonly warnings: readonly string[];
}

export interface InstitutionalFlowReport {
  readonly underlying: OptionUnderlying;
  readonly spot: number | null;
  readonly generatedAt: string;
  readonly oi: OiAnalysis;
  readonly buildUp: AggregateBuildUp;
  readonly maxPain: MaxPainResult;
  readonly gamma: GammaResult;
  readonly heatmap: HeatmapResult;
  readonly sectorFlow: SectorFlow;
  readonly internals: MarketInternals;
  readonly summary: InstitutionalSummary;
  readonly diagnostics: InstitutionalFlowDiagnostics;
  readonly source: "LIVE" | "MIXED" | "RESEARCH_DEMO" | "UNAVAILABLE";
  readonly disclaimer: string;
  readonly version: string;
}

/** Guard: rejects null/NaN/Infinity. */
export function isFinitePos(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Compact re-export so callers don't need to reach into option-chain types. */
export type { OptionChainSnapshot };