// Phase 27 — Option Strategy Decision Engine (research-only).
// Weighted, deterministic rule engine. Consumer of canonical modules only.
// Never places orders, never fabricates data.

export type DecisionAction = "BUY_CALL" | "BUY_PUT" | "WAIT" | "NO_TRADE";

export type IndicatorBias = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNAVAILABLE";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | "UNKNOWN";

export type StrikeMoneyness = "ATM" | "ITM" | "OTM";

export interface IndicatorScore {
  readonly key:
    | "pcr"
    | "sector"
    | "breadth"
    | "oi"
    | "vix"
    | "maxPain";
  readonly label: string;
  readonly weight: number; // 0..1
  readonly bias: IndicatorBias;
  readonly bullContribution: number; // 0..weight*100
  readonly bearContribution: number;
  readonly available: boolean;
  readonly note: string;
}

export interface StrikeRecommendation {
  readonly strike: number | null;
  readonly optionType: "CE" | "PE" | null;
  readonly moneyness: StrikeMoneyness | null;
  readonly label: string;
  readonly reasons: readonly string[];
  readonly available: boolean;
}

export interface PositionSizingRecommendation {
  readonly risk: RiskLevel;
  readonly suggestedSizePct: number; // 0..100
  readonly note: string;
}

export interface DecisionEngineInput {
  readonly pcr: {
    readonly combinedScore: number | null; // -1..+1 (positive = bullish)
    readonly state: string | null;
    readonly available: boolean;
  };
  readonly breadth: {
    readonly advances: number | null;
    readonly declines: number | null;
    readonly netBreadth: number | null; // -1..+1
    readonly available: boolean;
  };
  readonly sector: {
    // ordered biases; keys are canonical sector names
    readonly banking: IndicatorBias;
    readonly oilGas: IndicatorBias;
    readonly it: IndicatorBias;
    readonly available: boolean;
  };
  readonly oi: {
    readonly highestCallOiStrike: number | null;
    readonly highestPutOiStrike: number | null;
    readonly atmStrike: number | null;
    readonly totalCallChangeOi: number | null;
    readonly totalPutChangeOi: number | null;
    readonly buildUp: string | null; // LONG_BUILDUP | SHORT_BUILDUP | ...
    readonly available: boolean;
  };
  readonly maxPain: {
    readonly value: number | null;
    readonly spot: number | null;
    readonly distance: number | null;
    readonly distancePct: number | null;
    readonly available: boolean;
  };
  readonly vix: number | null;
  readonly underlying: "NIFTY" | "BANKNIFTY";
  readonly generatedAt: string;
}

export interface DecisionEngineOutput {
  readonly action: DecisionAction;
  readonly confidence: number; // 0..100
  readonly bullScore: number; // 0..100
  readonly bearScore: number; // 0..100
  readonly indicators: readonly IndicatorScore[];
  readonly reasoning: readonly string[]; // positive supporting bullets
  readonly warnings: readonly string[];
  readonly conflicts: readonly string[];
  readonly strike: StrikeRecommendation;
  readonly sizing: PositionSizingRecommendation;
  readonly vixRegime: "LOW" | "MEDIUM" | "ELEVATED" | "HIGH" | "UNKNOWN";
  readonly leadingSector: string | null;
  readonly weakestSector: string | null;
  readonly generatedAt: string;
  readonly disclaimer: string;
}

export const DECISION_ENGINE_DISCLAIMER =
  "RESEARCH ONLY — NOT INVESTMENT ADVICE. Weighted confirmation engine. No orders placed.";

export const DECISION_ENGINE_WEIGHTS = {
  pcr: 0.3,
  sector: 0.2,
  breadth: 0.2,
  oi: 0.15,
  vix: 0.1,
  maxPain: 0.05,
} as const;