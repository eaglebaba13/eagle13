// Phase 21.3b · Daily-astro adapter factory. Wraps the exact same primitives
// used by `runBacktest`/`replayDay`:
//   computeCycles → computeAstroLevels → buildLevelBoard → computeSignal
//   → pickTargetStop → resolveOutcome
// so both sign-degree (GANN_NIFTY_ASTRO_V1_1) and legacy
// (LEGACY_EAGLEBABA_CASCADE_V1) share one wrapper implementation.
//
// Adapters are pure: candles + astro positions are supplied via `cfg.extras`
// (`candles`, `positions`). This keeps parity tests deterministic and
// network-free. The eventual `runBacktest` compatibility wrapper will fetch
// these upstream and pass them through unchanged.

import {
  buildLevelBoard,
  computeAstroLevels,
  computeCycles,
  computeSignal,
  type PlanetRow,
} from "../../astro-levels";
import {
  BACKTEST_ENGINE_VERSION,
  BACKTEST_FORMULA_VERSION,
  pickTargetStop,
  resolveOutcome,
  ZERO_COSTS,
  type CostModel,
  type ExecutionPolicy,
} from "../../backtest-engine";
import {
  ASTRO_FORMULA_VERSIONS,
  INTRADAY_FORMULA_VERSIONS,
  type AstroFormulaVersion,
} from "../../engine-version";
import type {
  AdapterConfig,
  HistoricalFormulaAdapter,
} from "../adapter";
import type { HistoricalTrade, UnifiedFormulaId } from "../result";

export type DailyCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type DailyPositions = {
  planets: PlanetRow[];
  moonSign: string;
  moonNakshatra: string;
  retroCount: number;
  bullRetroCount: number;
  bearRetroCount: number;
};

export type DailyExtras = {
  /** Candles keyed by trading date (yyyy-mm-dd). Must include prev-close row. */
  candles: readonly DailyCandle[];
  /** Astro positions at 09:00 IST, keyed by trading date. */
  positions: Readonly<Record<string, DailyPositions>>;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function readExtras(cfg: AdapterConfig): DailyExtras {
  const ex = cfg.extras as DailyExtras | undefined;
  if (!ex || !Array.isArray(ex.candles) || !ex.positions) {
    throw new Error(
      "daily-astro adapter requires cfg.extras.candles and cfg.extras.positions",
    );
  }
  return ex;
}

export type DailyAdapterOptions = {
  id: UnifiedFormulaId;
  astroFormulaVersion: AstroFormulaVersion;
  label: string;
};

export function createDailyAstroAdapter(
  opts: DailyAdapterOptions,
): HistoricalFormulaAdapter {
  return {
    id: opts.id,
    label: opts.label,
    dataGranularity: "1d",
    causality: "daily",
    supportedInstruments: ["NIFTY50", "BANKNIFTY", "GOLD", "SILVER", "BTC"],
    methodology:
      opts.astroFormulaVersion === ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1
        ? "Legacy Eaglebaba cascade v1 — daily Astro levels."
        : "Gann Nifty Astro v1.1 — daily Astro levels; 09:00 IST anchor.",
    disclaimers: [
      "Historical results are simulated and depend on candle resolution, execution policy, and data quality.",
      "Daily OHLC cannot determine intraday event order — both-touched is resolved per policy.",
    ],
    versions: {
      engineVersion: BACKTEST_ENGINE_VERSION,
      executionVersion: BACKTEST_FORMULA_VERSION,
      cubeVersion: "n/a",
      policyVersion: opts.astroFormulaVersion,
    },
    validateConfig(cfg) {
      readExtras(cfg);
    },
    planSessions(cfg) {
      const { candles } = readExtras(cfg);
      const dates = candles
        .map((c) => c.date)
        .filter((d) => d >= cfg.from && d <= cfg.to);
      return { dates, causality: "daily" };
    },
    async evaluateSession(cfg, date) {
      const { candles, positions } = readExtras(cfg);
      const idx = candles.findIndex((c) => c.date === date);
      if (idx <= 0) return { trades: [] };
      const today = candles[idx];
      const prev = candles[idx - 1];
      const pos = positions[date];
      if (!pos) return { trades: [] };
      const cycles = computeCycles(prev.close);
      const planets: PlanetRow[] = pos.planets.map((p) => ({
        ...p,
        ...computeAstroLevels(cycles, p.degree),
      }));
      const entry = today.open;
      const board = buildLevelBoard(planets, entry);
      const sig = computeSignal({
        price: entry,
        board,
        moonNakshatra: pos.moonNakshatra,
        retroCount: pos.retroCount,
        totalPlanets: planets.length,
        bullRetroCount: pos.bullRetroCount,
        bearRetroCount: pos.bearRetroCount,
      });
      const picked = pickTargetStop(
        board.map((b) => ({ value: b.value, isResistance: b.isResistance })),
        entry,
        sig.signal,
      );
      const costs: CostModel = (cfg.costs as CostModel) ?? ZERO_COSTS;
      const policy = (cfg.policy as ExecutionPolicy) ?? "conservative";
      const trade: HistoricalTrade = {
        id: `${opts.id}-${date}`,
        date,
        side: sig.signal,
        entry: round2(entry),
        stop: picked.stop == null ? null : round2(picked.stop),
        target: picked.target == null ? null : round2(picked.target),
        exit: round2(today.close),
        outcome: "SKIP",
        pnl: 0,
        mfe: null,
        mae: null,
        holdingTime: null,
        formulaVersion: opts.id,
        source: cfg.source ?? "n/a",
        ambiguous: false,
        reasons: [],
        metadata: {
          strength: sig.strength,
          confidence: sig.confidence,
          moonSign: pos.moonSign,
          moonNakshatra: pos.moonNakshatra,
          retrograde: `${pos.retroCount} retro`,
          nearest: sig.nearest ? `${sig.nearest.planet} ${sig.nearest.kind}` : null,
          high: round2(today.high),
          low: round2(today.low),
          astroFormulaVersion: opts.astroFormulaVersion,
        },
      };
      if (sig.signal === "WAIT") return { trades: [trade] };
      if (picked.target == null || picked.stop == null) {
        return { trades: [{ ...trade, outcome: "INVALID_SETUP" }] };
      }
      const outcome = resolveOutcome({
        signal: sig.signal,
        entry,
        target: picked.target,
        stop: picked.stop,
        high: today.high,
        low: today.low,
        close: today.close,
        policy,
        costs,
      });
      return {
        trades: [
          {
            ...trade,
            exit: outcome.exit,
            outcome: outcome.result,
            pnl: outcome.netPnl,
            ambiguous: outcome.ambiguous,
            metadata: {
              ...trade.metadata,
              grossPnl: outcome.grossPnl,
              costs: outcome.costs,
              pnlPct: outcome.pnlPct,
              targetHit: outcome.targetHit,
              stopHit: outcome.stopHit,
            },
          },
        ],
      };
    },
    buildMetadata: () => ({
      astroFormulaVersion: opts.astroFormulaVersion,
    }),
  };
}

export const signDegreeHistoricalAdapter = createDailyAstroAdapter({
  id: INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
  astroFormulaVersion: ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1,
  label: "Sign Degree Table v1.1",
});

export const legacyHistoricalAdapter = createDailyAstroAdapter({
  id: INTRADAY_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
  astroFormulaVersion: ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
  label: "Legacy Eaglebaba Cascade v1",
});
