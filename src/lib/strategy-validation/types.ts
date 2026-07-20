// Phase 29 — Strategy Validation & Backtesting Engine.
// Analytical only. Does NOT modify Decision or Institutional Flow engines.
// Deterministic. Same inputs → same outputs. Research-only.

import type {
  DecisionAction,
  DecisionEngineInput,
  DecisionEngineOutput,
  StrikeMoneyness,
} from "@/lib/option-strategy-decision/types";

export type MarketRegime =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "SIDEWAYS"
  | "RANGE_EXPANSION"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "UNKNOWN";

export type TradeOutcome = "WIN" | "LOSS" | "WAIT" | "NO_TRADE";

export type FailureCategory =
  | "HIGH_VIX"
  | "CONFLICTING_SIGNALS"
  | "WEAK_BREADTH"
  | "POOR_OI"
  | "LOW_CONFIDENCE"
  | "MARKET_REVERSAL"
  | "UNKNOWN";

export type VixBucket = "LT_15" | "B15_20" | "B20_25" | "GT_25" | "UNKNOWN";

export interface HistoricalSnapshot {
  readonly timestamp: string;
  readonly spotPrice: number;
  readonly forwardPrice: number | null; // price N bars ahead — used to score win/loss
  readonly regime: MarketRegime;
  readonly institutionalFlow: "BUYING" | "SELLING" | "NEUTRAL" | "UNKNOWN";
  readonly input: DecisionEngineInput;
}

export interface ReplayResult {
  readonly timestamp: string;
  readonly spotPrice: number;
  readonly forwardPrice: number | null;
  readonly bullScore: number;
  readonly bearScore: number;
  readonly confidence: number;
  readonly action: DecisionAction;
  readonly strike: number | null;
  readonly moneyness: StrikeMoneyness | null;
  readonly regime: MarketRegime;
  readonly institutionalFlow: HistoricalSnapshot["institutionalFlow"];
  readonly outcome: TradeOutcome;
  readonly returnPct: number; // 0 for WAIT/NO_TRADE
  readonly holdingBars: number;
  readonly decision: DecisionEngineOutput;
  readonly failure: FailureCategory | null;
}

export interface PerformanceMetrics {
  readonly totalTrades: number;
  readonly winning: number;
  readonly losing: number;
  readonly skipped: number;
  readonly winRate: number;
  readonly avgWinner: number;
  readonly avgLoser: number;
  readonly profitFactor: number | null;
  readonly expectancy: number;
  readonly maxDrawdown: number;
  readonly recoveryFactor: number | null;
  readonly sharpe: number | null;
  readonly sampleSize: number;
  readonly lowSample: boolean;
}

export interface DecisionBreakdownRow {
  readonly action: DecisionAction;
  readonly trades: number;
  readonly winRate: number;
  readonly avgReturn: number;
  readonly maxGain: number;
  readonly maxLoss: number;
}

export interface RegimeBreakdownRow {
  readonly regime: MarketRegime;
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly avgReturn: number;
}

export interface VixBreakdownRow {
  readonly bucket: VixBucket;
  readonly signals: number;
  readonly winRate: number;
  readonly avgReturn: number;
  readonly avgHoldingBars: number;
}

export interface StrikeBreakdownRow {
  readonly moneyness: StrikeMoneyness | "UNKNOWN";
  readonly trades: number;
  readonly winRate: number;
  readonly avgPremiumMovePct: number;
  readonly avgHoldingBars: number;
}

export interface ConfidenceBucketRow {
  readonly bucket: string; // e.g. "90-100"
  readonly min: number;
  readonly max: number;
  readonly trades: number;
  readonly actualWinRate: number;
  readonly lowSample: boolean;
}

export interface ContributionRow {
  readonly key: string;
  readonly label: string;
  readonly agreementPct: number;
  readonly contributionPct: number;
  readonly historicalWinRate: number;
  readonly sample: number;
  readonly lowSample: boolean;
}

export interface FailureRow {
  readonly category: FailureCategory;
  readonly count: number;
  readonly frequencyPct: number;
}

export interface JournalEntry {
  readonly timestamp: string;
  readonly action: DecisionAction;
  readonly confidence: number;
  readonly bullScore: number;
  readonly bearScore: number;
  readonly checklist: readonly string[];
  readonly reasoning: readonly string[];
  readonly outcome: TradeOutcome;
  readonly returnPct: number;
  readonly holdingBars: number;
}

export interface AnalyticsReport {
  readonly generatedAt: string;
  readonly sampleSize: number;
  readonly available: boolean;
  readonly note: string;
  readonly overall: PerformanceMetrics;
  readonly decisionBreakdown: readonly DecisionBreakdownRow[];
  readonly regimeBreakdown: readonly RegimeBreakdownRow[];
  readonly vixBreakdown: readonly VixBreakdownRow[];
  readonly strikeBreakdown: readonly StrikeBreakdownRow[];
  readonly calibration: readonly ConfidenceBucketRow[];
  readonly contribution: readonly ContributionRow[];
  readonly failures: readonly FailureRow[];
  readonly journal: readonly JournalEntry[];
}

export const STRATEGY_VALIDATION_DISCLAIMER =
  "RESEARCH ONLY — Historical replay of the existing Decision Engine. No trading logic modified.";

export const MIN_SAMPLE_SIZE = 30;

export const CONFIDENCE_BUCKETS: readonly { label: string; min: number; max: number }[] = [
  { label: "90-100", min: 90, max: 100.01 },
  { label: "80-90", min: 80, max: 90 },
  { label: "70-80", min: 70, max: 80 },
  { label: "60-70", min: 60, max: 70 },
  { label: "50-60", min: 50, max: 60 },
  { label: "<50", min: 0, max: 50 },
];