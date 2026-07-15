import { describe, it, expect } from "vitest";
import {
  computeMonteCarloRunId,
  mulberry32,
  runMonteCarlo,
  type MonteCarloTrade,
} from "./monte-carlo";

const TRADES: MonteCarloTrade[] = [
  { pnl: 10 }, { pnl: -5 }, { pnl: 8 }, { pnl: -3 }, { pnl: 12 },
  { pnl: -7 }, { pnl: 6 }, { pnl: -2 }, { pnl: 15 }, { pnl: -8 },
  { pnl: 4 }, { pnl: -6 }, { pnl: 9 }, { pnl: -1 }, { pnl: 11 },
  { pnl: -4 }, { pnl: 7 }, { pnl: -9 }, { pnl: 13 }, { pnl: -3 },
];

describe("Phase 21.6 Stage 1 · Monte Carlo — determinism", () => {
  it("same seed + same trades ⇒ byte-identical output", () => {
    const a = runMonteCarlo(TRADES, { seed: 42, simulations: 100, startingCapital: 1000, samplingMode: "BOOTSTRAP" });
    const b = runMonteCarlo(TRADES, { seed: 42, simulations: 100, startingCapital: 1000, samplingMode: "BOOTSTRAP" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("different seeds produce different distributions", () => {
    const a = runMonteCarlo(TRADES, { seed: 1, simulations: 100, startingCapital: 1000, samplingMode: "BOOTSTRAP" });
    const b = runMonteCarlo(TRADES, { seed: 2, simulations: 100, startingCapital: 1000, samplingMode: "BOOTSTRAP" });
    expect(a.finalEquity.p50).not.toBe(b.finalEquity.p50);
  });

  it("mulberry32 is deterministic for the same seed", () => {
    const r1 = mulberry32(7); const r2 = mulberry32(7);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe("Phase 21.6 Stage 1 · Monte Carlo — sampling modes", () => {
  const cfgBase = { seed: 42, simulations: 50, startingCapital: 1000 } as const;
  it("SHUFFLE preserves the trade multiset (sum of PnLs equal to base sum)", () => {
    const baseSum = TRADES.reduce((a, t) => a + t.pnl, 0);
    const r = runMonteCarlo(TRADES, { ...cfgBase, samplingMode: "SHUFFLE" });
    expect(r.finalEquity.p5).toBe(cfgBase.startingCapital + baseSum);
    expect(r.finalEquity.p95).toBe(cfgBase.startingCapital + baseSum);
  });
  it("BOOTSTRAP produces a distribution with variance", () => {
    const r = runMonteCarlo(TRADES, { ...cfgBase, samplingMode: "BOOTSTRAP" });
    expect(r.finalEquity.p95).toBeGreaterThan(r.finalEquity.p5);
  });
  it("BLOCK_BOOTSTRAP respects blockSize option", () => {
    const r = runMonteCarlo(TRADES, { ...cfgBase, samplingMode: "BLOCK_BOOTSTRAP", blockSize: 4 });
    expect(r.assumptions.some((a) => a.includes("blockSize=4"))).toBe(true);
  });
  it("PERTURB flips the requested fraction and records it", () => {
    const r = runMonteCarlo(TRADES, { ...cfgBase, samplingMode: "PERTURB", perturbPct: 0.5 });
    expect(r.assumptions.some((a) => a.includes("perturbPct=0.5"))).toBe(true);
  });
});

describe("Phase 21.6 Stage 1 · Monte Carlo — ruin & percentiles", () => {
  it("percentiles are ordered p5 ≤ p50 ≤ p95", () => {
    const r = runMonteCarlo(TRADES, { seed: 3, simulations: 200, startingCapital: 1000, samplingMode: "BOOTSTRAP" });
    expect(r.finalEquity.p5).toBeLessThanOrEqual(r.finalEquity.p50);
    expect(r.finalEquity.p50).toBeLessThanOrEqual(r.finalEquity.p95);
    expect(r.maxDrawdown.p5).toBeLessThanOrEqual(r.maxDrawdown.p95);
  });
  it("worst path ≤ median path ≤ best path (by final equity)", () => {
    const r = runMonteCarlo(TRADES, { seed: 3, simulations: 200, startingCapital: 1000, samplingMode: "BOOTSTRAP" });
    const worstF = r.worstPath[r.worstPath.length - 1];
    const medF = r.medianPath[r.medianPath.length - 1];
    const bestF = r.bestPath[r.bestPath.length - 1];
    expect(worstF).toBeLessThanOrEqual(medF);
    expect(medF).toBeLessThanOrEqual(bestF);
  });
  it("ruin probability uses a transparent formula string", () => {
    const r = runMonteCarlo(TRADES, { seed: 3, simulations: 100, startingCapital: 1000, samplingMode: "BOOTSTRAP", ruin: { kind: "DRAWDOWN_PCT", value: 0.3 } });
    expect(r.ruinFormula).toContain("30.0%");
  });
  it("capital-floor ruin is honoured", () => {
    const bad: MonteCarloTrade[] = Array.from({ length: 20 }, () => ({ pnl: -100 }));
    const r = runMonteCarlo(bad, { seed: 1, simulations: 20, startingCapital: 500, samplingMode: "SHUFFLE", ruin: { kind: "CAPITAL_FLOOR", value: 0 } });
    expect(r.probabilityOfRuin).toBeGreaterThan(0);
    expect(r.ruinFormula).toContain("min(path.equity)");
  });
  it("empty trade list returns INSUFFICIENT_DATA assumption", () => {
    const r = runMonteCarlo([], { seed: 1, simulations: 10, startingCapital: 1000, samplingMode: "SHUFFLE" });
    expect(r.tradeCount).toBe(0);
    expect(r.assumptions.join(" ")).toContain("INSUFFICIENT_DATA");
  });
});

describe("Phase 21.6 Stage 1 · Monte Carlo — Run ID", () => {
  const base = {
    baseRunId: "RUN_A", seed: 1, simulations: 100, samplingMode: "BOOTSTRAP" as const,
    startingCapital: 1000, ruin: { kind: "DRAWDOWN_PCT" as const, value: 0.2 }, tradeCount: 20,
  };
  it("is deterministic and prefixed MONTE_CARLO_V1", () => {
    expect(computeMonteCarloRunId(base)).toBe(computeMonteCarloRunId(base));
    expect(computeMonteCarloRunId(base)).toMatch(/^MONTE_CARLO_V1:[0-9a-f]{8}$/);
  });
  it("changes when seed or sampling mode changes", () => {
    expect(computeMonteCarloRunId(base)).not.toBe(computeMonteCarloRunId({ ...base, seed: 2 }));
    expect(computeMonteCarloRunId(base)).not.toBe(computeMonteCarloRunId({ ...base, samplingMode: "SHUFFLE" }));
  });
});
