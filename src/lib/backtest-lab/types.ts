// Phase 3G — Backtest Lab canonical types.
// Research-only. Consumer of canonical signals. No live trading, no
// broker integration, no formula mutation, no eval, no `any`.

export const BACKTEST_LAB_SCHEMA_VERSION = 1;
export const BACKTEST_LAB_DISCLAIMER =
  "BACKTEST LAB · RESEARCH ONLY — historical backtest results do not guarantee future performance. " +
  "Deterministic canonical-signal simulation. No live orders. No broker execution.";

// ─── Signal families (canonical consumers only) ─────────────────────
export type SignalFamily =
  | "DECISION"
  | "GTI"
  | "PCR"
  | "BREADTH"
  | "GANN_GAP"
  | "ASTRO"
  | "SMART_ALERT"
  | "INSTITUTIONAL_FLOW"
  | "OPTION_STRATEGY"
  | "RESEARCH_LAB";

export type ComparisonOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "GREATER_OR_EQUAL"
  | "LESS_OR_EQUAL"
  | "IN"
  | "NOT_IN"
  | "EXISTS";

export type LogicalOperator = "AND" | "OR" | "NOT";

export type SignalValue = string | number | boolean | null;

export interface ConditionLeaf {
  readonly kind: "LEAF";
  readonly family: SignalFamily;
  readonly field: string;
  readonly operator: ComparisonOperator;
  readonly value?: SignalValue | readonly SignalValue[];
}

export interface ConditionGroup {
  readonly kind: "GROUP";
  readonly operator: LogicalOperator;
  readonly children: ReadonlyArray<ConditionGroup | ConditionLeaf>;
}

export type ConditionNode = ConditionLeaf | ConditionGroup;

// ─── Entry / Exit rules ─────────────────────────────────────────────
export type EntryRuleType =
  | "NEXT_BAR_OPEN"
  | "NEXT_BAR_CLOSE"
  | "SIGNAL_BAR_CLOSE"
  | "STOP_ABOVE_HIGH"
  | "STOP_BELOW_LOW"
  | "LIMIT_AT_LEVEL"
  | "SESSION_OPEN"
  | "TIME_ENTRY"
  | "GAP_OPEN";

export interface EntryRule {
  readonly type: EntryRuleType;
  readonly limitOffset?: number;
  readonly time?: string;
}

export type ExitRuleType =
  | "FIXED_TARGET"
  | "FIXED_STOP"
  | "RR_TARGET"
  | "PCT_TARGET"
  | "PCT_STOP"
  | "ATR_STOP"
  | "TRAILING_STOP"
  | "BREAK_EVEN"
  | "TIME_EXIT"
  | "SESSION_EXIT"
  | "OPPOSITE_SIGNAL"
  | "MAX_HOLDING"
  | "MANUAL";

export interface ExitRules {
  readonly stopType: "FIXED" | "PCT" | "ATR" | "NONE";
  readonly stopValue?: number;
  readonly targetType: "FIXED" | "PCT" | "RR" | "NONE";
  readonly targetValue?: number;
  readonly trailingType?: "NONE" | "FIXED" | "PCT";
  readonly trailingValue?: number;
  readonly maxHoldingBars?: number;
  readonly sameBarPolicy: "CONSERVATIVE_STOP_FIRST" | "TARGET_FIRST" | "AMBIGUOUS";
  readonly exitOnOppositeSignal?: boolean;
}

export type PositionSizingMethod =
  | "FIXED_QTY"
  | "FIXED_CAPITAL"
  | "FIXED_RISK"
  | "PCT_CAPITAL"
  | "VOL_ADJUSTED"
  | "ATR_RISK"
  | "FRACTIONAL_KELLY";

