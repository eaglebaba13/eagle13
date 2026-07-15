// Phase 21.3d-parity-β1 · Translator parity suite.
//
// Reconstructs the α golden envelopes (`BACKTEST_GOLDEN`, `HISTORY_GOLDEN`)
// from a synthetic unified `HistoricalBacktestResult` plus the explicit
// legacy context. Passing means the translator can round-trip production
// output exactly — the pre-condition for β2 replacing `runBacktest` /
// `runHistoricalValidation` with wrappers.

import { describe, expect, it } from "vitest";
import {
  BACKTEST_GOLDEN,
  BACKTEST_GOLDEN_INPUT,
} from "../__fixtures__/parity/backtest-golden";
import {
  HISTORY_GOLDEN,
  HISTORY_GOLDEN_INPUT,
} from "../__fixtures__/parity/history-golden";
import {
  LegacyErrorMappingMissingError,
  LegacyTranslationMetadataMissingError,
  mapUnifiedErrorToLegacy,
  runBacktestUnifiedDryRun,
  runHistoricalValidationUnifiedDryRun,
  toLegacyBacktestResult,
  toLegacyHistoryResult,
  UNIFIED_ERROR_CODES,
  type LegacyBacktestTradeExtras,
  type LegacyBacktestTranslationContext,
  type LegacyHistoryTranslationContext,
} from "../backtest/legacy-translator";
import type { HistoricalBacktestResult, HistoricalTrade } from "../backtest/result";
import { GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION } from "../engine-version";
import type { BacktestTrade } from "../backtest.functions";

// ─── Synthetic unified result + context assembled from the golden ───────────

function unifiedTradeFromLegacy(t: BacktestTrade, i: number): HistoricalTrade {
  return {
    id: `t${i}`,
    date: t.date,
    side: t.signal,
    entry: t.entry,
    stop: t.stop,
    target: t.target,
    exit: t.exit,
    outcome: t.result,
    pnl: t.pnl,
    mfe: null,
    mae: null,
    holdingTime: null,
    formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
    source: BACKTEST_GOLDEN_INPUT.dataSource,
    ambiguous: !!t.ambiguous,
    reasons: [],
    metadata: {
      grossPnl: t.grossPnl ?? t.pnl,
      costs: t.costs ?? 0,
    },
  };
}

function extrasFromLegacy(t: BacktestTrade): LegacyBacktestTradeExtras {
  return {
    time: t.time,
    symbol: t.symbol,
    strength: t.strength,
    confidence: t.confidence,
    high: t.high,
    low: t.low,
    targetHit: t.targetHit,
    stopHit: t.stopHit,
    pnlPct: t.pnlPct,
    moonSign: t.moonSign,
    moonNakshatra: t.moonNakshatra,
    retroCount: t.retroCount,
    nearest: t.nearest,
    dayOfWeek: t.dayOfWeek,
    month: t.month,
    fabricatedLevels: !!t.fabricatedLevels,
    astroTs: t.astroTs!,
    entryTs: t.entryTs!,
    exitTs: t.exitTs!,
    dataAvailableTs: t.dataAvailableTs!,
  };
}

