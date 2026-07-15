// Phase 21.3a · Shared-core tests. Adapter dispatch, determinism, causality,
// cost model parity, stats degeneracy, export provenance.

import { describe, it, expect } from "vitest";
import { computeUnifiedRunId } from "./run-id";
import { runHistoricalCore } from "./runner";
import { buildUnifiedStats } from "./stats";
import {
  applyCosts,
  INDEX_POINT_COSTS,
  ZERO_COSTS,
} from "./cost-model";
import {
  assertClosedCandle,
  assertPostSnapshot,
  requiredCausalityFor,
} from "./causality";
import { exportSummaryCsv, exportTradesCsv, exportFilename } from "./export";
import type { HistoricalFormulaAdapter } from "./adapter";
import type { HistoricalTrade } from "./result";
import { INTRADAY_FORMULA_VERSIONS } from "../engine-version";

const makeTrade = (over: Partial<HistoricalTrade> = {}): HistoricalTrade => ({
  id: "t1",
  date: "2026-03-04",
  side: "BUY",
  entry: 100,
  stop: 95,
  target: 110,
  exit: 110,
  outcome: "WIN",
  pnl: 10,
  mfe: null,
  mae: null,
  holdingTime: null,
  formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
  source: "unit",
  ambiguous: false,
  reasons: [],
  metadata: {},
  ...over,
});

const stubAdapter = (
  id = INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
  trades: HistoricalTrade[] = [],
  supported: string[] = ["NIFTY50"],
): HistoricalFormulaAdapter => ({
  id,
  label: "stub",
  dataGranularity: "5m",
  causality: "intraday-5m",
  supportedInstruments: supported,
  validateConfig() {},
  planSessions() {
    return { dates: trades.map((t) => t.date), causality: "intraday-5m" };
  },
  async evaluateSession(_cfg, date) {
    return { trades: trades.filter((t) => t.date === date) };
  },
  buildMetadata: () => ({ marker: "STUB" }),
  versions: {
    engineVersion: "E1",
    executionVersion: "X1",
    cubeVersion: "C1",
    policyVersion: "P1",
  },
  methodology: "unit-stub",
  disclaimers: ["VALIDATION_ONLY"],
});

describe("Phase 21.3a · Run ID", () => {
  const cfg = {
    formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
    instrument: "NIFTY50",
    from: "2026-01-01",
    to: "2026-06-30",
    policy: "conservative",
    ambiguousPolicy: "conservative",
    costs: ZERO_COSTS,
    source: "yahoo",
    dataGranularity: "5m",
    engineVersion: "E1",
    executionVersion: "X1",
    cubeVersion: "C1",
    policyVersion: "P1",
  };
  it("deterministic — same input → same id", () => {
    expect(computeUnifiedRunId(cfg)).toBe(computeUnifiedRunId(cfg));
  });
  it("prefix is the formula version", () => {
    expect(computeUnifiedRunId(cfg).split(":")[0]).toBe(cfg.formulaVersion);
  });
  it("formula-version isolation — different formulas produce different ids", () => {
    const a = computeUnifiedRunId(cfg);
    const b = computeUnifiedRunId({
      ...cfg,
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
    });
    expect(a).not.toBe(b);
  });
  it("costs/policy/source all participate in the hash", () => {
    const base = computeUnifiedRunId(cfg);
    expect(computeUnifiedRunId({ ...cfg, source: "kite" })).not.toBe(base);
    expect(
      computeUnifiedRunId({ ...cfg, costs: { ...ZERO_COSTS, slippagePct: 0.1 } }),
    ).not.toBe(base);
    expect(computeUnifiedRunId({ ...cfg, policy: "optimistic" })).not.toBe(base);
  });
});

describe("Phase 21.3a · runner", () => {
  it("rejects unsupported instrument", async () => {
    const adapter = stubAdapter();
    await expect(
      runHistoricalCore({
        formula: adapter,
        instrument: "GOLD",
        from: "2026-01-01",
        to: "2026-01-05",
      }),
    ).rejects.toThrow(/does not support/);
  });
  it("iterates plan and aggregates trades deterministically", async () => {
    const trades = [
      makeTrade({ id: "a", date: "2026-01-02", pnl: 10 }),
      makeTrade({ id: "b", date: "2026-01-03", pnl: -5, outcome: "LOSS", exit: 95 }),
      makeTrade({ id: "c", date: "2026-02-01", pnl: 15 }),
    ];
    const adapter = stubAdapter(undefined, trades);
    const r1 = await runHistoricalCore({
      formula: adapter,
      instrument: "NIFTY50",
      from: "2026-01-01",
      to: "2026-02-28",
    });
    const r2 = await runHistoricalCore({
      formula: adapter,
      instrument: "NIFTY50",
      from: "2026-01-01",
      to: "2026-02-28",
    });
    expect(r1.trades).toHaveLength(3);
    expect(r1.monthly.map((m) => m.month)).toEqual(["2026-01", "2026-02"]);
    expect(r1.runId).toBe(r2.runId);
    expect(r1.equityCurve.at(-1)?.equity).toBe(20);
    expect(r1.drawdown?.max).toBeGreaterThanOrEqual(5);
    expect(r1.formulaMeta).toEqual({ marker: "STUB" });
  });
  it("rejects causality plan mismatch", async () => {
    const adapter: HistoricalFormulaAdapter = {
      ...stubAdapter(),
      planSessions: () => ({ dates: [], causality: "daily" }),
    };
    await expect(
      runHistoricalCore({
        formula: adapter,
        instrument: "NIFTY50",
        from: "2026-01-01",
        to: "2026-01-05",
      }),
    ).rejects.toThrow(/Causality mismatch/);
  });
});