export interface PositionSizing {
  readonly method: PositionSizingMethod;
  readonly fixedQty?: number;
  readonly fixedCapital?: number;
  readonly riskPerTrade?: number;      // rupees / base ccy
  readonly pctCapital?: number;         // 0..1
  readonly kellyFraction?: number;      // 0..1, capped
  readonly lotSize?: number;
  readonly minQty?: number;
  readonly contractMultiplier?: number;
}

export interface CostModel {
  readonly kind:
    | "ZERO"
    | "FIXED_PER_TRADE"
    | "PCT"
    | "MAKER_TAKER"
    | "BROKERAGE_TAXES"
    | "CUSTOM";
  readonly perTrade?: number;
  readonly pct?: number;
  readonly makerBps?: number;
  readonly takerBps?: number;
  readonly taxesPct?: number;
  readonly version: string;
  readonly placeholder?: boolean;
}

export interface SlippageModel {
  readonly kind: "ZERO" | "FIXED_POINTS" | "PCT" | "BID_ASK";
  readonly points?: number;
  readonly pct?: number;
  readonly version: string;
  readonly placeholder?: boolean;
}

export interface RiskLimits {
  readonly maxRiskPerTrade?: number;
  readonly maxDailyLoss?: number;
  readonly maxOpenPositions?: number;
  readonly maxPortfolioExposure?: number;
  readonly maxSymbolExposure?: number;
  readonly maxDrawdownStop?: number;
  readonly cooldownAfterLosses?: number;
}

export type AssetClass = "EQUITY_INDEX" | "EQUITY" | "CRYPTO" | "TOKENIZED_METAL";

