// Phase 3A — Live Option Strategy Terminal (consumer-only).
// Pure types. No formulas. No fetches. Never re-derives PCR/GTI/Decision/etc.

export type CanonicalBias =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL"
  | "CONFLICT"
  | "UNAVAILABLE";

export type VixRegime = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type StrikeRegime = "ITM" | "ATM" | "OTM" | "UNKNOWN";

export type StrategyKey =
  | "BUY_CE"
  | "BUY_PE"
  | "SELL_CE"
  | "SELL_PE"
  | "BULL_CALL_SPREAD"
  | "BEAR_PUT_SPREAD"
  | "BULL_PUT_SPREAD"
  | "BEAR_CALL_SPREAD"
  | "LONG_STRADDLE"
  | "SHORT_STRADDLE"
  | "LONG_STRANGLE"
  | "SHORT_STRANGLE"
  | "IRON_CONDOR"
  | "IRON_FLY"
  | "CALENDAR_SPREAD"
  | "DIAGONAL_SPREAD"
  | "RATIO_SPREAD"
  | "BUTTERFLY"
  | "BROKEN_WING_BUTTERFLY"
  | "JADE_LIZARD";

export type CapitalTier = "LOW" | "MEDIUM" | "HIGH";
export type RiskTier = "LOW" | "MEDIUM" | "HIGH" | "UNLIMITED";
export type RewardTier = "LOW" | "MEDIUM" | "HIGH" | "UNLIMITED";
export type ComplexityTier = "SIMPLE" | "MODERATE" | "ADVANCED";
export type VolatilityStance = "LONG_VOL" | "SHORT_VOL" | "NEUTRAL_VOL";

/** Canonical signal envelope fed to the terminal. Every field is optional
 *  so a missing canonical module is honoured as UNAVAILABLE — never fabricated. */
export interface CanonicalSignals {
  readonly decision?: CanonicalBias;
  readonly pcr?: CanonicalBias;
  readonly gti?: CanonicalBias;
  readonly breadth?: CanonicalBias;
  readonly astro?: CanonicalBias;
  readonly gann?: CanonicalBias;
  readonly gannGap?: CanonicalBias;
  /** 0..100 confidence supplied by Decision Engine, when known. */
  readonly decisionConfidence?: number | null;
}

export interface DirectionResult {
  readonly bias: CanonicalBias;
  readonly bullCount: number;
  readonly bearCount: number;
  readonly neutralCount: number;
  readonly conflictCount: number;
  readonly unavailableCount: number;
  readonly confidence: number; // 0..100, alignment-driven
  readonly reasons: readonly string[];
}

export interface StrategyProfile {
  readonly key: StrategyKey;
  readonly label: string;
  readonly legs: number;
  readonly bias: "BULL" | "BEAR" | "NEUTRAL" | "VOL_LONG" | "VOL_SHORT";
  readonly volatilityStance: VolatilityStance;
  readonly capital: CapitalTier;
  readonly risk: RiskTier;
  readonly reward: RewardTier;
  readonly complexity: ComplexityTier;
  readonly preferredVix: readonly VixRegime[];
  readonly preferredStrikeRegime: readonly StrikeRegime[];
  readonly summary: string;
}

export interface ScoredStrategy {
  readonly profile: StrategyProfile;
  readonly alignmentPct: number;   // 0..100 — how well the profile matches the current direction
  readonly overallPct: number;     // 0..100 — alignment × confidence penalties
  readonly bullishScore: number;   // 0..100 — profile propensity, not a prediction
  readonly bearishScore: number;
  readonly neutralScore: number;
  readonly rationale: readonly string[];
  readonly warnings: readonly string[];
  readonly recommended: boolean;
}

export interface StrategyEngineInput {
  readonly signals: CanonicalSignals;
  readonly vix: number | null;
  readonly generatedAt?: string;
}

export interface StrategyEngineOutput {
  readonly generatedAt: string;
  readonly direction: DirectionResult;
  readonly vix: number | null;
  readonly vixRegime: VixRegime;
  readonly strikeRegime: StrikeRegime;
  readonly strategies: readonly ScoredStrategy[];
  readonly recommended: readonly ScoredStrategy[];
  readonly explanation: string;
  readonly researchOnly: true;
  readonly reasons: readonly string[];
}

export const RESEARCH_LABEL = "Research Only — Not Investment Advice";