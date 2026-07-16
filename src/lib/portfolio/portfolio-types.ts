// Phase 22 · Stage 1 — Portfolio research types. Research-only. No live
// orders, no broker integration, no production sizing. Source strategy
// trades and Run IDs are consumed read-only and never mutated.

import type {
  HistoricalTrade,
  EquityPoint,
  UnifiedFormulaId,
} from "@/lib/backtest/result";

export type AllocationMethod =
  | "EQUAL_WEIGHT"
  | "FIXED_CUSTOM"
  | "VOL_INVERSE"
  | "RISK_PARITY"
  | "MAX_DIVERSIFICATION"
  | "MIN_VARIANCE"
  | "ROBUSTNESS_WEIGHTED"
  | "OOS_EXPECTANCY_WEIGHTED"
  | "RECOMMENDATION_WEIGHTED";

export type PositionSizingMethod =
  | "FIXED_QTY"
  | "FIXED_CAPITAL_PCT"
  | "FIXED_RISK_PCT"
  | "VOL_TARGETING"
  | "ATR_RISK"
  | "FRACTIONAL_KELLY"
  | "DRAWDOWN_ADJUSTED"
  | "CONFIDENCE_ADJUSTED";

export type RebalancePolicy =
  | "NEVER"
  | "MONTHLY"
  | "QUARTERLY"
  | "THRESHOLD_DRIFT"
  | "REGIME_CHANGE"
  | "RECOMMENDATION_CHANGE";

export type KellyFraction = "FULL" | "HALF" | "QUARTER" | "CUSTOM";

export type PortfolioAsset = {
  readonly id: string;
  readonly label: string;
  readonly strategy: string;
  readonly formulaVersion: UnifiedFormulaId | string;
  readonly instrument: string;
  readonly timeframe: string;
  readonly regime?: string | null;
  readonly runId: string;
  readonly dataHash?: string | null;
  readonly from: string;
  readonly to: string;
  readonly startingCapital: number;
  readonly trades: readonly HistoricalTrade[];
  readonly equityCurve: readonly EquityPoint[];
  readonly maxDrawdown: number;
  readonly netPnl: number;
  readonly robustnessScore?: number | null;
  readonly oosExpectancy?: number | null;
  readonly recommendationConfidence?: number | null;
  readonly overfitStatus?: "PASS" | "WATCH" | "FAIL" | "OVERFIT" | null;
  readonly reliability?: "HIGH" | "MEDIUM" | "LOW" | "POOR" | "UNRELIABLE" | null;
  readonly dataQuality?: "HIGH" | "MEDIUM" | "LOW" | null;
};

export type StrategyAllocation = {
  readonly assetId: string;
  readonly weight: number; // 0..1
  readonly rationale: string;
};

export type PortfolioConstraints = {
  readonly maxWeightPerStrategy?: number;
  readonly maxWeightPerInstrument?: number;
  readonly maxWeightPerTimeframe?: number;
  readonly maxCorrelatedExposure?: number;
  readonly minDiversificationCount?: number;
  readonly maxLeverage?: number;
  readonly maxPortfolioDrawdown?: number;
  readonly maxDailyLoss?: number;
  readonly maxSimultaneousPositions?: number;
  readonly minResearchReliability?: "HIGH" | "MEDIUM" | "LOW";
  readonly minDataQuality?: "HIGH" | "MEDIUM" | "LOW";
  readonly minTradeCount?: number;
};

export type CostModel = {
  readonly slippagePct: number;
  readonly brokerageFlat: number;
  readonly brokeragePct: number;
  readonly taxesPct: number;
};

export type SizingPolicy = {
  readonly method: PositionSizingMethod;
  readonly fixedRiskPct?: number; // default 0.01
  readonly fixedCapitalPct?: number;
  readonly volTargetAnnual?: number;
  readonly kellyFraction?: KellyFraction;
  readonly kellyCustom?: number; // 0..1
  readonly maxAllocationPerStrategy?: number; // 0..1
  readonly atrMultiple?: number;
};

export type PortfolioConfig = {
  readonly method: AllocationMethod;
  readonly customWeights?: Readonly<Record<string, number>>;
  readonly startingCapital: number;
  readonly sizingPolicy: SizingPolicy;
  readonly rebalancePolicy: RebalancePolicy;
  readonly constraints: PortfolioConstraints;
  readonly costs: CostModel;
  readonly rebalanceThreshold?: number;
  readonly volLookbackDays?: number;
};

