// Phase 21.6 · Stage 2 — Parameter-sensitivity execution for SMC & Hybrid.
//
// Pure orchestrator. Consumes an immutable ResearchDataContext plus a
// parameter grid, dispatches to the existing SMC signal engine and the
// existing SMC / Hybrid historical adapters, and returns SensitivityCell
// rows. Production defaults, engines, adapters, and Run-ID formulas are
// never modified.
//
// Intermediate cache rules per research run:
//   • provider payload loaded exactly once (counted upstream)
//   • data-quality computed once (counted upstream)
//   • SMC structure (analyzeSmc) is recomputed only when
//     lookback/EMA/displacement/FVG/OB structure knobs change — none of the
//     supported grid axes touch structure today, so structure is computed
//     exactly once and reused across all cells.
//   • SMC signals recomputed only when signal-config keys change.
//   • Execution runs per cell.

import { INTRADAY_FORMULA_VERSIONS } from "../engine-version";
import type { Candle } from "../smc-types";
import {
  analyzeSmc,
  type SmcEngineOptions,
  type SmcEngineResult,
} from "../smc-engine";
import {
  analyzeSmcSignals,
  DEFAULT_SMC_SIGNAL_CONFIG,
  type SmcSignalConfig,
  type SmcSignalDebug,
} from "../smc-signal-engine";
import type { AdapterConfig } from "./adapter";
import {
  DEFAULT_SMC_EXECUTION,
  smcHistoricalAdapter,
  type SmcExecutionConfig,
} from "./adapters/smc-historical.adapter";
import {
  hybridHistoricalAdapter,
  type HybridAstroPerDate,
} from "./adapters/astro-smc-hybrid.adapter";
import {
  DEFAULT_HYBRID_CONFIG,
  type HybridConfig,
} from "./hybrid-decision";
import type {
  ParameterCombination,
  SensitivityCell,
  SensitivityMetrics,
  SmcParameterKey,
  HybridParameterKey,
} from "./parameter-sensitivity";
import type { HistoricalTrade } from "./result";
import type {
  ResearchComputeCounters,
  ResearchDataContext,
} from "./research-payload";

// ---------------- Safety caps
export const MAX_SENSITIVITY_CELLS = 100;
export const MAX_VALUES_PER_PARAMETER = 10;

export class SensitivityExecutionError extends Error {
  constructor(
    public readonly code:
      | "INVALID_PARAMETER_GRID"
      | "GRID_TOO_LARGE"
      | "UNSUPPORTED_PARAMETER"
      | "INSUFFICIENT_DATA"
      | "DATA_QUALITY_FAILURE"
      | "RUN_CANCELLED"
      | "PROVIDER_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "SensitivityExecutionError";
  }
}

// Parameter partitions — used to decide whether signals or execution must be
// recomputed for a given cell.
const SMC_SIGNAL_KEYS: readonly SmcParameterKey[] = [
  "minScore",
  "structureWindow",
  "fvgValidityBars",
  "obValidityBars",
  "cooldownBars",
];
const SMC_EXECUTION_KEYS: readonly SmcParameterKey[] = [
  "atrStopMultiplier",
  "rr",
];
const SMC_EXECUTION_KEY_ALIASES: Record<string, SmcParameterKey | "maxHoldBars"> = {
  atrStopMultiplier: "atrStopMultiplier",
  rr: "rr",
  maxHoldBars: "maxHoldBars",
};

const HYBRID_SIGNAL_KEYS: readonly string[] = ["smcMinScore"];
const HYBRID_CONFIG_KEYS: readonly HybridParameterKey[] = [
  "astroWeight",
  "smcWeight",
  "agreementBonus",
  "dataQualityWeight",
  "hybridThreshold",
];
const HYBRID_EXECUTION_KEYS: readonly string[] = ["rr", "atrStopMultiplier"];