export interface StrategyDefinition {
  readonly schemaVersion: typeof BACKTEST_LAB_SCHEMA_VERSION;
  readonly strategyId: string;
  readonly name: string;
  readonly description: string;
  readonly universe: readonly string[];
  readonly assetClass: AssetClass;
  readonly timeframe: string;
  readonly datasetId: string;
  readonly datasetHash: string;
  readonly from: string;
  readonly to: string;
  readonly conditions: ConditionGroup;
  readonly direction: "LONG" | "SHORT" | "BOTH";
  readonly entry: EntryRule;
  readonly exit: ExitRules;
  readonly sizing: PositionSizing;
  readonly capital: number;
  readonly risk: RiskLimits;
  readonly costs: CostModel;
  readonly slippage: SlippageModel;
  readonly sessionRules?: {
    readonly session24x7?: boolean;
    readonly sessionOpen?: string;
    readonly sessionClose?: string;
  };
  readonly formulaVersions: Readonly<Record<string, string>>;
  readonly researchOnly: true;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Simulation inputs / outputs ────────────────────────────────────
export interface HistoricalCandle {
  readonly ts: string;            // ISO timestamp of the bar close
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number | null;
  readonly atr?: number | null;
  readonly signalSnapshot?: Readonly<Record<string, SignalValue>> | null;
  readonly valid?: boolean;       // false → drop for execution
}

export type TradeExitReason =
  | "TARGET"
  | "STOP"
  | "TRAILING_STOP"
  | "BREAK_EVEN"
  | "TIME_EXIT"
  | "SESSION_EXIT"
  | "OPPOSITE_SIGNAL"
  | "MAX_HOLDING"
  | "END_OF_DATA"
  | "AMBIGUOUS_BAR";

export interface SimulatedTrade {
  readonly tradeId: string;
  readonly strategyId: string;
  readonly symbol: string;
  readonly direction: "LONG" | "SHORT";
  readonly entryTs: string;
  readonly exitTs: string;
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly stop: number | null;
  readonly target: number | null;
  readonly grossPnl: number;
  readonly netPnl: number;
  readonly returnPct: number;
  readonly fees: number;
  readonly slippage: number;
  readonly mfe: number;
  readonly mae: number;
  readonly holdingBars: number;
  readonly entryReason: string;
  readonly exitReason: TradeExitReason;
  readonly ambiguous: boolean;
  readonly warnings: readonly string[];
}

export interface EquityPoint {
  readonly ts: string;
  readonly equity: number;
  readonly drawdown: number;
}

export interface PerformanceMetrics {
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly breakevens: number;
  readonly winRate: number;
  readonly lossRate: number;
  readonly grossProfit: number;
  readonly grossLoss: number;
  readonly netProfit: number;
  readonly netReturnPct: number;
  readonly cagr: number | null;
  readonly avgTrade: number;
  readonly medianTrade: number;
  readonly avgWin: number;
  readonly avgLoss: number;
  readonly largestWin: number;
  readonly largestLoss: number;
  readonly profitFactor: number | null;
  readonly payoffRatio: number | null;
  readonly expectancy: number;
  readonly sharpe: number | null;
  readonly sortino: number | null;
  readonly calmar: number | null;
  readonly recoveryFactor: number | null;
  readonly maxDrawdown: number;
  readonly maxDrawdownPct: number;
  readonly drawdownDurationBars: number;
  readonly exposurePct: number;
  readonly avgHoldingBars: number;
  readonly longestWinStreak: number;
  readonly longestLossStreak: number;
  readonly ulcerIndex: number | null;
  readonly sampleWarning: "OK" | "SMALL_SAMPLE" | "INSUFFICIENT_SAMPLE";
}

export interface MonteCarloSummary {
  readonly iterations: number;
  readonly seed: number;
  readonly finalEquityP05: number;
  readonly finalEquityP50: number;
  readonly finalEquityP95: number;
  readonly maxDrawdownP05: number;
  readonly maxDrawdownP50: number;
  readonly maxDrawdownP95: number;
  readonly probLoss: number;
  readonly probExceedsDrawdown: number | null;
  readonly drawdownThreshold: number | null;
}

export interface WalkForwardSplitSummary {
  readonly splitIndex: number;
  readonly train: { from: string; to: string; trades: number };
  readonly validation: { from: string; to: string; trades: number; metrics: PerformanceMetrics };
}

export interface WalkForwardSummary {
  readonly mode: "EXPANDING" | "ROLLING";
  readonly splits: readonly WalkForwardSplitSummary[];
  readonly aggregate: PerformanceMetrics;
  readonly leakageDetected: boolean;
}

export interface DataQualityReport {
  readonly totalBars: number;
  readonly droppedBars: number;
  readonly invalidBars: number;
  readonly gaps: number;
  readonly warnings: readonly string[];
}

export interface BacktestRunReport {
  readonly schemaVersion: typeof BACKTEST_LAB_SCHEMA_VERSION;
  readonly runId: string;
  readonly strategyId: string;
  readonly generatedAt: string;
  readonly manifest: {
    readonly datasetId: string;
    readonly datasetHash: string;
    readonly symbol: string;
    readonly timeframe: string;
    readonly from: string;
    readonly to: string;
    readonly capital: number;
    readonly costModelVersion: string;
    readonly slippageModelVersion: string;
    readonly formulaVersions: Readonly<Record<string, string>>;
    readonly researchOnly: true;
  };
  readonly trades: readonly SimulatedTrade[];
  readonly equityCurve: readonly EquityPoint[];
  readonly metrics: PerformanceMetrics;
  readonly dataQuality: DataQualityReport;
  readonly monteCarlo: MonteCarloSummary | null;
  readonly walkForward: WalkForwardSummary | null;
  readonly warnings: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly disclaimer: string;
}

// ─── Signal snapshot resolver (dictionary access) ───────────────────
export function resolveField(
  snapshot: Readonly<Record<string, SignalValue>> | null | undefined,
  family: SignalFamily,
  field: string,
): SignalValue | undefined {
  if (!snapshot) return undefined;
  const key = `${family}.${field}`;
  if (Object.prototype.hasOwnProperty.call(snapshot, key)) return snapshot[key];
  if (Object.prototype.hasOwnProperty.call(snapshot, field)) return snapshot[field];
  return undefined;
}