// Phase 21.3b · Absolute-degree intraday adapter. Wraps `simulateSession`
// (Stage-4 FSM: touch → confirm → retest → target/stop) into the unified
// adapter contract. Snapshot + 5-minute candles arrive via `cfg.extras`.

import {
  simulateSession,
  type AmbiguousPolicy,
} from "../../gann-intraday-simulator";
import type { RankedLevel } from "../../gann-level-ranking";
import type { CubeInputs } from "../../gann-cube-engine";
import type { TimedCandle5m } from "../../gann-intraday-touch";
import {
  GANN_ABSOLUTE_INTRADAY_REPLAY_VERSION,
  GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
  INTRADAY_FORMULA_VERSIONS,
} from "../../engine-version";
import type {
  AdapterConfig,
  HistoricalFormulaAdapter,
} from "../adapter";
import type { HistoricalTrade } from "../result";

export type AbsoluteSessionInput = {
  tradingDate: string;
  instrument: "NIFTY50" | "BANKNIFTY";
  ranked: readonly RankedLevel[];
  candles: readonly TimedCandle5m[];
  cubeInputs?: Omit<CubeInputs, "level">;
};

export type AbsoluteExtras = {
  sessions: readonly AbsoluteSessionInput[];
  ambiguousPolicy?: AmbiguousPolicy;
};

const DEFAULT_CUBE_INPUTS: Omit<CubeInputs, "level"> = {
  starBias: "UNKNOWN",
  retrograde: "UNKNOWN",
  aspect: "UNKNOWN",
  priceAction: "UNKNOWN",
  ema13: "UNKNOWN",
  rsi14: "UNKNOWN",
};

function readExtras(cfg: AdapterConfig): AbsoluteExtras {
  const ex = cfg.extras as AbsoluteExtras | undefined;
  if (!ex || !Array.isArray(ex.sessions)) {
    throw new Error("absolute-intraday adapter requires cfg.extras.sessions");
  }
  return ex;
}

function mapOutcome(o: string): HistoricalTrade["outcome"] {
  switch (o) {
    case "TARGET":
      return "WIN";
    case "STOP":
      return "LOSS";
    case "AMBIGUOUS_EXCLUDED":
      return "AMBIGUOUS";
    case "INVALIDATED":
    case "MISSED_CHASE":
    case "NO_TOUCH":
      return "SKIP";
    case "OPEN":
      return "FLAT";
    default:
      return "SKIP";
  }
}

export const absoluteIntradayHistoricalAdapter: HistoricalFormulaAdapter = {
  id: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
  label: "Absolute Degree Intraday v1",
  dataGranularity: "5m",
  causality: "intraday-5m",
  supportedInstruments: ["NIFTY50", "BANKNIFTY"],
  methodology:
    "Absolute-Degree Intraday v1 — 09:15 IST snapshot, 36 raw levels, Stage-4 FSM (touch → confirm → retest), Cube gating.",
  disclaimers: [
    "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
    "Historical replay simulates intraday events from 5-minute OHLC; confirmation/retest requires closed candles.",
  ],
  versions: {
    engineVersion: GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
    executionVersion: GANN_ABSOLUTE_INTRADAY_REPLAY_VERSION,
    cubeVersion: "GANN_CUBE_V1",
    policyVersion: "GANN_INTRADAY_POLICY_V1",
  },
  validateConfig(cfg) {
    readExtras(cfg);
  },
  planSessions(cfg) {
    const { sessions } = readExtras(cfg);
    const dates = sessions
      .map((s) => s.tradingDate)
      .filter((d) => d >= cfg.from && d <= cfg.to);
    return { dates, causality: "intraday-5m" };
  },
  async evaluateSession(cfg, date) {
    const { sessions, ambiguousPolicy } = readExtras(cfg);
    const session = sessions.find((s) => s.tradingDate === date);
    if (!session) return { trades: [] };
    const sim = simulateSession({
      instrument: session.instrument,
      ranked: session.ranked as RankedLevel[],
      candles: session.candles as TimedCandle5m[],
      cubeInputs: session.cubeInputs ?? DEFAULT_CUBE_INPUTS,
      ambiguousPolicy: ambiguousPolicy ?? (cfg.ambiguousPolicy as AmbiguousPolicy) ?? "conservative",
    });
    const trades: HistoricalTrade[] = sim.perLevel
      .filter(
        (p) => p.outcome === "TARGET" || p.outcome === "STOP" || p.outcome === "AMBIGUOUS_EXCLUDED",
      )
      .map((p, i) => {
        const outcome = mapOutcome(p.outcome);
        const side: HistoricalTrade["side"] =
          p.level.tradeBias === "BUY" ? "BUY" : p.level.tradeBias === "SELL" ? "SELL" : "WAIT";
        const dir = side === "BUY" ? 1 : -1;
        const entry = p.entry ?? null;
        const exit =
          outcome === "WIN" ? p.target : outcome === "LOSS" ? p.stopLoss : null;
        const pnl =
          entry != null && exit != null
            ? Math.round((exit - entry) * dir * 100) / 100
            : 0;
        return {
          id: `${date}-${p.level.planet}-${p.level.sourceLevel}-${i}`,
          date,
          side,
          entry,
          stop: p.stopLoss,
          target: p.target,
          exit,
          outcome,
          pnl,
          mfe: p.mfe,
          mae: p.mae,
          holdingTime:
            p.entryTimeIst && p.exitTimeIst
              ? Math.max(
                  0,
                  Math.round(
                    (Date.parse(p.exitTimeIst) - Date.parse(p.entryTimeIst)) /
                      60000,
                  ),
                )
              : null,
          formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
          source: cfg.source ?? "n/a",
          ambiguous: p.ambiguousCandleCount > 0,
          reasons: p.cube.reasons ?? [],
          metadata: {
            planet: p.level.planet,
            sourceLevel: p.level.sourceLevel,
            safeRisky: p.level.safety,
            cubeGrade: p.cube.cubeGrade,
            cubeAction: p.cube.action,
            touchTime: p.touchIndex != null ? session.candles[p.touchIndex]?.timeIst ?? null : null,
            confirmationTime:
              p.confirmIndex != null ? session.candles[p.confirmIndex]?.timeIst ?? null : null,
            retestTime:
              p.retestIndex != null ? session.candles[p.retestIndex]?.timeIst ?? null : null,
            pivotConfluence: p.level.pivotConfluence ?? null,
            ambiguousCandleCount: p.ambiguousCandleCount,
          },
        } satisfies HistoricalTrade;
      });
    return {
      trades,
      diagnostics: {
        counters: sim.counters,
        totalCandles: sim.totalCandles,
      },
    };
  },
  buildMetadata(_cfg, trades) {
    const bySafety = { SAFE: 0, RISKY: 0 };
    const byGrade: Record<string, number> = {};
    for (const t of trades) {
      const meta = t.metadata as Record<string, unknown>;
      const s = meta.safeRisky as string | undefined;
      if (s === "SAFE" || s === "RISKY") bySafety[s]++;
      const g = meta.cubeGrade as string | undefined;
      if (g) byGrade[g] = (byGrade[g] ?? 0) + 1;
    }
    return { bySafety, byGrade };
  },
};
