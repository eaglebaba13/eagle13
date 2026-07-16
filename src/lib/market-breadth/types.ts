// Phase 27 · Stage 3 — Market Breadth research layer types.
//
// Provider-neutral, immutable data models. Research ONLY.
// No BUY / SELL. No broker/order/execution paths.

export type BreadthUniverse =
  | "BROAD_NSE"
  | "NIFTY50"
  | "NIFTY_TOP_WEIGHTED"
  | "SECTOR_BANKING"
  | "SECTOR_IT"
  | "SECTOR_OIL_GAS"
  | "SECTOR_AUTO";

export type BreadthQuality = "OK" | "PARTIAL" | "STALE" | "FAILED";

export type BreadthDirection = "ADVANCE" | "DECLINE" | "UNCHANGED" | "UNAVAILABLE";

export interface SymbolTick {
  readonly symbol: string;
  readonly weight?: number | null;
  readonly direction: BreadthDirection;
  readonly changePercent: number | null;
}

export interface MarketBreadthSnapshot {
  readonly timestamp: string;
  readonly provider: string;
  readonly universe: BreadthUniverse;
  readonly totalSymbols: number;
  readonly advances: number;
  readonly declines: number;
  readonly unchanged: number;
  readonly unavailable: number;
  readonly advanceDeclineRatio: number | null;
  readonly advancePercentage: number | null;
  readonly declinePercentage: number | null;
  readonly netBreadth: number | null;                // advances - declines
  readonly weightedBreadth: number | null;           // ∑ weight * dir (advance=+1, decline=-1)
  readonly weightedAdvance: number | null;
  readonly weightedDecline: number | null;
  readonly weightedUnchanged: number | null;
  readonly totalWeight: number | null;
  readonly freshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly dataQuality: BreadthQuality;
  readonly constituentCoverage: number | null;       // 0..1 coverage of the requested universe
  readonly snapshotId: string;
  readonly registryVersion: string | null;
  readonly warnings: readonly string[];
}

export type VixRegime =
  | "BELOW_15"
  | "BETWEEN_15_AND_20"
  | "ABOVE_20"
  | "ABOVE_25"
  | "UNKNOWN";

export interface VixRegimeReading {
  readonly currentVix: number | null;
  readonly previousVix: number | null;
  readonly regime: VixRegime;
  readonly previousRegime: VixRegime;
  readonly regimeChanged: boolean;
  readonly rising: boolean;
  readonly freshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly provider: string;
  readonly timestamp: string;
}

export type PcrConfirmationState =
  | "STRONG_CE_FOCUS"
  | "CE_FOCUS"
  | "BULLISH_WEAKENING"
  | "NO_TRADE"
  | "BEARISH_WEAKENING"
  | "PE_FOCUS"
  | "STRONG_PE_FOCUS"
  | "UNAVAILABLE";

export interface PcrConfirmation {
  readonly available: boolean;
  readonly combinedScore: number | null;
  readonly confirmedState: PcrConfirmationState;
  readonly slope: number | null;
  readonly slopeChange: number | null;
  readonly freshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly dataQuality: "OK" | "PARTIAL" | "FAILED" | "UNAVAILABLE";
  readonly provider: string;
  readonly timestamp: string | null;
}

export type GtiResearchState =
  | "STRONG_CE_RESEARCH_FOCUS"
  | "CE_RESEARCH_FOCUS"
  | "BULLISH_BUT_CONFLICTED"
  | "NEUTRAL_RESEARCH"
  | "BEARISH_BUT_CONFLICTED"
  | "PE_RESEARCH_FOCUS"
  | "STRONG_PE_RESEARCH_FOCUS"
  | "DATA_INSUFFICIENT";

export interface ConflictItem {
  readonly code: string;
  readonly message: string;
}

export interface ConfidenceBreakdown {
  readonly base: number;
  readonly coveragePenalty: number;
  readonly freshnessPenalty: number;
  readonly conflictPenalty: number;
  readonly agreementBonus: number;
  readonly pcrBonus: number;
  readonly vixConsistencyBonus: number;
  readonly total: number;
  readonly formulaVersion: string;
}

export interface GtiResearchReading {
  readonly timestamp: string;
  readonly runId: string;
  readonly state: GtiResearchState;
  readonly confidence: number; // 0..100
  readonly confidenceBreakdown: ConfidenceBreakdown;
  readonly conflicts: readonly ConflictItem[];
  readonly breadth: {
    readonly broad: MarketBreadthSnapshot | null;
    readonly nifty50: MarketBreadthSnapshot | null;
    readonly topWeighted: MarketBreadthSnapshot | null;
    readonly sectors: readonly MarketBreadthSnapshot[];
  };
  readonly vix: VixRegimeReading;
  readonly pcr: PcrConfirmation;
  readonly warnings: readonly string[];
  readonly formulaVersion: string;
  readonly disclaimer: string;
}

export const MARKET_BREADTH_FORMULA_VERSION = "market-breadth@1.0.0";
export const GTI_RESEARCH_FORMULA_VERSION = "gti-research@1.0.0";
export const MARKET_BREADTH_DISCLAIMER = "RESEARCH ONLY — NOT INVESTMENT ADVICE";
