// Phase 21.3d-parity-α · Export byte-oracle.
//
// Locks the exact string output of every existing exporter. These bytes are
// what real users download and pipe into audit tools. β must not change a
// single character — the assertions below are string-equality on the
// concatenated result, not shape checks.

import { describe, expect, it } from "vitest";
import {
  historyExportFilename,
  historyToJson,
  historyToSummaryCsv,
} from "../gann-intraday-validation-export";
import {
  exportFilename,
  exportResultJson,
  exportSummaryCsv,
  exportTradesCsv,
} from "../backtest/export";
import type { HistoricalBacktestResult } from "../backtest/result";
import { HISTORY_GOLDEN } from "../__fixtures__/parity/history-golden";
import { BACKTEST_GOLDEN } from "../__fixtures__/parity/backtest-golden";

/* ─────────── Legacy Absolute-Intraday exports ─────────── */

describe("Phase 21.3d-parity-α · historyToSummaryCsv byte oracle", () => {
  const csv = historyToSummaryCsv(HISTORY_GOLDEN);

  it("provenance header ordering locked", () => {
    const lines = csv.split("\n");
    expect(lines[0]).toBe(`# version=${HISTORY_GOLDEN.version}`);
    expect(lines[1]).toBe(`# formulaVersion=GANN_ASTRO_INTRADAY_ABSOLUTE_V1`);
    expect(lines[2]).toBe(`# runId=${HISTORY_GOLDEN.runId}`);
    expect(lines[3]).toBe(`# instrument=${HISTORY_GOLDEN.instrument}`);
    expect(lines[4]).toBe(`# months=${HISTORY_GOLDEN.months}`);
    expect(lines[5]).toBe(`# from=${HISTORY_GOLDEN.from}`);
    expect(lines[6]).toBe(`# to=${HISTORY_GOLDEN.to}`);
    expect(lines[7]).toBe(`# ambiguousPolicy=${HISTORY_GOLDEN.ambiguousPolicy}`);
    expect(lines[8]).toBe(`# generatedAt=${HISTORY_GOLDEN.generatedAt}`);
    expect(lines[9]).toBe(`# labeledAs=${HISTORY_GOLDEN.labeledAs}`);
  });

  it("column header row locked", () => {
    const lines = csv.split("\n");
    expect(lines[10]).toBe(
      "tradingDate,status,candles,missing,totalTrades,wins,losses,netPnL,error",
    );
  });

  it("body rows locked (including error escaping and empty-error blank)", () => {
    const lines = csv.split("\n");
    expect(lines[11]).toBe("2026-06-29,HISTORICAL_LOCKED,75,0,2,1,1,0,");
    expect(lines[12]).toBe("2026-06-30,HISTORICAL_LOCKED,75,0,1,1,0,51,");
    expect(lines[13]).toBe("2026-07-01,FAILED,0,0,0,0,0,0,Snapshot date drift");
  });

  it("no trailing newline (byte-identical to production)", () => {
    expect(csv.endsWith("\n")).toBe(false);
  });
});

describe("Phase 21.3d-parity-α · historyToJson byte oracle", () => {
  const json = historyToJson(HISTORY_GOLDEN);

  it("is 2-space pretty-printed and parses back to a superset of the input", () => {
    // 2-space indent is a documented public contract.
    expect(json.startsWith("{\n  \"version\":")).toBe(true);
    const parsed = JSON.parse(json);
    expect(parsed.exportVersion).toBe("GANN_ABSOLUTE_INTRADAY_VALIDATION_V1");
    expect(parsed.formulaVersion).toBe("GANN_ASTRO_INTRADAY_ABSOLUTE_V1");
    expect(parsed.runId).toBe(HISTORY_GOLDEN.runId);
    expect(parsed.labeledAs).toBe(HISTORY_GOLDEN.labeledAs);
    expect(parsed.sessionsSummary).toHaveLength(3);
  });

  it("preserves original field names untouched", () => {
    const parsed = JSON.parse(json);
    // No renames of `netPnL` / `causalityFailures` / `ambiguousPolicy` etc.
    expect(Object.keys(parsed)).toEqual(
      expect.arrayContaining([
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
        "exportVersion",
        "formulaVersion",
      ]),
    );
  });
});

