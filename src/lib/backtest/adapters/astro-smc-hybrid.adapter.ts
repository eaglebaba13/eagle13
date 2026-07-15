// Phase 21.4 · Stage 4B — Astro + SMC Hybrid historical adapter.
//
// Deterministically combines an existing Astro directional decision (per
// trading date) with an existing SMC signal (per candle) using the pure
// `deriveHybridDecision` resolver. Execution is delegated to the existing
// SMC historical adapter — no second execution engine, no second cost model.
//
// Isolation guarantees:
//  · No Astro math runs here. Astro decisions must be supplied via extras.
//  · No SMC math runs here. SMC signals must be supplied via extras.
//  · Direct BUY/SELL vs SELL/BUY never trades — enforced by the resolver.
//  · Emitted trades stamp `formulaVersion = ASTRO_SMC_HYBRID_V1`, never SMC_V1.

import { INTRADAY_FORMULA_VERSIONS } from "../../engine-version";
import type { SmcSignalDebug } from "../../smc-signal-engine";
import type { AdapterConfig, HistoricalFormulaAdapter } from "../adapter";
import type { HistoricalTrade } from "../result";
import {
  DEFAULT_HYBRID_CONFIG,
  deriveHybridDecision,
  type HybridConfig,
  type HybridDirection,
} from "../hybrid-decision";
import {
  smcHistoricalAdapter,
  type SmcExecutionConfig,
} from "./smc-historical.adapter";
import type { SmcEngineResult } from "../../smc-engine";
import type { Candle } from "../../smc-types";

export const HYBRID_ENGINE_VERSION = "ASTRO_SMC_HYBRID_ENGINE_V1" as const;
export const HYBRID_EXECUTION_VERSION = "ASTRO_SMC_HYBRID_EXECUTION_V1" as const;
export const HYBRID_POLICY_VERSION = "ASTRO_SMC_HYBRID_POLICY_V1" as const;

export type HybridAstroPerDate = {
  direction: "BUY" | "SELL" | "WAIT";
  confidence: number;
};

export type HybridExtras = {
  candles: readonly Candle[];
  smcSignals: readonly SmcSignalDebug[];
  engine?: SmcEngineResult;
  astroByDate: Readonly<Record<string, HybridAstroPerDate>>;
  astroFormulaVersion: string;
  smcFormulaVersion: string;
  hybridConfig?: Partial<HybridConfig>;
  execution?: Partial<SmcExecutionConfig>;
  dataQualityPct?: number;
};

type HybridPerBar = {
  direction: HybridDirection;
  hybridScore: number;
  astroContribution: number;
  smcContribution: number;
  agreementBonus: number;
  dataQualityContribution: number;
  astroDirection: "BUY" | "SELL" | "WAIT" | null;
  reasons: readonly string[];
};

function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function readExtras(cfg: AdapterConfig): HybridExtras {
  const ex = cfg.extras as HybridExtras | undefined;
  if (!ex || !Array.isArray(ex.candles) || !Array.isArray(ex.smcSignals)) {
    throw new Error(
      "astro-smc-hybrid adapter requires cfg.extras.candles and cfg.extras.smcSignals",
    );
  }
  if (!ex.astroByDate || typeof ex.astroByDate !== "object") {
    throw new Error(
      "astro-smc-hybrid adapter requires cfg.extras.astroByDate keyed by yyyy-mm-dd",
    );
  }
  if (!ex.astroFormulaVersion || !ex.smcFormulaVersion) {
    throw new Error(
      "astro-smc-hybrid adapter requires astroFormulaVersion and smcFormulaVersion",
    );
  }
  return ex;
}

