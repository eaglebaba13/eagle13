import { describe, expect, it } from "vitest";
import { runUnifiedBacktest } from "../unified";
import { INTRADAY_FORMULA_VERSIONS } from "../../engine-version";
import type { Candle } from "../../smc-types";
import type { SmcSignalDebug } from "../../smc-signal-engine";
import { DEFAULT_SMC_EXECUTION } from "./smc-historical.adapter";
import { hybridHistoricalAdapter } from "./astro-smc-hybrid.adapter";

const ASTRO_V = INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1;
const SMC_V = INTRADAY_FORMULA_VERSIONS.SMC_V1;

function synthBuyWin(): { candles: Candle[]; signals: SmcSignalDebug[]; date: string } {
  const cs: Candle[] = [];
  const t0 = Date.UTC(2024, 0, 1, 3, 45);
  const step = 5 * 60_000;
  for (let i = 0; i < 20; i++) {
    cs.push({ t: t0 + i * step, o: 100, h: 100.5, l: 99.5, c: 100, v: 1000 });
  }
  for (let i = 6; i < 20; i++) {
    const p = 100 + (i - 5) * 2;
    cs[i] = { t: t0 + i * step, o: p, h: p + 1, l: p - 0.5, c: p, v: 1000 };
  }
  const signals: SmcSignalDebug[] = cs.map((c, i) => ({
    index: i,
    t: c.t,
    signal: i === 5 ? "BUY" : "WAIT",
    bias: "bullish",
    structureDirection: i === 5 ? "bull" : "neutral",
    score: i === 5 ? 90 : 0,
    triggeredRules: i === 5 ? ["CHOCH:bull", "FVG"] : [],
    missingRules: [],
    reasons: i === 5 ? ["ok"] : [],
  }));
  const date = new Date(cs[5].t).toISOString().slice(0, 10);
  return { candles: cs, signals, date };
}

describe("hybridHistoricalAdapter — shape", () => {
  it("exposes ASTRO_SMC_HYBRID_V1 id and 5m granularity", () => {
    expect(hybridHistoricalAdapter.id).toBe(
      INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
    );
    expect(hybridHistoricalAdapter.dataGranularity).toBe("5m");
    expect(hybridHistoricalAdapter.versions.engineVersion).toBe(
      "ASTRO_SMC_HYBRID_ENGINE_V1",
    );
  });
});

describe("hybridHistoricalAdapter — decision integration", () => {
  it("trades on BUY/BUY agreement and stamps Hybrid formula version", async () => {
    const { candles, signals, date } = synthBuyWin();
    const res = await runUnifiedBacktest({
      strategy: "ASTRO_SMC_HYBRID",
      formula: INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-02",
      extras: {
        candles,
        smcSignals: signals,
        astroByDate: { [date]: { direction: "BUY", confidence: 85 } },
        astroFormulaVersion: ASTRO_V,
        smcFormulaVersion: SMC_V,
        hybridConfig: { scoreThreshold: 55, minDataQualityPct: 0 },
        dataQualityPct: 100,
        execution: {
          ...DEFAULT_SMC_EXECUTION,
          stopMode: "swing",
          targetMode: "fixed_rr",
          rr: 1,
        },
      },
    });
    expect(res.formulaVersion).toBe(
      INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
    );
    expect(res.trades.length).toBeGreaterThan(0);
    for (const t of res.trades) {
      expect(t.formulaVersion).toBe(
        INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
      );
      expect((t.metadata as { strategy: string }).strategy).toBe(
        "ASTRO_SMC_HYBRID",
      );
      expect((t.metadata as { hybridScore: number }).hybridScore).toBeGreaterThan(0);
    }
  });

  it("emits no trades on direct BUY/SELL conflict", async () => {
    const { candles, signals, date } = synthBuyWin();
    const res = await runUnifiedBacktest({
      strategy: "ASTRO_SMC_HYBRID",
      formula: INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-02",
      extras: {
        candles,
        smcSignals: signals, // SMC = BUY at index 5
        astroByDate: { [date]: { direction: "SELL", confidence: 90 } },
        astroFormulaVersion: ASTRO_V,
        smcFormulaVersion: SMC_V,
        hybridConfig: { scoreThreshold: 55, minDataQualityPct: 0 },
      },
    });
    expect(res.trades.length).toBe(0);
    const meta = res.formulaMeta as {
      counters: { CONFLICT: number; BUY: number };
    };
    expect(meta.counters.CONFLICT).toBeGreaterThan(0);
  });

  it("emits no trades when astro data is missing (DATA_INCOMPLETE)", async () => {
    const { candles, signals } = synthBuyWin();
    const res = await runUnifiedBacktest({
      strategy: "ASTRO_SMC_HYBRID",
      formula: INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-02",
      extras: {
        candles,
        smcSignals: signals,
        astroByDate: {}, // no astro for the signal's date
        astroFormulaVersion: ASTRO_V,
        smcFormulaVersion: SMC_V,
      },
    });
    expect(res.trades.length).toBe(0);
    const meta = res.formulaMeta as { counters: { DATA_INCOMPLETE: number } };
    expect(meta.counters.DATA_INCOMPLETE).toBeGreaterThan(0);
  });

  it("Run IDs stay deterministic and differ from SMC Run IDs", async () => {
    const { candles, signals, date } = synthBuyWin();
    const args = {
      strategy: "ASTRO_SMC_HYBRID" as const,
      formula: INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-02",
      source: "test",
      extras: {
        candles,
        smcSignals: signals,
        astroByDate: { [date]: { direction: "BUY" as const, confidence: 85 } },
        astroFormulaVersion: ASTRO_V,
        smcFormulaVersion: SMC_V,
        hybridConfig: { scoreThreshold: 55, minDataQualityPct: 0 },
      },
    };
    const a = await runUnifiedBacktest(args);
    const b = await runUnifiedBacktest(args);
    expect(a.runId).toBe(b.runId);
    expect(a.runId.startsWith("ASTRO_SMC_HYBRID_V1")).toBe(true);
  });
});