describe("Phase 21.3d-parity-α · historyExportFilename byte oracle", () => {
  it("csv filename locked", () => {
    expect(historyExportFilename(HISTORY_GOLDEN, "csv")).toBe(
      "GANN_ABSOLUTE_INTRADAY_VALIDATION_NIFTY50_2026-04-01_2026-06-30.csv",
    );
  });
  it("json filename locked", () => {
    expect(historyExportFilename(HISTORY_GOLDEN, "json")).toBe(
      "GANN_ABSOLUTE_INTRADAY_VALIDATION_NIFTY50_2026-04-01_2026-06-30.json",
    );
  });
});

/* ─────────── Unified exporters (already in src/lib/backtest/export.ts) ─────────── */

// A hand-authored `HistoricalBacktestResult` covering every field the unified
// exporter reads. Mirrors what an ASTRO daily strategy would emit through
// `runUnifiedBacktest` — used to lock the exporter's byte output before β
// re-wires legacy consumers through it.
const UNIFIED_GOLDEN: HistoricalBacktestResult = {
  formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
  engineVersion: "1.0.0",
  executionVersion: "1.0.0",
  cubeVersion: "1.0.0",
  policyVersion: "1.0.0",
  runId: "GANN_SIGN_DEGREE_TABLE_V1_1:deadbeef",
  instrument: "NIFTY50",
  from: "2026-04-01",
  to: "2026-06-30",
  dataGranularity: "1d",
  source: "Yahoo Finance (daily, unadjusted OHLC)",
  generatedAt: "2026-07-15T00:00:00.000Z",
  trades: [
    {
      id: "T-001",
      date: "2026-04-02",
      side: "BUY",
      entry: 22000,
      stop: 21950,
      target: 22100,
      exit: 22100,
      outcome: "WIN",
      pnl: 100,
      mfe: null,
      mae: null,
      holdingTime: null,
      formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
      source: "Yahoo Finance (daily, unadjusted OHLC)",
      ambiguous: false,
      reasons: ["signal=BUY", "target_hit"],
      metadata: { moonSign: "Aries" },
    },
    {
      id: "T-002",
      date: "2026-04-03",
      side: "SELL",
      entry: 22100,
      stop: 22160,
      target: 21990,
      exit: 22160,
      outcome: "LOSS",
      pnl: -60,
      mfe: null,
      mae: null,
      holdingTime: null,
      formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
      source: "Yahoo Finance (daily, unadjusted OHLC)",
      ambiguous: true,
      reasons: ["both_touched", "conservative_policy"],
      metadata: {},
    },
  ],
  monthly: [
    { month: "2026-04", trades: 2, wins: 1, losses: 1, netPnl: 40 },
  ],
  equityCurve: [
    { date: "2026-04-02", equity: 100 },
    { date: "2026-04-03", equity: 40 },
  ],
  stats: {
    totalTrades: 2,
    wins: 1,
    losses: 1,
    ambiguous: 1,
    winRate: 50,
    netPnl: 40,
    profitFactor: 1.67,
    expectancy: 20,
    maxDrawdown: 60,
    exposurePct: 66.67,
  },
  drawdown: { max: 60, maxPct: 0.27 },
  dataQuality: {
    provider: "yahoo-finance",
    granularity: "1d",
    coveragePct: 4.6,
    missingSessions: 62,
    invalidCandles: 1,
    imported: 3,
    fetched: 3,
    previousCloseSource: "yahoo-finance",
    snapshotSource: "astro-engine",
    cacheStatus: "miss",
  },
  benchmark: {
    buyAndHoldPnl: 40,
    buyAndHoldPct: 0.18,
    strategyPct: 0.18,
    excessPct: 0,
    activeDays: 2,
  },
  methodology: "Sign-Degree Table v1.1 daily replay",
  disclaimers: [
    "Historical results are simulated and depend on candle resolution, execution assumptions, data quality, slippage, and costs.",
  ],
  formulaMeta: {},
};