function computeHybridSeries(
  ex: HybridExtras,
): { signals: SmcSignalDebug[]; perBar: HybridPerBar[]; counters: Record<HybridDirection, number> } {
  const dq = ex.dataQualityPct ?? 100;
  const counters: Record<HybridDirection, number> = {
    BUY: 0,
    SELL: 0,
    WAIT: 0,
    CONFLICT: 0,
    DATA_INCOMPLETE: 0,
    FORMULA_MISMATCH: 0,
  };
  const signals: SmcSignalDebug[] = [];
  const perBar: HybridPerBar[] = [];
  const n = Math.min(ex.candles.length, ex.smcSignals.length);
  for (let i = 0; i < n; i++) {
    const c = ex.candles[i];
    const smcSig = ex.smcSignals[i];
    const date = isoDate(c.t);
    const astro = ex.astroByDate[date] ?? null;
    const decision = deriveHybridDecision({
      astro: astro
        ? {
            direction: astro.direction,
            confidence: astro.confidence,
            formulaVersion: ex.astroFormulaVersion,
          }
        : null,
      smc: {
        signal:
          smcSig.signal === "BUY" || smcSig.signal === "SELL"
            ? smcSig.signal
            : smcSig.signal === "CONFLICT"
              ? "CONFLICT"
              : smcSig.signal === "INVALID"
                ? "INVALID"
                : "WAIT",
        score: smcSig.score,
        formulaVersion: ex.smcFormulaVersion,
        triggeredRules: smcSig.triggeredRules,
        missingRules: smcSig.missingRules,
        reasons: smcSig.reasons,
      },
      dataQualityPct: dq,
      expectedAstroFormula: ex.astroFormulaVersion,
      expectedSmcFormula: ex.smcFormulaVersion,
      config: ex.hybridConfig,
    });
    counters[decision.direction] += 1;
    perBar.push({
      direction: decision.direction,
      hybridScore: decision.hybridScore,
      astroContribution: decision.astroContribution,
      smcContribution: decision.smcContribution,
      agreementBonus: decision.agreementBonus,
      dataQualityContribution: decision.dataQualityContribution,
      astroDirection: astro ? astro.direction : null,
      reasons: decision.reasons,
    });
    // Rewrite the SMC signal so execution only triggers when hybrid agrees.
    const forwarded: SmcSignalDebug = {
      ...smcSig,
      signal:
        decision.direction === "BUY" || decision.direction === "SELL"
          ? decision.direction
          : "WAIT",
      reasons: [...smcSig.reasons, ...decision.reasons],
    };
    signals.push(forwarded);
  }
  return { signals, perBar, counters };
}

