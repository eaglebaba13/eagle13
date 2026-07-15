// Phase 21.3c · HistoricalStrategyAdapter — strategy-level abstraction.
//
// Strategy adapters wrap one or more FormulaAdapters (21.3b) and describe
// which instruments, timeframes, and formula versions the strategy supports.
// Only Astro is executable in this phase; SMC / Baseline / Hybrid are typed
// placeholders that surface a typed error until their engines are wired.

import { INTRADAY_FORMULA_VERSIONS } from "../engine-version";
import type { HistoricalFormulaAdapter } from "./adapter";
import type { DataGranularity, UnifiedFormulaId } from "./result";
import { absoluteIntradayHistoricalAdapter } from "./adapters/absolute-intraday.adapter";
import {
  legacyHistoricalAdapter,
  signDegreeHistoricalAdapter,
} from "./adapters/daily-astro.adapter";
import {
  SMC_STRATEGY_NOT_IMPLEMENTED,
  analyzeSmc,
  type SmcEngineResult,
} from "../smc-engine";
import {
  SMC_SIGNAL_ENGINE_READY,
  analyzeSmcSignals,
  type SmcSignalEngineReady,
  type SmcSignalResult,
} from "../smc-signal-engine";

export type StrategyId = "ASTRO" | "SMC" | "ASTRO_SMC_HYBRID" | "BASELINE";

export type StrategyAvailability = "AVAILABLE" | "COMING_NEXT";

export type HistoricalStrategyAdapter = {
  strategyId: StrategyId;
  label: string;
  availability: StrategyAvailability;
  supportedFormulaVersions: readonly UnifiedFormulaId[];
  supportedInstruments: readonly string[];
  supportedTimeframes: readonly DataGranularity[];
  defaultFormulaVersion: UnifiedFormulaId | null;
  /** Returns the formula adapter for a given formula version, or null. */
  resolveFormulaAdapter(formula: UnifiedFormulaId): HistoricalFormulaAdapter | null;
  methodology: string;
};

const ASTRO_FORMULA_ADAPTERS: ReadonlyArray<HistoricalFormulaAdapter> = [
  signDegreeHistoricalAdapter,
  legacyHistoricalAdapter,
  absoluteIntradayHistoricalAdapter,
];

export const astroStrategyAdapter: HistoricalStrategyAdapter = {
  strategyId: "ASTRO",
  label: "Astro",
  availability: "AVAILABLE",
  supportedFormulaVersions: ASTRO_FORMULA_ADAPTERS.map((a) => a.id),
  supportedInstruments: Array.from(
    new Set(ASTRO_FORMULA_ADAPTERS.flatMap((a) => a.supportedInstruments)),
  ),
  supportedTimeframes: Array.from(
    new Set(ASTRO_FORMULA_ADAPTERS.map((a) => a.dataGranularity)),
  ) as DataGranularity[],
  defaultFormulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
  resolveFormulaAdapter(formula) {
    return ASTRO_FORMULA_ADAPTERS.find((a) => a.id === formula) ?? null;
  },
  methodology:
    "Astro strategy — Sign-Degree Astro v1.1, Legacy Eaglebaba Cascade v1, and Absolute-Degree Intraday v1 formulas share this strategy envelope.",
};

function comingNextAdapter(
  id: StrategyId,
  label: string,
  methodology: string,
): HistoricalStrategyAdapter {
  return {
    strategyId: id,
    label,
    availability: "COMING_NEXT",
    supportedFormulaVersions: [],
    supportedInstruments: [],
    supportedTimeframes: [],
    defaultFormulaVersion: null,
    resolveFormulaAdapter: () => null,
    methodology,
  };
}

const smcBaseAdapter = comingNextAdapter(
  "SMC",
  "SMC (Smart Money Concepts)",
  "SMC strategy — Stage 1 pure engine wired (deterministic structure detection). Signal / backtest layers arrive in Phase 21.4 Stages 2–3.",
);

/**
 * SMC strategy adapter — availability stays COMING_NEXT until Stage 2 wires
 * the signal engine. `engineStatus` remains NOT_IMPLEMENTED for callers that
 * probe for a runnable strategy, while `analyzeStructure` exposes the pure
 * Stage 1 detector so future stages can plug in without touching this shape.
 */