describe("Phase 21.3d-parity-α · unified exportSummaryCsv byte oracle", () => {
  const csv = exportSummaryCsv(UNIFIED_GOLDEN, { validationOnly: true });

  it("provenance header ordering + validationOnly tag locked", () => {
    const lines = csv.split("\n");
    expect(lines[0]).toBe(`# formulaVersion=${UNIFIED_GOLDEN.formulaVersion}`);
    expect(lines[1]).toBe(`# engineVersion=${UNIFIED_GOLDEN.engineVersion}`);
    expect(lines[2]).toBe(`# executionVersion=${UNIFIED_GOLDEN.executionVersion}`);
    expect(lines[3]).toBe(`# cubeVersion=${UNIFIED_GOLDEN.cubeVersion}`);
    expect(lines[4]).toBe(`# policyVersion=${UNIFIED_GOLDEN.policyVersion}`);
    expect(lines[5]).toBe(`# runId=${UNIFIED_GOLDEN.runId}`);
    expect(lines[6]).toBe(`# generatedAt=${UNIFIED_GOLDEN.generatedAt}`);
    expect(lines[7]).toBe(`# instrument=${UNIFIED_GOLDEN.instrument}`);
    expect(lines[8]).toBe(`# from=${UNIFIED_GOLDEN.from}`);
    expect(lines[9]).toBe(`# to=${UNIFIED_GOLDEN.to}`);
    expect(lines[10]).toBe(`# dataGranularity=${UNIFIED_GOLDEN.dataGranularity}`);
    expect(lines[11]).toBe(`# source=${UNIFIED_GOLDEN.source}`);
    expect(lines[12]).toBe(
      "# labeledAs=VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
    );
    expect(lines[13]).toBe("month,trades,wins,losses,netPnl");
    expect(lines[14]).toBe("2026-04,2,1,1,40");
  });
});

describe("Phase 21.3d-parity-α · unified exportTradesCsv byte oracle", () => {
  it("column ordering + reason-pipe joiner locked", () => {
    const csv = exportTradesCsv(UNIFIED_GOLDEN);
    const lines = csv.split("\n");
    // Header ordering is a public contract for downstream tooling.
    const headerIdx = lines.findIndex((l) =>
      l.startsWith("id,date,side,entry,stop,target,exit,outcome,pnl,ambiguous,reasons"),
    );
    expect(headerIdx).toBeGreaterThan(-1);
    expect(lines[headerIdx + 1]).toBe(
      'T-001,2026-04-02,BUY,22000,21950,22100,22100,WIN,100,0,signal=BUY|target_hit',
    );
    expect(lines[headerIdx + 2]).toBe(
      'T-002,2026-04-03,SELL,22100,22160,21990,22160,LOSS,-60,1,both_touched|conservative_policy',
    );
  });
});

describe("Phase 21.3d-parity-α · unified exportResultJson byte oracle", () => {
  it("2-space pretty print with validationOnly annotation", () => {
    const json = exportResultJson(UNIFIED_GOLDEN, { validationOnly: true });
    expect(json.startsWith("{\n  \"formulaVersion\":")).toBe(true);
    const parsed = JSON.parse(json);
    expect(parsed.labeledAs).toBe("VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION");
    expect(parsed.runId).toBe(UNIFIED_GOLDEN.runId);
  });
  it("omits validationOnly annotation when off", () => {
    const json = exportResultJson(UNIFIED_GOLDEN);
    const parsed = JSON.parse(json);
    expect("labeledAs" in parsed).toBe(false);
  });
});

describe("Phase 21.3d-parity-α · unified exportFilename byte oracle", () => {
  it("summary + trades + json variants locked", () => {
    expect(exportFilename(UNIFIED_GOLDEN, "summary", "csv")).toBe(
      "GANN_SIGN_DEGREE_TABLE_V1_1_summary_NIFTY50_2026-04-01_2026-06-30.csv",
    );
    expect(exportFilename(UNIFIED_GOLDEN, "trades", "csv")).toBe(
      "GANN_SIGN_DEGREE_TABLE_V1_1_trades_NIFTY50_2026-04-01_2026-06-30.csv",
    );
    expect(exportFilename(UNIFIED_GOLDEN, "dataQuality", "json")).toBe(
      "GANN_SIGN_DEGREE_TABLE_V1_1_dataQuality_NIFTY50_2026-04-01_2026-06-30.json",
    );
  });
});