describe("Phase 21.3a · causality helpers", () => {
  it("assertClosedCandle rejects open candles", () => {
    expect(assertClosedCandle(2000, 1000).ok).toBe(false);
    expect(assertClosedCandle(1000, 2000).ok).toBe(true);
  });
  it("assertPostSnapshot rejects pre-anchor reads", () => {
    expect(assertPostSnapshot(500, 1000).ok).toBe(false);
    expect(assertPostSnapshot(1500, 1000).ok).toBe(true);
  });
  it("requiredCausalityFor picks the right mode", () => {
    expect(requiredCausalityFor("1d")).toBe("daily");
    expect(requiredCausalityFor("5m")).toBe("intraday-5m");
  });
});

describe("Phase 21.3a · cost model", () => {
  it("zero costs → net equals gross", () => {
    const { netPnl, costs } = applyCosts(10, 100, 110, ZERO_COSTS);
    expect(netPnl).toBe(10);
    expect(costs).toBe(0);
  });
  it("index-point mode is zero-costs", () => {
    expect(INDEX_POINT_COSTS).toEqual(ZERO_COSTS);
  });
  it("brokerage + slippage subtract from gross", () => {
    const { netPnl, costs } = applyCosts(20, 100, 110, {
      slippagePct: 1,
      brokerageFlat: 5,
      brokeragePct: 0,
      taxesPct: 0,
    });
    // notional = 210, slip = 2.10, brokerage flat 5 → total 7.10
    expect(costs).toBe(7.1);
    expect(netPnl).toBe(12.9);
  });
});

describe("Phase 21.3a · stats degeneracy", () => {
  it("no metadata → no dimension slices", () => {
    const trades = [
      makeTrade({ id: "a", pnl: 5 }),
      makeTrade({ id: "b", pnl: -3, outcome: "LOSS", exit: 97 }),
    ];
    const s = buildUnifiedStats(trades, 2, 3);
    expect(s.dimensions.planet).toBeUndefined();
    expect(s.dimensions.safeRisky).toBeUndefined();
    expect(s.overall.sampleSize).toBe(2);
  });
  it("safeRisky metadata → slice appears", () => {
    const trades = [
      makeTrade({ id: "a", pnl: 5, metadata: { safeRisky: "SAFE" } }),
      makeTrade({ id: "b", pnl: -3, outcome: "LOSS", exit: 97, metadata: { safeRisky: "RISKY" } }),
      makeTrade({ id: "c", pnl: 8, metadata: { safeRisky: "SAFE" } }),
    ];
    const s = buildUnifiedStats(trades, 10, 3);
    expect(s.dimensions.safeRisky).toBeDefined();
    expect(s.dimensions.safeRisky!.map((d) => d.key)).toEqual(["RISKY", "SAFE"]);
    const safe = s.dimensions.safeRisky!.find((d) => d.key === "SAFE")!;
    expect(safe.count).toBe(2);
  });
});

describe("Phase 21.3a · export provenance", () => {
  const buildRun = async () => {
    const trades = [makeTrade({ id: "a", pnl: 10 })];
    const adapter = stubAdapter(undefined, trades);
    return await runHistoricalCore({
      formula: adapter,
      instrument: "NIFTY50",
      from: "2026-01-01",
      to: "2026-03-31",
      source: "yahoo",
    });
  };
  it("summary CSV includes all provenance tokens", async () => {
    const r = await buildRun();
    const csv = exportSummaryCsv(r, { validationOnly: true });
    expect(csv).toContain(`formulaVersion=${r.formulaVersion}`);
    expect(csv).toContain(`runId=${r.runId}`);
    expect(csv).toContain(`generatedAt=${r.generatedAt}`);
    expect(csv).toContain(`source=yahoo`);
    expect(csv).toContain(`dataGranularity=5m`);
    expect(csv).toContain(`labeledAs=VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION`);
  });
  it("trades CSV emits one row per trade", async () => {
    const r = await buildRun();
    const csv = exportTradesCsv(r);
    const rowCount = csv.split("\n").filter((l) => !l.startsWith("#") && l).length;
    // header + 1 trade row
    expect(rowCount).toBe(2);
  });
  it("filename includes formula, section, instrument, dates", async () => {
    const r = await buildRun();
    const fn = exportFilename(r, "trades", "csv");
    expect(fn).toBe(`${r.formulaVersion}_trades_NIFTY50_2026-01-01_2026-03-31.csv`);
  });
});