export const smcStrategyAdapter: HistoricalStrategyAdapter & {
  engineStatus: typeof SMC_STRATEGY_NOT_IMPLEMENTED;
  analyzeStructure: (
    ...args: Parameters<typeof analyzeSmc>
  ) => SmcEngineResult;
  /**
   * Phase 21.4 Stage 2 · Deterministic signal-derivation entry point.
   * The strategy is still NOT executable through runUnifiedBacktest
   * (availability stays COMING_NEXT until Stage 3 wires the historical
   * runner adapter). Exposed here so downstream tests can invoke the
   * pure engine directly.
   */
  signalEngineStatus: SmcSignalEngineReady;
  analyzeSignals: (
    ...args: Parameters<typeof analyzeSmcSignals>
  ) => SmcSignalResult;
} = {
  ...smcBaseAdapter,
  engineStatus: SMC_STRATEGY_NOT_IMPLEMENTED,
  analyzeStructure: analyzeSmc,
  signalEngineStatus: SMC_SIGNAL_ENGINE_READY,
  analyzeSignals: analyzeSmcSignals,
};

export const astroSmcHybridAdapter = comingNextAdapter(
  "ASTRO_SMC_HYBRID",
  "Astro + SMC Hybrid",
  "Astro+SMC Hybrid strategy — engine adapter not yet wired. Uses Astro directional bias with SMC structural confirmation; conflicts resolve to WAIT.",
);

export const baselineStrategyAdapter = comingNextAdapter(
  "BASELINE",
  "Baseline (EMA/VWAP)",
  "Baseline strategy — engine adapter not yet wired. EMA13/EMA50/VWAP + confirmed structure break.",
);

export const STRATEGY_REGISTRY: Readonly<
  Record<StrategyId, HistoricalStrategyAdapter>
> = Object.freeze({
  ASTRO: astroStrategyAdapter,
  SMC: smcStrategyAdapter,
  ASTRO_SMC_HYBRID: astroSmcHybridAdapter,
  BASELINE: baselineStrategyAdapter,
});

export function listStrategies(): readonly HistoricalStrategyAdapter[] {
  return Object.values(STRATEGY_REGISTRY);
}

export function getStrategyAdapter(id: StrategyId): HistoricalStrategyAdapter {
  return STRATEGY_REGISTRY[id];
}

export type UnifiedBacktestError =
  | "STRATEGY_ADAPTER_NOT_AVAILABLE"
  | "UNSUPPORTED_FORMULA_FOR_STRATEGY"
  | "UNSUPPORTED_INSTRUMENT"
  | "UNSUPPORTED_TIMEFRAME";

export class UnifiedBacktestConfigError extends Error {
  readonly code: UnifiedBacktestError;
  constructor(code: UnifiedBacktestError, message: string) {
    super(message);
    this.name = "UnifiedBacktestConfigError";
    this.code = code;
  }
}

export type UnifiedBacktestValidation = {
  strategy: HistoricalStrategyAdapter;
  formula: HistoricalFormulaAdapter;
};

/**
 * Validate a strategy/formula/instrument/timeframe combination WITHOUT running
 * the backtest. Callers can use this to gate UI or to fail fast in the unified
 * server function before touching data providers.
 */
export function validateUnifiedConfig(cfg: {
  strategy: StrategyId;
  formula: UnifiedFormulaId;
  instrument: string;
  timeframe?: DataGranularity;
}): UnifiedBacktestValidation {
  const strategy = STRATEGY_REGISTRY[cfg.strategy];
  if (!strategy || strategy.availability !== "AVAILABLE") {
    throw new UnifiedBacktestConfigError(
      "STRATEGY_ADAPTER_NOT_AVAILABLE",
      `Strategy ${cfg.strategy} is not yet wired. COMING NEXT.`,
    );
  }
  const formula = strategy.resolveFormulaAdapter(cfg.formula);
  if (!formula) {
    throw new UnifiedBacktestConfigError(
      "UNSUPPORTED_FORMULA_FOR_STRATEGY",
      `Formula ${cfg.formula} is not supported by strategy ${cfg.strategy}.`,
    );
  }
  if (!formula.supportedInstruments.includes(cfg.instrument)) {
    throw new UnifiedBacktestConfigError(
      "UNSUPPORTED_INSTRUMENT",
      `Instrument ${cfg.instrument} is not supported by formula ${cfg.formula}.`,
    );
  }
  if (cfg.timeframe && cfg.timeframe !== formula.dataGranularity) {
    throw new UnifiedBacktestConfigError(
      "UNSUPPORTED_TIMEFRAME",
      `Timeframe ${cfg.timeframe} is incompatible with formula ${cfg.formula} (requires ${formula.dataGranularity}).`,
    );
  }
  return { strategy, formula };
}