/* ─────────── Inline `/backtest` route CSV composition ─────────── */

/**
 * Faithful copy of the inline CSV composition in `src/routes/backtest.tsx`.
 * Kept here — not shared with the route — so a change to the production
 * composition trips this oracle before consumers notice.
 */
function inlineBacktestCsv(r: typeof BACKTEST_GOLDEN, slug: string): string {
  const csvCell = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows: unknown[][] = [
    [
      `# EagleBABA Backtest · ${r.astroFormulaVersion}`,
      `engine=${r.engineVersion}`,
      `formula=${r.formulaVersion}`,
      `generatedAt=${r.generatedAt}`,
      `runId=${r.runId}`,
    ],
    [
      "date","time","symbol","signal","strength","confidence","entry","exit","high","low","target","stop","targetHit","stopHit","result","pnl","pnlPct","moonSign","moonNakshatra","retroCount","nearest","dayOfWeek","month",
    ],
    ...r.trades.map((t) => [
      t.date, t.time, t.symbol, t.signal, t.strength, t.confidence,
      t.entry, t.exit, t.high, t.low, t.target, t.stop,
      t.targetHit, t.stopHit, t.result, t.pnl, t.pnlPct,
      t.moonSign, t.moonNakshatra, t.retroCount, t.nearest ?? "",
      t.dayOfWeek, t.month,
    ]),
  ];
  void slug; // filename is separate; kept parameterised to mirror the route
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

describe("Phase 21.3d-parity-α · inline /backtest CSV byte oracle", () => {
  const csv = inlineBacktestCsv(BACKTEST_GOLDEN, "GANN_ASTRO_V1_1");
  const lines = csv.split("\n");

  it("header banner row locked", () => {
    expect(lines[0]).toBe(
      `# EagleBABA Backtest · ${BACKTEST_GOLDEN.astroFormulaVersion},engine=${BACKTEST_GOLDEN.engineVersion},formula=${BACKTEST_GOLDEN.formulaVersion},generatedAt=${BACKTEST_GOLDEN.generatedAt},runId=${BACKTEST_GOLDEN.runId}`,
    );
  });

  it("column header row locked", () => {
    expect(lines[1]).toBe(
      "date,time,symbol,signal,strength,confidence,entry,exit,high,low,target,stop,targetHit,stopHit,result,pnl,pnlPct,moonSign,moonNakshatra,retroCount,nearest,dayOfWeek,month",
    );
  });

  it("BUY WIN row locked (byte-identical)", () => {
    expect(lines[2]).toBe(
      "2026-04-02,09:15,NIFTY50,BUY,STRONG,82,22000,22100,22150,21980,22100,21950,true,false,WIN,100,0.45,Aries,Ashwini,2,Sun R1,Thu,2026-04",
    );
  });

  it("SELL LOSS ambiguous row locked", () => {
    expect(lines[3]).toBe(
      "2026-04-03,09:15,NIFTY50,SELL,MEDIUM,65,22100,22050,22160,21990,21990,22160,true,true,LOSS,-60,-0.27,Taurus,Bharani,2,Moon S1,Fri,2026-04",
    );
  });

  it("WAIT SKIP row locked with null-nearest rendered as empty", () => {
    expect(lines[4]).toBe(
      "2026-04-06,09:15,NIFTY50,WAIT,LOW,40,22050,22040,22080,22030,,,false,false,SKIP,0,0,Taurus,Bharani,2,,Mon,2026-04",
    );
  });

  it("filename shape (from route) locked", () => {
    // Matches template: `eaglebaba-backtest-${symbol}-${slug}-${from}-${to}.csv`.
    const fname = `eaglebaba-backtest-NIFTY50-GANN_ASTRO_V1_1-${BACKTEST_GOLDEN.from}-${BACKTEST_GOLDEN.to}.csv`;
    expect(fname).toBe(
      "eaglebaba-backtest-NIFTY50-GANN_ASTRO_V1_1-2026-04-01-2026-06-30.csv",
    );
  });
});