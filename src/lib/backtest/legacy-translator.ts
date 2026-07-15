// Phase 21.3d-parity-β1 · Pure, network-free translation layers.
//
// These translators reconstruct the existing public envelopes
// (`BacktestResult`, `HistoryResult`) from a unified `HistoricalBacktestResult`
// plus an explicit `Legacy*TranslationContext`. Everything not derivable from
// the unified envelope (per-trade astro metadata, insights, benchmark, cache
// provenance, precomputed core metrics, legacy Run ID, etc.) MUST arrive via
// the context. Translators never fetch data and never call any provider.
//
// Public functions (`runBacktest`, `runHistoricalValidation`) remain untouched
// in this phase. `runBacktestUnifiedDryRun` / `runHistoricalValidationUnifiedDryRun`
// are additive dry-run helpers used only by the β1 parity suite.
//
// Known preserved quirks (see α parity report):
//   • LEGACY_HASH_CONFIG_NESTED_KEY_ELISION — legacy hashConfig elides nested
//     `costs.*` fields. Translators keep this behavior; the fix is deferred.
//
// Any missing per-trade metadata throws the typed error
// `LEGACY_TRANSLATION_METADATA_MISSING`. Unknown unified error codes throw
// `LEGACY_ERROR_MAPPING_MISSING`. Neither leaks provider payloads or stacks.

import type {
  BacktestInsight,
  BacktestMonthly,
  BacktestResult,
  BacktestSummary,
  BacktestSymbol,
  BacktestTrade,
} from "../backtest.functions";
import type {
  HistoryPerSession,
  HistoryResult,
} from "../gann-intraday-history.functions";
import type { computeCoreMetrics } from "../gann-intraday-metrics";
import type { AmbiguousPolicy } from "../gann-intraday-simulator";
import type { InstrumentSymbol } from "../gann-intraday-anchor";
import type { AstroFormulaVersion } from "../engine-version";
import { GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION } from "../engine-version";
import type {
  CostModel,
  ExecutionPolicy,
  InvalidSetupPolicy,
  StatBundle,
} from "../backtest-engine";
import type { HistoricalBacktestResult, HistoricalTrade } from "./result";

// ─────────────────────────────────────────────────────────────────────────────
// Typed errors
// ─────────────────────────────────────────────────────────────────────────────

export class LegacyTranslationMetadataMissingError extends Error {
  readonly code = "LEGACY_TRANSLATION_METADATA_MISSING" as const;
  readonly tradeId: string | null;
  readonly field: string;
  constructor(field: string, tradeId: string | null = null) {
    super(
      `LEGACY_TRANSLATION_METADATA_MISSING: field=${field}${
        tradeId ? ` tradeId=${tradeId}` : ""
      }`,
    );
    this.tradeId = tradeId;
    this.field = field;
    this.name = "LegacyTranslationMetadataMissingError";
  }
}

