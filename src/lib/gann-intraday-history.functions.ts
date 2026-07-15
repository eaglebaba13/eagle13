// Phase 21.2 · Stage 5 — historical multi-session validation runner.
// Reuses Stage 3 snapshot + Stage 4 candle + simulator. Validation only —
// does NOT change production Signal/Decision engines and does NOT write
// broker or notification history.

import { createServerFn } from "@tanstack/react-start";
import {
  computeSnapshotStatus,
  isWeekendIst,
  previousTradingDate,
  todayIst,
  type InstrumentSymbol,
} from "./gann-intraday-anchor";
import { getGannIntradaySnapshot } from "./gann-intraday.functions";
import { getIntraday5mCandles } from "./gann-intraday-candles.functions";
import { simulateSession, type AmbiguousPolicy } from "./gann-intraday-simulator";
import { computeCoreMetrics, type SessionResult } from "./gann-intraday-metrics";
import { computeRunId } from "./gann-formula-compare";
import {
  GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
  INTRADAY_FORMULA_VERSIONS,
} from "./engine-version";

export type HistoryArgs = {
  instrument: InstrumentSymbol;
  months: 1 | 3 | 6 | 12;
  ambiguousPolicy?: AmbiguousPolicy;
  costPerTrade?: number;
  slippagePerTrade?: number;
};

export type HistoryPerSession = {
  tradingDate: string;
  status: string;
  candles: number;
  missing: number;
  totalTrades: number;
  wins: number;
  losses: number;
  netPnL: number;
  error?: string;
};

export type HistoryResult = {
  version: typeof GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION;
  runId: string;
  instrument: InstrumentSymbol;
  months: number;
  from: string;
  to: string;
  ambiguousPolicy: AmbiguousPolicy;
  attempted: number;
  loaded: number;
  failed: number;
  sessionsSummary: HistoryPerSession[];
  metrics: ReturnType<typeof computeCoreMetrics>;
  causalityFailures: number;
  labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION";
  generatedAt: string;
};

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function listTradingDates(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  while (d <= to) {
    if (!isWeekendIst(d)) out.push(d);
    d = shift(d, 1);
  }
  return out;
}

export const runHistoricalValidation = createServerFn({ method: "GET" })
  .inputValidator((input: HistoryArgs) => {
    if (input?.instrument !== "NIFTY50" && input?.instrument !== "BANKNIFTY") {
      throw new Error("instrument must be NIFTY50 or BANKNIFTY");
    }
    if (![1, 3, 6, 12].includes(input.months)) {
      throw new Error("months must be one of 1/3/6/12");
    }
    return input;
  })
  .handler(async ({ data }): Promise<HistoryResult> => {
    const ambiguousPolicy: AmbiguousPolicy = data.ambiguousPolicy ?? "conservative";
    const to = previousTradingDate(todayIst());
    const from = shift(to, -data.months * 30);
    const dates = listTradingDates(from, to);

    const sessionsResults: SessionResult[] = [];
    const summary: HistoryPerSession[] = [];
    let causalityFailures = 0;

    for (const date of dates) {
      try {
        const status = computeSnapshotStatus(date);
        if (status === "NO_TRADING_SESSION") continue;
        const snapshot = await getGannIntradaySnapshot({
          data: { instrument: data.instrument, tradingDate: date },
        });
        if (snapshot.tradingDate !== date) {
          causalityFailures++;
          throw new Error("Snapshot date drift");
        }
        if (snapshot.previousCloseDate >= date) {
          causalityFailures++;
          throw new Error("Previous close from future");
        }
        const candles = await getIntraday5mCandles({
          data: { instrument: data.instrument, sessionDate: date },
        });
        const simulation = simulateSession({
          instrument: data.instrument,
          ranked: snapshot.rankedLevels,
          candles: candles.candles,
          cubeInputs: {
            starBias: "UNKNOWN",
            retrograde: "UNKNOWN",
            aspect: "UNKNOWN",
            priceAction: "UNKNOWN",
            ema13: "UNKNOWN",
            rsi14: "UNKNOWN",
          },
          ambiguousPolicy,
        });
        sessionsResults.push({
          tradingDate: date,
          instrument: data.instrument,
          simulation,
          costPerTrade: data.costPerTrade,
          slippagePerTrade: data.slippagePerTrade,
        });
        summary.push({
          tradingDate: date,
          status,
          candles: candles.candles.length,
          missing: candles.missingCount,
          totalTrades: simulation.counters.targetHit + simulation.counters.stopHit,
          wins: simulation.counters.targetHit,
          losses: simulation.counters.stopHit,
          netPnL: 0,
        });
      } catch (err) {
        summary.push({
          tradingDate: date,
          status: "FAILED",
          candles: 0,
          missing: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0,
          netPnL: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const metrics = computeCoreMetrics(sessionsResults);
    const runId = computeRunId({
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      instrument: data.instrument,
      from,
      to,
      ambiguousPolicy,
      costs: { cost: data.costPerTrade ?? 0, slippage: data.slippagePerTrade ?? 0 },
    });

    return {
      version: GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
      runId,
      instrument: data.instrument,
      months: data.months,
      from,
      to,
      ambiguousPolicy,
      attempted: dates.length,
      loaded: sessionsResults.length,
      failed: summary.filter((s) => s.error).length,
      sessionsSummary: summary,
      metrics,
      causalityFailures,
      labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
      generatedAt: new Date().toISOString(),
    };
  });