// Phase 21.3d-parity-α · Deterministic golden envelope for `HistoryResult`.
//
// Hand-authored full-shape literal that MUST compile against the production
// type from `../../gann-intraday-history.functions`. Values exercise:
//   • locked historical session with 75 candles + 0 missing
//   • ambiguous policy (conservative)
//   • wins / losses / netPnL
//   • cube approvals & rejections
//   • first-touch / confirmed / retest counters
//   • MFE / MAE averages
//   • failure row (session with `error`)
//   • causalityFailures counter
//   • labeledAs validation constant
//   • runId locked against `computeRunId` from gann-formula-compare.ts

import type { HistoryResult } from "../../gann-intraday-history.functions";
import { computeRunId as computeAbsoluteRunId } from "../../gann-formula-compare";
import {
  GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
  INTRADAY_FORMULA_VERSIONS,
} from "../../engine-version";

export const HISTORY_GOLDEN_INPUT = {
  instrument: "NIFTY50" as const,
  months: 3 as const,
  from: "2026-04-01",
  to: "2026-06-30",
  ambiguousPolicy: "conservative" as const,
  costPerTrade: 20,
  slippagePerTrade: 5,
};

export const HISTORY_GOLDEN_RUN_ID = computeAbsoluteRunId({
  formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
  instrument: HISTORY_GOLDEN_INPUT.instrument,
  from: HISTORY_GOLDEN_INPUT.from,
  to: HISTORY_GOLDEN_INPUT.to,
  ambiguousPolicy: HISTORY_GOLDEN_INPUT.ambiguousPolicy,
  costs: {
    cost: HISTORY_GOLDEN_INPUT.costPerTrade,
    slippage: HISTORY_GOLDEN_INPUT.slippagePerTrade,
  },
});

export const HISTORY_GOLDEN_GENERATED_AT = "2026-07-15T00:00:00.000Z";

export const HISTORY_GOLDEN: HistoryResult = {
  version: GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
  runId: HISTORY_GOLDEN_RUN_ID,
  instrument: HISTORY_GOLDEN_INPUT.instrument,
  months: HISTORY_GOLDEN_INPUT.months,
  from: HISTORY_GOLDEN_INPUT.from,
  to: HISTORY_GOLDEN_INPUT.to,
  ambiguousPolicy: HISTORY_GOLDEN_INPUT.ambiguousPolicy,
  attempted: 3,
  loaded: 2,
  failed: 1,
  sessionsSummary: [
    {
      tradingDate: "2026-06-29",
      status: "HISTORICAL_LOCKED",
      candles: 75,
      missing: 0,
      totalTrades: 2,
      wins: 1,
      losses: 1,
      netPnL: 0,
    },
    {
      tradingDate: "2026-06-30",
      status: "HISTORICAL_LOCKED",
      candles: 75,
      missing: 0,
      totalTrades: 1,
      wins: 1,
      losses: 0,
      netPnL: 51,
    },
    {
      tradingDate: "2026-07-01",
      status: "FAILED",
      candles: 0,
      missing: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      netPnL: 0,
      error: "Snapshot date drift",
    },
  ],
  metrics: {
    sessions: 2,
    totalTrades: 3,
    wins: 2,
    losses: 1,
    ambiguous: 0,
    buys: 2,
    sells: 1,
    missedChase: 0,
    cubeApproved: 3,
    cubeRejected: 0,
    firstTouches: 3,
    confirmed: 3,
    retest: 3,
    winRate: 2 / 3,
    profitFactor: 2,
    expectancy: 17,
    netPnL: 51,
    maxDrawdown: 51,
    maxConsecutiveWins: 1,
    maxConsecutiveLosses: 1,
    avgMfe: 40,
    avgMae: -10,
  },
  causalityFailures: 1,
  labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
  generatedAt: HISTORY_GOLDEN_GENERATED_AT,
};

export const HISTORY_RESULT_KEYS = [
  "version",
  "runId",
  "instrument",
  "months",
  "from",
  "to",
  "ambiguousPolicy",
  "attempted",
  "loaded",
  "failed",
  "sessionsSummary",
  "metrics",
  "causalityFailures",
  "labeledAs",
  "generatedAt",
] as const;

export const HISTORY_SESSION_KEYS_REQUIRED = [
  "tradingDate",
  "status",
  "candles",
  "missing",
  "totalTrades",
  "wins",
  "losses",
  "netPnL",
] as const;

export const HISTORY_METRICS_KEYS = [
  "sessions",
  "totalTrades",
  "wins",
  "losses",
  "ambiguous",
  "buys",
  "sells",
  "missedChase",
  "cubeApproved",
  "cubeRejected",
  "firstTouches",
  "confirmed",
  "retest",
  "winRate",
  "profitFactor",
  "expectancy",
  "netPnL",
  "maxDrawdown",
  "maxConsecutiveWins",
  "maxConsecutiveLosses",
  "avgMfe",
  "avgMae",
] as const;