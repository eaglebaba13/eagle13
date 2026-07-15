// Phase 21.3 · Unified historical backtest — canonical result & trade schemas.
// These types are the common contract every formula adapter maps into. Formula-
// specific fields live inside `metadata` (per-trade) and `formulaMeta` (per-run)
// so adapters never have to fabricate fields that don't apply to their engine.

import type { IntradayFormulaVersion } from "../engine-version";

export type UnifiedFormulaId = IntradayFormulaVersion;

export type DataGranularity = "1d" | "5m";

export type CausalityMode = "daily" | "intraday-5m";

export type TradeSide = "BUY" | "SELL";

export type TradeOutcome =
  | "WIN"
  | "LOSS"
  | "FLAT"
  | "SKIP"
  | "AMBIGUOUS"
  | "INVALID_SETUP";

export type HistoricalTrade = {
  id: string;
  date: string;
  side: TradeSide | "WAIT";
  entry: number | null;
  stop: number | null;
  target: number | null;
  exit: number | null;
  outcome: TradeOutcome;
  pnl: number;
  mfe: number | null;
  mae: number | null;
  holdingTime: number | null; // minutes; null when unknown
  formulaVersion: UnifiedFormulaId;
  source: string;
  ambiguous: boolean;
  reasons: readonly string[];
  /** Adapter-specific extras. Never inspected by shared code. */
  metadata: Readonly<Record<string, unknown>>;
};

export type DataQualitySummary = {
  provider: string;
  granularity: DataGranularity;
  coveragePct: number;
  missingSessions: number;
  invalidCandles: number;
  imported: number;
  fetched: number;
  previousCloseSource: string;
  snapshotSource: string;
  cacheStatus: "hit" | "miss" | "partial" | "n/a";
};

export type EquityPoint = { date: string; equity: number };

export type MonthlyRow = {
  month: string; // YYYY-MM
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
};

export type HistoricalBacktestResult = {
  formulaVersion: UnifiedFormulaId;
  engineVersion: string;
  executionVersion: string;
  cubeVersion: string;
  policyVersion: string;
  runId: string;
  generatedAt: string;
  instrument: string;
  from: string;
  to: string;
  dataGranularity: DataGranularity;
  source: string;
  dataQuality: DataQualitySummary | null;
  trades: readonly HistoricalTrade[];
  stats: Record<string, unknown>;
  monthly: readonly MonthlyRow[];
  equityCurve: readonly EquityPoint[];
  drawdown: { max: number; maxPct: number } | null;
  benchmark: Record<string, unknown> | null;
  methodology: string;
  disclaimers: readonly string[];
  /** Adapter-specific per-run metadata (safe/risky, cube grades, planet stats). */
  formulaMeta: Readonly<Record<string, unknown>>;
};