export class LegacyErrorMappingMissingError extends Error {
  readonly code = "LEGACY_ERROR_MAPPING_MISSING" as const;
  readonly unifiedCode: string;
  constructor(unifiedCode: string) {
    super(`LEGACY_ERROR_MAPPING_MISSING: ${unifiedCode}`);
    this.unifiedCode = unifiedCode;
    this.name = "LegacyErrorMappingMissingError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BacktestResult translation
// ─────────────────────────────────────────────────────────────────────────────

/** Per-trade astro / execution metadata that unified trades don't carry. */
export type LegacyBacktestTradeExtras = {
  time: string;
  symbol: BacktestSymbol;
  strength: string;
  confidence: number;
  high: number | null;
  low: number | null;
  targetHit: boolean;
  stopHit: boolean;
  pnlPct: number;
  moonSign: string;
  moonNakshatra: string;
  retroCount: number;
  nearest: string | null;
  dayOfWeek: string;
  month: string;
  fabricatedLevels: boolean;
  astroTs: string;
  entryTs: string;
  exitTs: string;
  dataAvailableTs: string;
};

export type LegacyBacktestTranslationContext = {
  symbol: BacktestSymbol;
  yahooSymbol: string;
  label: string;
  candles: number;
  runId: string;
  engineVersion: string;
  formulaVersion: string;
  astroFormulaVersion: AstroFormulaVersion;
  configHash: string;
  executionMeta: BacktestResult["executionMeta"];
  dataQuality: BacktestResult["dataQuality"];
  benchmark: BacktestResult["benchmark"];
  insights: BacktestResult["insights"];
  disclaimers: readonly string[];
  monthly: readonly BacktestMonthly[];
  summarySentinels: {
    profitFactor: number;
    avgHoldingDays: number;
    maxConsecWins: number;
    maxConsecLosses: number;
    bestMonth: BacktestSummary["bestMonth"];
    worstMonth: BacktestSummary["worstMonth"];
  };
  stats: StatBundle;
  /** Keyed by unified trade id — MUST cover every unified trade. */
  tradeExtras: Readonly<Record<string, LegacyBacktestTradeExtras>>;
  generatedAt: string;
  /** Optional additive canonical ID from the unified runner. */
  unifiedRunId?: string;
};

function requireExtras(
  ctx: LegacyBacktestTranslationContext,
  trade: HistoricalTrade,
): LegacyBacktestTradeExtras {
  const extras = ctx.tradeExtras[trade.id];
  if (!extras) {
    throw new LegacyTranslationMetadataMissingError("tradeExtras", trade.id);
  }
  return extras;
}

function translateTrade(
  trade: HistoricalTrade,
  ctx: LegacyBacktestTranslationContext,
): BacktestTrade {
  const x = requireExtras(ctx, trade);
  const grossPnl =
    typeof trade.metadata["grossPnl"] === "number"
      ? (trade.metadata["grossPnl"] as number)
      : trade.pnl;
  const costs =
    typeof trade.metadata["costs"] === "number"
      ? (trade.metadata["costs"] as number)
      : 0;
  return {
    date: trade.date,
    time: x.time,
    symbol: x.symbol,
    signal: trade.side,
    strength: x.strength,
    confidence: x.confidence,
    entry: trade.entry,
    exit: trade.exit,
    high: x.high,
    low: x.low,
    target: trade.target,
    stop: trade.stop,
    targetHit: x.targetHit,
    stopHit: x.stopHit,
    result: trade.outcome,
    pnl: trade.pnl,
    pnlPct: x.pnlPct,
    moonSign: x.moonSign,
    moonNakshatra: x.moonNakshatra,
    retroCount: x.retroCount,
    nearest: x.nearest,
    dayOfWeek: x.dayOfWeek,
    month: x.month,
    ambiguous: trade.ambiguous,
    fabricatedLevels: x.fabricatedLevels,
    grossPnl,
    netPnl: trade.pnl,
    costs,
    astroTs: x.astroTs,
    entryTs: x.entryTs,
    exitTs: x.exitTs,
    dataAvailableTs: x.dataAvailableTs,
  };
}

function buildSummary(
  trades: readonly BacktestTrade[],
  ctx: LegacyBacktestTranslationContext,
  netProfit: number,
  maxDrawdown: number,
): BacktestSummary {
  let buy = 0;
  let sell = 0;
  let wait = 0;
  let wins = 0;
  let losses = 0;
  let flats = 0;
  let taken = 0;
  let profitSum = 0;
  let lossSum = 0;
  for (const t of trades) {
    if (t.signal === "BUY") buy += 1;
    else if (t.signal === "SELL") sell += 1;
    else wait += 1;
    if (t.result === "WIN") {
      wins += 1;
      taken += 1;
      profitSum += t.pnl;
    } else if (t.result === "LOSS") {
      losses += 1;
      taken += 1;
      lossSum += Math.abs(t.pnl);
    } else if (t.result === "FLAT") {
      flats += 1;
      taken += 1;
    }
  }
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 10000) / 100 : 0;
  const lossRate = decided > 0 ? Math.round((losses / decided) * 10000) / 100 : 0;
  const avgProfit = wins > 0 ? Math.round((profitSum / wins) * 100) / 100 : 0;
  const avgLoss = losses > 0 ? Math.round((lossSum / losses) * 100) / 100 : 0;
  return {
    totalSignals: trades.length,
    buy,
    sell,
    wait,
    taken,
    wins,
    losses,
    flats,
    winRate,
    lossRate,
    accuracy: winRate,
    avgProfit,
    avgLoss,
    profitFactor: ctx.summarySentinels.profitFactor,
    netProfit,
    maxDrawdown,
    maxConsecWins: ctx.summarySentinels.maxConsecWins,
    maxConsecLosses: ctx.summarySentinels.maxConsecLosses,
    avgHoldingDays: ctx.summarySentinels.avgHoldingDays,
    bestMonth: ctx.summarySentinels.bestMonth,
    worstMonth: ctx.summarySentinels.worstMonth,
  };
}

function buildEquityCurve(
  trades: readonly BacktestTrade[],
): { curve: BacktestResult["equityCurve"]; netProfit: number; maxDrawdown: number } {
  const curve: BacktestResult["equityCurve"] = [];
  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  for (const t of trades) {
    cum = Math.round((cum + t.pnl) * 100) / 100;
    peak = Math.max(peak, cum);
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
    curve.push({ date: t.date, cumulative: cum });
  }
  return { curve, netProfit: cum, maxDrawdown: maxDD };
}

export type ToLegacyBacktestArgs = {
  unifiedResult: HistoricalBacktestResult;
  legacyContext: LegacyBacktestTranslationContext;
};

/**
 * Pure translator: HistoricalBacktestResult → BacktestResult.
 * Throws LegacyTranslationMetadataMissingError if any trade lacks legacy extras.
 */
export function toLegacyBacktestResult(
  args: ToLegacyBacktestArgs,
): BacktestResult {
  const { unifiedResult, legacyContext } = args;
  const legacyTrades: BacktestTrade[] = unifiedResult.trades.map((t) =>
    translateTrade(t, legacyContext),
  );
  const { curve, netProfit, maxDrawdown } = buildEquityCurve(legacyTrades);
  const summary = buildSummary(legacyTrades, legacyContext, netProfit, maxDrawdown);
  let ambiguousCount = 0;
  let invalidSetupCount = 0;
  for (const t of legacyTrades) {
    if (t.ambiguous) ambiguousCount += 1;
    if (t.result === "INVALID_SETUP") invalidSetupCount += 1;
  }
  return {
    symbol: legacyContext.symbol,
    yahooSymbol: legacyContext.yahooSymbol,
    label: legacyContext.label,
    from: unifiedResult.from,
    to: unifiedResult.to,
    candles: legacyContext.candles,
    trades: legacyTrades,
    summary,
    monthly: [...legacyContext.monthly],
    insights: legacyContext.insights,
    equityCurve: curve,
    generatedAt: legacyContext.generatedAt,
    runId: legacyContext.runId,
    engineVersion: legacyContext.engineVersion,
    formulaVersion: legacyContext.formulaVersion,
    astroFormulaVersion: legacyContext.astroFormulaVersion,
    configHash: legacyContext.configHash,
    executionMeta: legacyContext.executionMeta,
    dataQuality: legacyContext.dataQuality,
    stats: legacyContext.stats,
    benchmark: legacyContext.benchmark,
    ambiguousCount,
    invalidSetupCount,
    disclaimers: [...legacyContext.disclaimers],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HistoryResult translation
// ─────────────────────────────────────────────────────────────────────────────

export type LegacyHistoryTranslationContext = {
  version: typeof GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION;
  runId: string;
  instrument: InstrumentSymbol;
  months: number;
  ambiguousPolicy: AmbiguousPolicy;
  attempted: number;
  loaded: number;
  failed: number;
  sessionsSummary: readonly HistoryPerSession[];
  metrics: ReturnType<typeof computeCoreMetrics>;
  causalityFailures: number;
  generatedAt: string;
  /** Additive; not part of the public envelope. */
  unifiedRunId?: string;
};

export type ToLegacyHistoryArgs = {
  unifiedResult: HistoricalBacktestResult;
  sessions: readonly HistoryPerSession[];
  legacyContext: LegacyHistoryTranslationContext;
};

/**
 * Pure translator: HistoricalBacktestResult → HistoryResult.
 * Session rows and core metrics are consumed as-is (no re-derivation) to
 * preserve `computeCoreMetrics` semantics and the VALIDATION_ONLY label.
 */
export function toLegacyHistoryResult(
  args: ToLegacyHistoryArgs,
): HistoryResult {
  const { unifiedResult, sessions, legacyContext } = args;
  // Cross-check attempted vs. sessions length; refuse silent mismatch.
  if (legacyContext.attempted !== sessions.length) {
    throw new LegacyTranslationMetadataMissingError(
      "attempted!=sessionsSummary.length",
    );
  }
  return {
    version: legacyContext.version,
    runId: legacyContext.runId,
    instrument: legacyContext.instrument,
    months: legacyContext.months,
    from: unifiedResult.from,
    to: unifiedResult.to,
    ambiguousPolicy: legacyContext.ambiguousPolicy,
    attempted: legacyContext.attempted,
    loaded: legacyContext.loaded,
    failed: legacyContext.failed,
    sessionsSummary: [...sessions],
    metrics: legacyContext.metrics,
    causalityFailures: legacyContext.causalityFailures,
    labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
    generatedAt: legacyContext.generatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical unified error codes recognised by the legacy translator. */
export const UNIFIED_ERROR_CODES = [
  "INVALID_DATE_RANGE",
  "UNSUPPORTED_SYMBOL",
  "PROVIDER_UNAVAILABLE",
  "NO_DATA",
  "INVALID_OHLC",
  "MISSING_PREVIOUS_CLOSE",
  "INSUFFICIENT_INTRADAY_HISTORY",
  "CAUSALITY_VIOLATION",
  "MIXED_FORMULA_VERSIONS",
] as const;
export type UnifiedErrorCode = (typeof UNIFIED_ERROR_CODES)[number];

const LEGACY_MESSAGES: Record<UnifiedErrorCode, string> = {
  INVALID_DATE_RANGE: "Invalid date range: 'from' must be <= 'to'.",
  UNSUPPORTED_SYMBOL: "Unsupported symbol for this backtest formula.",
  PROVIDER_UNAVAILABLE:
    "Historical data provider is temporarily unavailable. Please retry.",
  NO_DATA: "No historical data available for the selected range.",
  INVALID_OHLC: "Historical OHLC failed validation and cannot be replayed.",
  MISSING_PREVIOUS_CLOSE:
    "Missing previous-session close required to anchor the session.",
  INSUFFICIENT_INTRADAY_HISTORY:
    "Insufficient intraday history to validate this session.",
  CAUSALITY_VIOLATION:
    "Causality violation detected — a trade was resolved before its own signal timestamp.",
  MIXED_FORMULA_VERSIONS:
    "Requested run mixes incompatible formula versions.",
};

export function mapUnifiedErrorToLegacy(code: string): Error {
  if (!(UNIFIED_ERROR_CODES as readonly string[]).includes(code)) {
    throw new LegacyErrorMappingMissingError(code);
  }
  return new Error(LEGACY_MESSAGES[code as UnifiedErrorCode]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dry-run wrappers (β1 parity only — NOT production public functions)
// ─────────────────────────────────────────────────────────────────────────────

export type BacktestUnifiedDryRunArgs = ToLegacyBacktestArgs;

/**
 * Dry-run: apply the BacktestResult translator to an already-computed unified
 * result. β1 uses this against golden fixtures. β2 will replace it with a
 * call into the unified runner.
 */
export function runBacktestUnifiedDryRun(
  args: BacktestUnifiedDryRunArgs,
): BacktestResult {
  return toLegacyBacktestResult(args);
}

export type HistoryUnifiedDryRunArgs = ToLegacyHistoryArgs;

export function runHistoricalValidationUnifiedDryRun(
  args: HistoryUnifiedDryRunArgs,
): HistoryResult {
  return toLegacyHistoryResult(args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for legacy public types the parity suite references.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  CostModel,
  ExecutionPolicy,
  InvalidSetupPolicy,
};