function buildBacktestFixture(): {
  unifiedResult: HistoricalBacktestResult;
  legacyContext: LegacyBacktestTranslationContext;
} {
  const unifiedTrades = BACKTEST_GOLDEN.trades.map((t, i) =>
    unifiedTradeFromLegacy(t, i),
  );
  const tradeExtras: Record<string, LegacyBacktestTradeExtras> = {};
  BACKTEST_GOLDEN.trades.forEach((t, i) => {
    tradeExtras[`t${i}`] = extrasFromLegacy(t);
  });
  const unifiedResult: HistoricalBacktestResult = {
    formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
    engineVersion: BACKTEST_GOLDEN.engineVersion,
    executionVersion: "n/a",
    cubeVersion: "n/a",
    policyVersion: "n/a",
    runId: "GANN_SIGN_DEGREE_TABLE_V1_1:deadbeef",
    generatedAt: BACKTEST_GOLDEN.generatedAt,
    instrument: BACKTEST_GOLDEN.symbol,
    from: BACKTEST_GOLDEN.from,
    to: BACKTEST_GOLDEN.to,
    dataGranularity: "1d",
    source: BACKTEST_GOLDEN_INPUT.dataSource,
    dataQuality: null,
    trades: unifiedTrades,
    stats: {},
    monthly: [],
    equityCurve: [],
    drawdown: null,
    benchmark: null,
    methodology: "",
    disclaimers: [],
    formulaMeta: {},
  };
  const legacyContext: LegacyBacktestTranslationContext = {
    symbol: BACKTEST_GOLDEN.symbol,
    yahooSymbol: BACKTEST_GOLDEN.yahooSymbol,
    label: BACKTEST_GOLDEN.label,
    candles: BACKTEST_GOLDEN.candles,
    runId: BACKTEST_GOLDEN.runId,
    engineVersion: BACKTEST_GOLDEN.engineVersion,
    formulaVersion: BACKTEST_GOLDEN.formulaVersion,
    astroFormulaVersion: BACKTEST_GOLDEN.astroFormulaVersion,
    configHash: BACKTEST_GOLDEN.configHash,
    executionMeta: BACKTEST_GOLDEN.executionMeta,
    dataQuality: BACKTEST_GOLDEN.dataQuality,
    benchmark: BACKTEST_GOLDEN.benchmark,
    insights: BACKTEST_GOLDEN.insights,
    disclaimers: BACKTEST_GOLDEN.disclaimers,
    monthly: BACKTEST_GOLDEN.monthly,
    summarySentinels: {
      profitFactor: BACKTEST_GOLDEN.summary.profitFactor,
      avgHoldingDays: BACKTEST_GOLDEN.summary.avgHoldingDays,
      maxConsecWins: BACKTEST_GOLDEN.summary.maxConsecWins,
      maxConsecLosses: BACKTEST_GOLDEN.summary.maxConsecLosses,
      bestMonth: BACKTEST_GOLDEN.summary.bestMonth,
      worstMonth: BACKTEST_GOLDEN.summary.worstMonth,
    },
    stats: BACKTEST_GOLDEN.stats,
    tradeExtras,
    generatedAt: BACKTEST_GOLDEN.generatedAt,
  };
  return { unifiedResult, legacyContext };
}