// ---------------- Grid validation
export function assertGridSize(cells: number): void {
  if (!Number.isFinite(cells) || cells <= 0)
    throw new SensitivityExecutionError("INVALID_PARAMETER_GRID", "empty grid");
  if (cells > MAX_SENSITIVITY_CELLS)
    throw new SensitivityExecutionError(
      "GRID_TOO_LARGE",
      `grid has ${cells} cells, exceeds ${MAX_SENSITIVITY_CELLS}`,
    );
}

// ---------------- Trade → metrics
function metricsFromTrades(
  trades: readonly HistoricalTrade[],
): SensitivityMetrics {
  const n = trades.length;
  let wins = 0;
  let losses = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let netPnl = 0;
  let peak = 0;
  let eq = 0;
  let maxDD = 0;
  for (const t of trades) {
    netPnl += t.pnl;
    if (t.outcome === "WIN") wins++;
    else if (t.outcome === "LOSS") losses++;
    if (t.pnl > 0) grossWin += t.pnl;
    else if (t.pnl < 0) grossLoss += -t.pnl;
    eq += t.pnl;
    if (eq > peak) peak = eq;
    if (peak - eq > maxDD) maxDD = peak - eq;
  }
  const totalOutcomes = wins + losses;
  const winRate = totalOutcomes > 0 ? wins / totalOutcomes : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Number.POSITIVE_INFINITY : 0;
  const expectancy = n > 0 ? netPnl / n : 0;
  const recoveryFactor = maxDD > 0 ? netPnl / maxDD : netPnl > 0 ? Number.POSITIVE_INFINITY : 0;
  return {
    trades: n,
    winRate: round4(winRate),
    profitFactor: Number.isFinite(profitFactor) ? round4(profitFactor) : profitFactor,
    expectancy: round4(expectancy),
    netPnl: round4(netPnl),
    maxDrawdown: round4(maxDD),
    recoveryFactor: Number.isFinite(recoveryFactor) ? round4(recoveryFactor) : recoveryFactor,
    stabilityScore: 0,
    oosScore: 0,
    monteCarloMedian: 0,
    monteCarloP5: 0,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------- Cell Run ID
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    // eslint-disable-next-line no-bitwise
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // eslint-disable-next-line no-bitwise
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeCellRunId(input: {
  baseRunId: string;
  dataHash: string;
  strategy: "SMC_V1" | "ASTRO_SMC_HYBRID_V1";
  params: ParameterCombination;
  normalizeWeights?: boolean;
  includeMonteCarlo?: boolean;
}): string {
  const paramKey = Object.keys(input.params)
    .sort()
    .map((k) => `${k}=${input.params[k]}`)
    .join(",");
  const key = [
    input.strategy,
    input.baseRunId,
    input.dataHash,
    paramKey,
    input.normalizeWeights ? "norm=1" : "norm=0",
    input.includeMonteCarlo ? "mc=1" : "mc=0",
  ].join("|");
  return `SENSITIVITY_CELL_V1:${fnv1a(key)}`;
}

// ---------------- SMC dispatch
export type SmcCellOptions = {
  readonly engineOptions?: SmcEngineOptions;
  readonly baseSignalConfig?: Partial<SmcSignalConfig>;
  readonly baseExecution?: Partial<SmcExecutionConfig>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (completed: number, total: number, current: ParameterCombination) => void;
};

function applySmcParams(
  base: SmcSignalConfig,
  baseExec: SmcExecutionConfig,
  params: ParameterCombination,
): { signalCfg: SmcSignalConfig; exec: SmcExecutionConfig } {
  const signalCfg: SmcSignalConfig = { ...base, weights: { ...base.weights } };
  const exec: SmcExecutionConfig = { ...baseExec };
  for (const [k, v] of Object.entries(params)) {
    if ((SMC_SIGNAL_KEYS as readonly string[]).includes(k)) {
      (signalCfg as unknown as Record<string, number>)[k] = v;
    } else if (k === "atrStopMultiplier") {
      exec.atrMultiple = v;
      exec.stopMode = "atr";
    } else if (k === "rr") {
      exec.rr = v;
    } else if (k === "maxHoldBars") {
      exec.maxHoldBars = v > 0 ? Math.round(v) : null;
    } else if (!Object.prototype.hasOwnProperty.call(SMC_EXECUTION_KEY_ALIASES, k)) {
      throw new SensitivityExecutionError(
        "UNSUPPORTED_PARAMETER",
        `SMC sensitivity does not support parameter '${k}'`,
      );
    }
  }
  return { signalCfg, exec };
}

function paramsChangeSignals(params: ParameterCombination): boolean {
  for (const k of Object.keys(params)) {
    if ((SMC_SIGNAL_KEYS as readonly string[]).includes(k)) return true;
  }
  return false;
}

function paramsChangeExecution(params: ParameterCombination): boolean {
  for (const k of Object.keys(params)) {
    if ((SMC_EXECUTION_KEYS as readonly string[]).includes(k) || k === "maxHoldBars")
      return true;
  }
  return false;
}

/** Run an SMC parameter grid against the shared payload. */
export async function runSmcSensitivity(
  ctx: ResearchDataContext,
  combos: readonly ParameterCombination[],
  counters: ResearchComputeCounters,
  opts: SmcCellOptions = {},
): Promise<{
  cells: SensitivityCell[];
  partial: boolean;
  engine: SmcEngineResult;
  signalCacheHits: number;
  executionCount: number;
}> {
  assertGridSize(combos.length);
  if (ctx.candles.length < 10) {
    throw new SensitivityExecutionError(
      "INSUFFICIENT_DATA",
      `payload has ${ctx.candles.length} candles (need ≥ 10)`,
    );
  }
  if (ctx.dataQuality.status === "FAIL") {
    throw new SensitivityExecutionError(
      "DATA_QUALITY_FAILURE",
      `data quality FAIL: ${ctx.dataQuality.reasons.join(",")}`,
    );
  }

  // Structure runs once for the entire grid (none of the supported axes touch it).
  const candles = ctx.candles as Candle[];
  const engine = analyzeSmc(candles, opts.engineOptions);
  counters.smcStructureComputeCount++;

  const baseSignalCfg: SmcSignalConfig = {
    ...DEFAULT_SMC_SIGNAL_CONFIG,
    ...(opts.baseSignalConfig ?? {}),
    weights: {
      ...DEFAULT_SMC_SIGNAL_CONFIG.weights,
      ...(opts.baseSignalConfig?.weights ?? {}),
    },
  };
  const baseExec: SmcExecutionConfig = {
    ...DEFAULT_SMC_EXECUTION,
    ...(opts.baseExecution ?? {}),
  };

  const signalCache = new Map<string, SmcSignalDebug[]>();
  const cells: SensitivityCell[] = [];
  let partial = false;
  let signalCacheHits = 0;
  let executionCount = 0;

  for (let i = 0; i < combos.length; i++) {
    if (opts.signal?.aborted) {
      partial = true;
      break;
    }
    const params = combos[i];
    opts.onProgress?.(i, combos.length, params);

    try {
      const { signalCfg, exec } = applySmcParams(baseSignalCfg, baseExec, params);
      const sigKey = JSON.stringify({
        m: signalCfg.minScore,
        sw: signalCfg.structureWindow,
        fv: signalCfg.fvgValidityBars,
        ov: signalCfg.obValidityBars,
        cd: signalCfg.cooldownBars,
      });
      let signals = signalCache.get(sigKey);
      if (!signals) {
        signals = analyzeSmcSignals(candles, engine, signalCfg).signals;
        counters.smcSignalComputeCount++;
        signalCache.set(sigKey, signals);
      } else {
        signalCacheHits++;
      }

      const adapterCfg: AdapterConfig = {
        instrument: ctx.instrument,
        from: ctx.actualRange.from,
        to: ctx.actualRange.to,
        costs: ctx.costs,
        source: ctx.source,
        extras: { candles, signals, engine, execution: exec },
      };
      const evaluation = await smcHistoricalAdapter.evaluateSession(adapterCfg, ctx.actualRange.from);
      counters.executionCount++;
      executionCount++;

      const metrics = metricsFromTrades(evaluation.trades);
      if (metrics.trades < 5) {
        cells.push({
          params,
          metrics: null,
          reason: `INSUFFICIENT_DATA: trades=${metrics.trades}`,
        });
      } else {
        cells.push({ params, metrics });
      }
    } catch (e) {
      cells.push({
        params,
        metrics: null,
        reason: e instanceof Error ? e.message : "RUN_ERROR",
      });
    }
  }

  opts.onProgress?.(cells.length, combos.length, combos[combos.length - 1] ?? {});
  return { cells, partial, engine, signalCacheHits, executionCount };
}

// ---------------- Hybrid dispatch
export type HybridCellOptions = SmcCellOptions & {
  readonly astroByDate: Readonly<Record<string, HybridAstroPerDate>>;
  readonly astroFormulaVersion: string;
  readonly smcFormulaVersion?: string;
  readonly baseHybridConfig?: Partial<HybridConfig>;
  readonly normalizeWeights?: boolean;
  readonly dataQualityPct?: number;
};

export type EffectiveHybridWeights = {
  readonly astro: number;
  readonly smc: number;
  readonly agreement: number;
  readonly dataQuality: number;
  readonly total: number;
  readonly normalized: boolean;
};

export function resolveHybridWeights(
  base: HybridConfig,
  params: ParameterCombination,
  normalize: boolean,
): { config: HybridConfig; effective: EffectiveHybridWeights } {
  const w = { ...base.weights };
  if (typeof params.astroWeight === "number") w.astro = params.astroWeight;
  if (typeof params.smcWeight === "number") w.smc = params.smcWeight;
  if (typeof params.agreementBonus === "number") w.agreement = params.agreementBonus;
  if (typeof params.dataQualityWeight === "number") w.dataQuality = params.dataQualityWeight;
  for (const val of Object.values(w)) {
    if (!Number.isFinite(val) || val < 0) {
      throw new SensitivityExecutionError(
        "INVALID_PARAMETER_GRID",
        `hybrid weights must be finite and non-negative (got ${JSON.stringify(w)})`,
      );
    }
  }
  const total = w.astro + w.smc + w.agreement + w.dataQuality;
  let final = w;
  if (normalize && total > 0) {
    final = {
      astro: w.astro / total,
      smc: w.smc / total,
      agreement: w.agreement / total,
      dataQuality: w.dataQuality / total,
    };
  }
  const cfg: HybridConfig = {
    weights: final,
    scoreThreshold:
      typeof params.hybridThreshold === "number"
        ? params.hybridThreshold
        : base.scoreThreshold,
    minDataQualityPct: base.minDataQualityPct,
  };
  return {
    config: cfg,
    effective: {
      astro: final.astro,
      smc: final.smc,
      agreement: final.agreement,
      dataQuality: final.dataQuality,
      total: normalize ? 1 : total,
      normalized: normalize,
    },
  };
}

export async function runHybridSensitivity(
  ctx: ResearchDataContext,
  combos: readonly ParameterCombination[],
  counters: ResearchComputeCounters,
  opts: HybridCellOptions,
): Promise<{ cells: SensitivityCell[]; partial: boolean }> {
  assertGridSize(combos.length);
  if (ctx.candles.length < 10) {
    throw new SensitivityExecutionError(
      "INSUFFICIENT_DATA",
      `payload has ${ctx.candles.length} candles (need ≥ 10)`,
    );
  }

  const candles = ctx.candles as Candle[];
  const engine = analyzeSmc(candles, opts.engineOptions);
  counters.smcStructureComputeCount++;

  const baseSignalCfg: SmcSignalConfig = {
    ...DEFAULT_SMC_SIGNAL_CONFIG,
    ...(opts.baseSignalConfig ?? {}),
    weights: {
      ...DEFAULT_SMC_SIGNAL_CONFIG.weights,
      ...(opts.baseSignalConfig?.weights ?? {}),
    },
  };
  const baseExec: SmcExecutionConfig = {
    ...DEFAULT_SMC_EXECUTION,
    ...(opts.baseExecution ?? {}),
  };
  const baseHybrid: HybridConfig = {
    weights: {
      ...DEFAULT_HYBRID_CONFIG.weights,
      ...(opts.baseHybridConfig?.weights ?? {}),
    },
    scoreThreshold:
      opts.baseHybridConfig?.scoreThreshold ?? DEFAULT_HYBRID_CONFIG.scoreThreshold,
    minDataQualityPct:
      opts.baseHybridConfig?.minDataQualityPct ?? DEFAULT_HYBRID_CONFIG.minDataQualityPct,
  };

  const signalCache = new Map<string, SmcSignalDebug[]>();
  const cells: SensitivityCell[] = [];
  let partial = false;

  for (let i = 0; i < combos.length; i++) {
    if (opts.signal?.aborted) {
      partial = true;
      break;
    }
    const params = combos[i];
    opts.onProgress?.(i, combos.length, params);

    try {
      // 1) SMC signals (recompute only if smcMinScore or other signal keys change).
      const signalCfg: SmcSignalConfig = { ...baseSignalCfg, weights: { ...baseSignalCfg.weights } };
      if (typeof params.smcMinScore === "number") signalCfg.minScore = params.smcMinScore;
      for (const k of Object.keys(params)) {
        if ((SMC_SIGNAL_KEYS as readonly string[]).includes(k)) {
          (signalCfg as unknown as Record<string, number>)[k] = params[k];
        }
      }
      const sigKey = JSON.stringify({
        m: signalCfg.minScore,
        sw: signalCfg.structureWindow,
        fv: signalCfg.fvgValidityBars,
        ov: signalCfg.obValidityBars,
        cd: signalCfg.cooldownBars,
      });
      let smcSignals = signalCache.get(sigKey);
      if (!smcSignals) {
        smcSignals = analyzeSmcSignals(candles, engine, signalCfg).signals;
        counters.smcSignalComputeCount++;
        signalCache.set(sigKey, smcSignals);
      }

      // 2) Hybrid resolver + execution.
      const { config: hybridCfg } = resolveHybridWeights(
        baseHybrid,
        params,
        opts.normalizeWeights === true,
      );
      const exec: SmcExecutionConfig = { ...baseExec };
      if (typeof params.rr === "number") exec.rr = params.rr;
      if (typeof params.atrStopMultiplier === "number") {
        exec.atrMultiple = params.atrStopMultiplier;
        exec.stopMode = "atr";
      }

      const adapterCfg: AdapterConfig = {
        instrument: ctx.instrument,
        from: ctx.actualRange.from,
        to: ctx.actualRange.to,
        costs: ctx.costs,
        source: ctx.source,
        extras: {
          candles,
          smcSignals,
          engine,
          astroByDate: opts.astroByDate,
          astroFormulaVersion: opts.astroFormulaVersion,
          smcFormulaVersion:
            opts.smcFormulaVersion ?? INTRADAY_FORMULA_VERSIONS.SMC_V1,
          hybridConfig: hybridCfg,
          execution: exec,
          dataQualityPct: opts.dataQualityPct ?? ctx.dataQuality.coveragePct,
        },
      };
      const evaluation = await hybridHistoricalAdapter.evaluateSession(adapterCfg, ctx.actualRange.from);
      counters.executionCount++;
      const metrics = metricsFromTrades(evaluation.trades);
      if (metrics.trades < 5) {
        cells.push({ params, metrics: null, reason: `INSUFFICIENT_DATA: trades=${metrics.trades}` });
      } else {
        cells.push({ params, metrics });
      }
    } catch (e) {
      cells.push({
        params,
        metrics: null,
        reason: e instanceof Error ? e.message : "RUN_ERROR",
      });
    }
  }

  return { cells, partial };
}

// Re-export for the UI layer.
export {
  HYBRID_CONFIG_KEYS,
  HYBRID_EXECUTION_KEYS,
  HYBRID_SIGNAL_KEYS,
  SMC_EXECUTION_KEYS,
  SMC_SIGNAL_KEYS,
  paramsChangeExecution,
  paramsChangeSignals,
};