export type PortfolioTrade = {
  readonly date: string;
  readonly assetId: string;
  readonly pnl: number;
  readonly scaledPnl: number;
};

export type PortfolioEquityPoint = {
  readonly date: string;
  readonly equity: number;
  readonly drawdown: number;
};

export type RiskContribution = {
  readonly assetId: string;
  readonly capitalPct: number;
  readonly volPct: number;
  readonly drawdownPct: number;
  readonly lossPct: number;
  readonly tailPct: number;
  readonly correlationPct: number;
};

export type AllocationResult = {
  readonly method: AllocationMethod;
  readonly allocations: readonly StrategyAllocation[];
  readonly rejected: readonly { assetId: string; reason: string }[];
  readonly normalized: boolean;
};

export type PortfolioMetrics = {
  readonly totalReturnPct: number;
  readonly netPnl: number;
  readonly cagr: number | null;
  readonly annualizedVol: number;
  readonly sharpe: number;
  readonly sortino: number;
  readonly calmar: number;
  readonly profitFactor: number;
  readonly expectancy: number;
  readonly maxDrawdown: number;
  readonly maxDrawdownPct: number;
  readonly recoveryFactor: number;
  readonly ulcerIndex: number;
  readonly var95: number;
  readonly cvar95: number;
  readonly tailLoss: number;
  readonly winningMonths: number;
  readonly losingMonths: number;
  readonly exposurePct: number;
  readonly capitalUtilization: number;
  readonly strategyConcentration: number; // HHI
  readonly instrumentConcentration: number;
  readonly diversificationRatio: number;
};

export type CorrelationMatrix = {
  readonly assetIds: readonly string[];
  readonly returns: ReadonlyArray<readonly number[]>;
  readonly drawdown: ReadonlyArray<readonly number[]>;
  readonly winLoss: ReadonlyArray<readonly number[]>;
  readonly simultaneousLossRate: number;
  readonly alignedObservations: number;
};

export type PortfolioWarning = {
  readonly code: string;
  readonly message: string;
  readonly severity: "info" | "warn" | "block";
};

export type PortfolioResearchResult = {
  readonly runId: string;
  readonly generatedAt: string;
  readonly config: PortfolioConfig;
  readonly candidateRunIds: readonly string[];
  readonly allocation: AllocationResult;
  readonly equityCurve: readonly PortfolioEquityPoint[];
  readonly drawdownCurve: readonly PortfolioEquityPoint[];
  readonly trades: readonly PortfolioTrade[];
  readonly metrics: PortfolioMetrics;
  readonly correlations: CorrelationMatrix;
  readonly riskContributions: readonly RiskContribution[];
  readonly concentration: {
    readonly hhiStrategy: number;
    readonly hhiInstrument: number;
    readonly hhiTimeframe: number;
  };
  readonly diversification: {
    readonly effectiveN: number;
    readonly diversificationRatio: number;
  };
  readonly warnings: readonly PortfolioWarning[];
  readonly blockingReasons: readonly string[];
  readonly disclaimer: string;
};

export const PORTFOLIO_DISCLAIMER =
  "PORTFOLIO RESEARCH ONLY — NOT A LIVE ALLOCATION INSTRUCTION. " +
  "Source trades are immutable. No production sizing changes. No broker integration.";

export const PORTFOLIO_RUN_ID_PREFIX = "PORTFOLIO_RESEARCH_V1";

export function defaultConstraints(): PortfolioConstraints {
  return {
    maxWeightPerStrategy: 0.4,
    maxWeightPerInstrument: 0.5,
    maxWeightPerTimeframe: 0.7,
    maxCorrelatedExposure: 0.75,
    minDiversificationCount: 2,
    maxLeverage: 1,
    maxPortfolioDrawdown: 0.35,
    minTradeCount: 20,
  };
}

export function defaultSizingPolicy(): SizingPolicy {
  return {
    method: "FIXED_RISK_PCT",
    fixedRiskPct: 0.01,
    kellyFraction: "QUARTER",
    maxAllocationPerStrategy: 0.4,
  };
}

export function defaultCostModel(): CostModel {
  return {
    slippagePct: 0,
    brokerageFlat: 0,
    brokeragePct: 0,
    taxesPct: 0,
  };
}