describe("β1 · toLegacyBacktestResult reconstructs BACKTEST_GOLDEN exactly", () => {
  it("dry-run wrapper output equals the α golden envelope", () => {
    const { unifiedResult, legacyContext } = buildBacktestFixture();
    const out = runBacktestUnifiedDryRun({ unifiedResult, legacyContext });
    expect(out).toEqual(BACKTEST_GOLDEN);
  });

  it("public runId is preserved verbatim (legacy hashConfig quirk intact)", () => {
    const { unifiedResult, legacyContext } = buildBacktestFixture();
    const out = toLegacyBacktestResult({ unifiedResult, legacyContext });
    expect(out.runId).toBe(BACKTEST_GOLDEN.runId);
    expect(out.configHash).toBe(BACKTEST_GOLDEN.configHash);
  });

  it("ambiguous + invalid-setup counters derived from trades", () => {
    const { unifiedResult, legacyContext } = buildBacktestFixture();
    const out = toLegacyBacktestResult({ unifiedResult, legacyContext });
    expect(out.ambiguousCount).toBe(1);
    expect(out.invalidSetupCount).toBe(0);
  });

  it("throws LEGACY_TRANSLATION_METADATA_MISSING when a trade lacks extras", () => {
    const { unifiedResult, legacyContext } = buildBacktestFixture();
    const broken: LegacyBacktestTranslationContext = {
      ...legacyContext,
      tradeExtras: {},
    };
    expect(() =>
      toLegacyBacktestResult({ unifiedResult, legacyContext: broken }),
    ).toThrow(LegacyTranslationMetadataMissingError);
  });

  it("translator is deterministic — same inputs → identical output", () => {
    const a = runBacktestUnifiedDryRun(buildBacktestFixture());
    const b = runBacktestUnifiedDryRun(buildBacktestFixture());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ─── HistoryResult ──────────────────────────────────────────────────────────

function buildHistoryFixture(): {
  unifiedResult: HistoricalBacktestResult;
  legacyContext: LegacyHistoryTranslationContext;
} {
  const unifiedResult: HistoricalBacktestResult = {
    formulaVersion: "GANN_ASTRO_INTRADAY_ABSOLUTE_V1",
    engineVersion: "n/a",
    executionVersion: "n/a",
    cubeVersion: "n/a",
    policyVersion: "n/a",
    runId: "GANN_ASTRO_INTRADAY_ABSOLUTE_V1:deadbeef",
    generatedAt: HISTORY_GOLDEN.generatedAt,
    instrument: HISTORY_GOLDEN.instrument,
    from: HISTORY_GOLDEN.from,
    to: HISTORY_GOLDEN.to,
    dataGranularity: "5m",
    source: "n/a",
    dataQuality: null,
    trades: [],
    stats: {},
    monthly: [],
    equityCurve: [],
    drawdown: null,
    benchmark: null,
    methodology: "",
    disclaimers: [],
    formulaMeta: {},
  };
  const legacyContext: LegacyHistoryTranslationContext = {
    version: GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
    runId: HISTORY_GOLDEN.runId,
    instrument: HISTORY_GOLDEN.instrument,
    months: HISTORY_GOLDEN.months,
    ambiguousPolicy: HISTORY_GOLDEN.ambiguousPolicy,
    attempted: HISTORY_GOLDEN.attempted,
    loaded: HISTORY_GOLDEN.loaded,
    failed: HISTORY_GOLDEN.failed,
    sessionsSummary: HISTORY_GOLDEN.sessionsSummary,
    metrics: HISTORY_GOLDEN.metrics,
    causalityFailures: HISTORY_GOLDEN.causalityFailures,
    generatedAt: HISTORY_GOLDEN.generatedAt,
  };
  return { unifiedResult, legacyContext };
}

describe("β1 · toLegacyHistoryResult reconstructs HISTORY_GOLDEN exactly", () => {
  it("dry-run wrapper output equals the α golden envelope", () => {
    const { unifiedResult, legacyContext } = buildHistoryFixture();
    const out = runHistoricalValidationUnifiedDryRun({
      unifiedResult,
      sessions: HISTORY_GOLDEN.sessionsSummary,
      legacyContext,
    });
    expect(out).toEqual(HISTORY_GOLDEN);
  });

  it("labeledAs is preserved as the exact validation constant", () => {
    const { unifiedResult, legacyContext } = buildHistoryFixture();
    const out = toLegacyHistoryResult({
      unifiedResult,
      sessions: HISTORY_GOLDEN.sessionsSummary,
      legacyContext,
    });
    expect(out.labeledAs).toBe("VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION");
  });

  it("computeCoreMetrics output flows through verbatim (22 fields)", () => {
    const { unifiedResult, legacyContext } = buildHistoryFixture();
    const out = toLegacyHistoryResult({
      unifiedResult,
      sessions: HISTORY_GOLDEN.sessionsSummary,
      legacyContext,
    });
    expect(out.metrics).toEqual(HISTORY_GOLDEN.metrics);
    expect(Object.keys(out.metrics).length).toBe(22);
  });

  it("attempted / sessionsSummary length mismatch is rejected", () => {
    const { unifiedResult, legacyContext } = buildHistoryFixture();
    expect(() =>
      toLegacyHistoryResult({
        unifiedResult,
        sessions: HISTORY_GOLDEN.sessionsSummary.slice(0, 1),
        legacyContext,
      }),
    ).toThrow(LegacyTranslationMetadataMissingError);
  });

  it("input echoes months exactly (no drift from golden)", () => {
    expect(HISTORY_GOLDEN.months).toBe(HISTORY_GOLDEN_INPUT.months);
  });
});

// ─── Error mapping ──────────────────────────────────────────────────────────

describe("β1 · unified→legacy error mapping is total for known codes", () => {
  it("every UNIFIED_ERROR_CODES entry maps to a non-empty legacy Error", () => {
    for (const code of UNIFIED_ERROR_CODES) {
      const err = mapUnifiedErrorToLegacy(code);
      expect(err).toBeInstanceOf(Error);
      expect(err.message.length).toBeGreaterThan(0);
      // Never leaks internal code
      expect(err.message.includes("Provider payload")).toBe(false);
    }
  });
  it("unknown code throws LEGACY_ERROR_MAPPING_MISSING", () => {
    expect(() => mapUnifiedErrorToLegacy("SOMETHING_WEIRD")).toThrow(
      LegacyErrorMappingMissingError,
    );
  });
});

// ─── No network / no re-fetch import-graph audit ───────────────────────────

describe("β1 · translator has zero network / provider dependencies", () => {
  it("legacy-translator source does not import network or provider modules", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(__dirname, "../backtest/legacy-translator.ts"),
      "utf8",
    );
    // Fully banned: any reference at all.
    expect(/from\s+["'][^"']*\/http["']/.test(src)).toBe(false);
    expect(/from\s+["'][^"']*\/providers["']/.test(src)).toBe(false);
    expect(/from\s+["'][^"']*\.server["']/.test(src)).toBe(false);
    expect(/\bfetchJson\b/.test(src)).toBe(false);
    expect(/YahooChartSchema/.test(src)).toBe(false);
    // `.functions` / `.server` type imports are allowed ONLY as `import type`.
    // Match every import block and reject non-type imports from banned paths.
    const importBlocks = src.match(/import[\s\S]*?from\s+["'][^"']+["'];?/g) ?? [];
    for (const block of importBlocks) {
      if (/["'][^"']*\.functions["']/.test(block)) {
        expect(block.startsWith("import type")).toBe(true);
      }
    }
  });
});