export const hybridHistoricalAdapter: HistoricalFormulaAdapter = {
  id: INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
  label: "Astro+SMC Hybrid v1",
  dataGranularity: "5m",
  causality: "intraday-5m",
  supportedInstruments: smcHistoricalAdapter.supportedInstruments,
  methodology:
    "Astro+SMC Hybrid v1 — trades only when Astro and SMC agree on direction for the same session AND the SMC score meets the configured threshold. Direct BUY/SELL conflicts never trade regardless of weights. Execution reuses the SMC historical adapter (single active position, shared cost model).",
  disclaimers: [
    "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
    "Hybrid combines the outputs of Astro and SMC engines but never re-derives either. Direct directional conflicts resolve to WAIT and are not tradable.",
  ],
  versions: {
    engineVersion: HYBRID_ENGINE_VERSION,
    executionVersion: HYBRID_EXECUTION_VERSION,
    cubeVersion: "n/a",
    policyVersion: HYBRID_POLICY_VERSION,
  },
  validateConfig(cfg) {
    const ex = readExtras(cfg);
    if (ex.candles.length > 0 && ex.smcSignals.length !== ex.candles.length) {
      throw new Error(
        `astro-smc-hybrid: smcSignals length (${ex.smcSignals.length}) must equal candles length (${ex.candles.length})`,
      );
    }
  },
  planSessions(cfg) {
    // Same single-pass plan as SMC — position continuity crosses day boundaries.
    return { dates: [cfg.from], causality: "intraday-5m" };
  },
  async evaluateSession(cfg, date) {
    const ex = readExtras(cfg);
    if (ex.candles.length === 0) return { trades: [] };
    const { signals, perBar, counters } = computeHybridSeries(ex);
    // Delegate to SMC adapter execution with rewritten signals.
    const delegated = await smcHistoricalAdapter.evaluateSession(
      {
        ...cfg,
        extras: {
          candles: ex.candles,
          signals,
          engine: ex.engine,
          execution: ex.execution,
        },
      },
      date,
    );
    const trades: HistoricalTrade[] = delegated.trades.map((t) => {
      // Map SMC trade to Hybrid trade with augmented metadata.
      // Trade id is `SMC_V1-<entryIdx>-<signalIdx>`; extract signal index.
      const parts = t.id.split("-");
      const signalIdx = Number(parts[parts.length - 1]);
      const bar = Number.isFinite(signalIdx) ? perBar[signalIdx] : undefined;
      return {
        ...t,
        id: `ASTRO_SMC_HYBRID_V1-${parts.slice(1).join("-")}`,
        formulaVersion: INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
        reasons: bar ? [...t.reasons, ...bar.reasons] : t.reasons,
        metadata: {
          ...t.metadata,
          strategy: "ASTRO_SMC_HYBRID",
          hybridVersion: "ASTRO_SMC_HYBRID_V1",
          astroFormulaVersion: ex.astroFormulaVersion,
          smcFormulaVersion: ex.smcFormulaVersion,
          hybridScore: bar?.hybridScore ?? 0,
          astroContribution: bar?.astroContribution ?? 0,
          smcContribution: bar?.smcContribution ?? 0,
          agreementBonus: bar?.agreementBonus ?? 0,
          dataQualityContribution: bar?.dataQualityContribution ?? 0,
          astroDirection: bar?.astroDirection ?? null,
          alignment: bar?.direction ?? "BUY",
        },
      };
    });
    return {
      trades,
      diagnostics: {
        agreementCount: counters.BUY + counters.SELL,
        conflictCount: counters.CONFLICT,
        waitCount: counters.WAIT,
        dataIncompleteCount: counters.DATA_INCOMPLETE,
        formulaMismatchCount: counters.FORMULA_MISMATCH,
      },
    };
  },
  buildMetadata(cfg, trades) {
    const ex = cfg.extras as HybridExtras | undefined;
    let astroSum = 0;
    let smcSum = 0;
    let hybridSum = 0;
    let agreementCount = 0;
    for (const t of trades) {
      const m = t.metadata as {
        hybridScore?: number;
        astroContribution?: number;
        smcContribution?: number;
      };
      if (typeof m.hybridScore === "number") hybridSum += m.hybridScore;
      if (typeof m.astroContribution === "number") astroSum += m.astroContribution;
      if (typeof m.smcContribution === "number") smcSum += m.smcContribution;
      agreementCount += 1;
    }
    // Recompute directional counters from extras (independent of trades).
    let counters: Record<HybridDirection, number> = {
      BUY: 0,
      SELL: 0,
      WAIT: 0,
      CONFLICT: 0,
      DATA_INCOMPLETE: 0,
      FORMULA_MISMATCH: 0,
    };
    if (ex && Array.isArray(ex.candles) && Array.isArray(ex.smcSignals)) {
      counters = computeHybridSeries(ex).counters;
    }
    const n = trades.length;
    const hybridConfig: HybridConfig = {
      weights: { ...DEFAULT_HYBRID_CONFIG.weights, ...(ex?.hybridConfig?.weights ?? {}) },
      scoreThreshold:
        ex?.hybridConfig?.scoreThreshold ??
        DEFAULT_HYBRID_CONFIG.scoreThreshold,
      minDataQualityPct:
        ex?.hybridConfig?.minDataQualityPct ??
        DEFAULT_HYBRID_CONFIG.minDataQualityPct,
    };
    return {
      strategy: "ASTRO_SMC_HYBRID",
      hybridVersion: "ASTRO_SMC_HYBRID_V1",
      astroFormulaVersion: ex?.astroFormulaVersion ?? null,
      smcFormulaVersion: ex?.smcFormulaVersion ?? null,
      hybridConfig,
      counters,
      averages: {
        hybridScore: n > 0 ? Math.round((hybridSum / n) * 100) / 100 : 0,
        astroContribution: n > 0 ? Math.round((astroSum / n) * 100) / 100 : 0,
        smcContribution: n > 0 ? Math.round((smcSum / n) * 100) / 100 : 0,
      },
      tradeCount: agreementCount,
    };
  },
};