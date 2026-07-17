// Phase 3B — AI Market Assistant. Deterministic explanation layer over
// canonical modules. Pure types. No formulas. No fetches. No LLM.

import type { CanonicalBias } from "@/lib/option-strategy-terminal/types";

export type AssistantBias = CanonicalBias; // BULLISH | BEARISH | NEUTRAL | CONFLICT | UNAVAILABLE
export type AssistantConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
export type AssistantModule =
  | "DECISION_ENGINE"
  | "COMBINED_PCR"
  | "GTI"
  | "MARKET_BREADTH"
  | "ASTRO"
  | "GANN"
  | "GANN_GAP_OUTLOOK"
  | "INDIA_VIX"
  | "OPTION_STRATEGY_TERMINAL"
  | "RUNTIME_READINESS";

export type EvidenceFreshness = "LIVE" | "MIXED" | "RESEARCH_DEMO" | "STALE" | "UNKNOWN";

export interface EvidenceItem {
  readonly module: AssistantModule;
  readonly available: boolean;
  readonly bias: AssistantBias;
  readonly freshness: EvidenceFreshness;
  readonly detail: string;
}

export interface StrategyContextView {
  readonly available: boolean;
  readonly preferredCategory: string;
  readonly rationale: string;
  readonly keyRisk: string;
  readonly requiredConfirmation: string;
  readonly invalidation: string;
}

export interface DataQualityView {
  readonly total: number;
  readonly live: number;
  readonly demo: number;
  readonly stale: number;
  readonly unavailable: number;
  readonly label: "LIVE" | "MIXED" | "RESEARCH_DEMO" | "UNAVAILABLE";
}

export interface CanonicalContext {
  readonly generatedAt: string;
  readonly evidence: readonly EvidenceItem[];
  readonly vix: number | null;
  readonly vixRegime: string;
  readonly strategy: StrategyContextView;
  readonly runtime: {
    readonly overall: "READY" | "PARTIALLY_READY" | "NOT_READY" | "UNKNOWN";
    readonly degradedModules: readonly string[];
  };
}

export type AssistantQuestionId =
  | "MARKET_BIAS"
  | "WHY_BULLISH"
  | "WHY_BEARISH"
  | "CONFLICTING_SIGNALS"
  | "STRATEGY_CONTEXT"
  | "INVALIDATION"
  | "UNAVAILABLE_MODULES"
  | "DATA_RELIABILITY";

export interface AssistantResponse {
  readonly headline: string;
  readonly marketBias: AssistantBias;
  readonly summary: string;
  readonly supportingEvidence: readonly EvidenceItem[];
  readonly conflictingEvidence: readonly EvidenceItem[];
  readonly riskFactors: readonly string[];
  readonly whatWouldChangeTheView: readonly string[];
  readonly strategyContext: StrategyContextView;
  readonly dataQuality: DataQualityView;
  readonly confidence: AssistantConfidence;
  readonly disclaimer: string;
  readonly generatedAt: string;
  readonly sources: {
    readonly used: readonly AssistantModule[];
    readonly unavailable: readonly AssistantModule[];
    readonly stale: readonly AssistantModule[];
    readonly researchOnly: readonly AssistantModule[];
  };
  readonly guardrailViolationsPrevented: number;
}

export const RESEARCH_DISCLAIMER =
  "Research Only — Not Investment Advice. This assistant never places orders and never executes trades.";