// Phase 23 · Stage 1 — Shadow validation deterministic tests.

import { describe, expect, it } from "vitest";
import { reduce, evaluateEntryGates } from "./shadow-orchestrator";
import type { OrchestratorInput } from "./shadow-orchestrator";
import { trackOutcome } from "./shadow-outcome";
import { computeShadowMetrics, calibrationCurve } from "./shadow-metrics";
import { classifyShadowDrift } from "./shadow-drift";
import { ShadowHistoryStore } from "./shadow-history";
import {
  computeShadowObservationRunId,
  computeShadowPortfolioRunId,
  computeShadowSessionRunId,
} from "./shadow-run-id";
import {
  buildDriftCsv,
  buildEventsCsv,
  buildMetricsCsv,
  buildObservationsCsv,
  buildPortfolioShadowCsv,
  buildSessionsCsv,
  buildShadowBundleJson,
} from "./shadow-exports";
import {
  defaultPolicy,
  emptyOutcome,
  SHADOW_DISCLAIMER,
  type ShadowClosedCandle,
  type ShadowDataSnapshot,
  type ShadowHypotheticalPosition,
  type ShadowObservation,
  type ShadowPortfolioDecision,
  type ShadowRecommendation,
} from "./shadow-types";

function candle(date: string, o: number, h: number, l: number, c: number): ShadowClosedCandle {
  return { date, open: o, high: h, low: l, close: c, closed: true };
}

function mkData(overrides: Partial<ShadowDataSnapshot> = {}): ShadowDataSnapshot {
  return {
    instrument: "NIFTY50",
    timeframe: "5m",
    session: "2024-01-15",
    providerId: "MOCK",
    providerTimestamp: "2024-01-15T09:20:00Z",
    timezone: "Asia/Kolkata",
    dataHash: "hash-abc",
    quality: "LIVE",
    ageSeconds: 30,
    candles: [candle("2024-01-15T09:15:00Z", 100, 101, 99.5, 100.5)],
    ...overrides,
  };
}

function mkRec(overrides: Partial<ShadowRecommendation> = {}): ShadowRecommendation {
  return {
    runId: "REC_V1:abc",
    strategy: "ASTRO",
    formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
    direction: "BUY",
    confidence: 0.75,
    reliability: "HIGH",
    score: 0.8,
    regime: "TREND_UP",
    ...overrides,
  };
}

function mkPort(overrides: Partial<ShadowPortfolioDecision> = {}): ShadowPortfolioDecision {
  return {
    runId: "PORTFOLIO_RESEARCH_V1:xyz",
    assetId: "asset-1",
    included: true,
    allocationWeight: 0.3,
    sizingUnits: 10,
    riskBudgetPct: 0.01,
    correlationExposure: 0.4,
    capitalUtilizationPct: 0.5,
    confidence: 0.7,
    hardGatePassed: true,
    blockingReasons: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    data: mkData(),
    recommendation: mkRec(),
    portfolio: mkPort(),
    policy: defaultPolicy(),
    nowIso: "2024-01-15T09:20:30Z",
    hasActiveShadow: false,
    strategiesAgree: true,
    causalityOk: true,
    formulaAligned: true,
    ...overrides,
  };
}

describe("orchestrator entry gates", () => {
  it("ENTRY_READY when all gates pass", () => {
    const r = reduce(baseInput());
    expect(r.gate.ok).toBe(true);
    expect(r.session.status).toBe("ENTRY_READY_SHADOW");
    expect(r.observation?.hypothetical).not.toBeNull();
  });

  it("blocks on stale data quality", () => {
    const g = evaluateEntryGates(baseInput({ data: mkData({ quality: "STALE" }) }));
    expect(g.ok).toBe(false);
    expect(g.status).toBe("STALE_DATA");
    expect(g.reasons).toContain("STALE_DATA");
  });

  it("blocks when ageSeconds exceeds policy", () => {
    const g = evaluateEntryGates(baseInput({ data: mkData({ ageSeconds: 999999 }) }));
    expect(g.ok).toBe(false);
    expect(g.status).toBe("STALE_DATA");
  });

  it("blocks on formula mismatch", () => {
    const g = evaluateEntryGates(baseInput({ formulaAligned: false }));
    expect(g.status).toBe("FORMULA_MISMATCH");
  });

  it("blocks on causality failure", () => {
    const g = evaluateEntryGates(baseInput({ causalityOk: false }));
    expect(g.status).toBe("CAUSALITY_FAILURE");
  });

  it("blocks on low confidence", () => {
    const g = evaluateEntryGates(baseInput({ recommendation: mkRec({ confidence: 0.1 }) }));
    expect(g.ok).toBe(false);
    expect(g.reasons).toContain("LOW_CONFIDENCE");
  });

  it("blocks on POOR reliability", () => {
    const g = evaluateEntryGates(baseInput({ recommendation: mkRec({ reliability: "POOR" }) }));
    expect(g.reasons).toContain("RELIABILITY_BLOCKED");
  });

  it("blocks on strategy conflict", () => {
    const g = evaluateEntryGates(baseInput({ strategiesAgree: false }));
    expect(g.reasons).toContain("STRATEGY_CONFLICT");
  });

  it("blocks when portfolio hard gate fails", () => {
    const g = evaluateEntryGates(baseInput({ portfolio: mkPort({ hardGatePassed: false }) }));
    expect(g.reasons).toContain("PORTFOLIO_HARD_GATE");
  });

  it("blocks when active shadow exists", () => {
    const g = evaluateEntryGates(baseInput({ hasActiveShadow: true }));
    expect(g.reasons).toContain("ACTIVE_SHADOW_EXISTS");
  });

  it("records blocked recommendation as observation with reasons", () => {
    const r = reduce(baseInput({ strategiesAgree: false }));
    expect(r.gate.ok).toBe(false);
    expect(r.observation?.hypothetical).toBeNull();
    expect(r.observation?.blockingReasons).toContain("STRATEGY_CONFLICT");
  });

  it("emits BLOCKED event when gate fails", () => {
    const r = reduce(baseInput({ recommendation: mkRec({ confidence: 0.1 }) }));
    expect(r.events.some((e) => e.kind === "BLOCKED")).toBe(true);
  });
});

describe("outcome tracking", () => {
  const pos: ShadowHypotheticalPosition = {
    side: "LONG",
    entry: 100,
    stop: 99,
    target: 102,
    entryDate: "2024-01-15T09:15:00Z",
  };

  it("resolves TARGET", () => {
    const out = trackOutcome({
      position: pos,
      candles: [candle("t1", 100, 100.5, 99.8, 100.2), candle("t2", 100.2, 102.5, 100, 102.2)],
      policy: defaultPolicy(),
    });
    expect(out.exit).toBe("TARGET");
    expect(out.netPoints).toBeGreaterThan(0);
  });

  it("resolves STOP", () => {
    const out = trackOutcome({
      position: pos,
      candles: [candle("t1", 100, 100.5, 98.5, 98.7)],
      policy: defaultPolicy(),
    });
    expect(out.exit).toBe("STOP");
    expect(out.netPoints).toBeLessThan(0);
  });

  it("resolves SESSION_CLOSE when neither hit", () => {
    const out = trackOutcome({
      position: pos,
      candles: [candle("t1", 100, 101, 99.5, 100.5)],
      policy: defaultPolicy(),
    });
    expect(out.exit).toBe("SESSION_CLOSE");
  });

  it("resolves MAX_HOLD", () => {
    const out = trackOutcome({
      position: pos,
      candles: [candle("t1", 100, 100.5, 99.5, 100.1), candle("t2", 100.1, 100.6, 99.6, 100.2)],
      policy: { ...defaultPolicy(), maxHoldBars: 1 },
    });
    expect(out.exit).toBe("MAX_HOLD");
  });

  it("resolves INVALIDATED", () => {
    const out = trackOutcome({ position: pos, candles: [], policy: defaultPolicy(), invalidated: true });
    expect(out.exit).toBe("INVALIDATED");
  });

  it("resolves DATA_QUALITY", () => {
    const out = trackOutcome({ position: pos, candles: [], policy: defaultPolicy(), dataQualityFailed: true });
    expect(out.exit).toBe("DATA_QUALITY");
  });

  it("tracks MFE and MAE", () => {
    const out = trackOutcome({
      position: pos,
      candles: [candle("t1", 100, 101.5, 99.3, 101), candle("t2", 101, 101.2, 100.5, 100.8)],
      policy: defaultPolicy(),
    });
    expect(out.mfe).toBeCloseTo(1.5, 5);
    expect(out.mae).toBeCloseTo(-0.7, 5);
  });
});

function fakeObs(id: string, direction: "BUY" | "SELL", conf: number, net: number): ShadowObservation {
  return {
    id,
    sessionId: "s-" + id,
    recordedAt: "2024-01-15T09:20:00Z",
    strategy: "ASTRO",
    formulaVersion: "F",
    instrument: "NIFTY50",
    timeframe: "5m",
    regime: null,
    direction,
    confidence: conf,
    reliability: "HIGH",
    score: 0.5,
    blockingReasons: [],
    status: "TARGET_HIT_SHADOW",
    hypothetical: {
      side: direction === "BUY" ? "LONG" : "SHORT",
      entry: 100,
      stop: 99,
      target: 102,
      entryDate: "t0",
    },
    outcome: { ...emptyOutcome(), resolved: true, exit: "TARGET", exitPrice: 100, exitDate: "t1", mfe: 2, mae: -0.5, holdingBars: 3, netPoints: net, netAfterCosts: net },
    evidence: {
      recommendationRunId: "REC:" + id,
      portfolioRunId: null,
      dataHash: "h",
      providerId: "MOCK",
      providerTimestamp: "t",
      formulaVersion: "F",
      regime: null,
      confidence: conf,
      reliability: "HIGH",
      reasons: [],
    },
    dataQuality: "LIVE",
  };
}

describe("metrics + calibration", () => {
  const obs = [
    fakeObs("a", "BUY", 0.8, 2),
    fakeObs("b", "BUY", 0.8, -1),
    fakeObs("c", "SELL", 0.6, 3),
    fakeObs("d", "BUY", 0.4, -0.5),
  ];

  it("computes win rate + profit factor", () => {
    const m = computeShadowMetrics(obs);
    expect(m.entries).toBe(4);
    expect(m.winRate).toBeCloseTo(0.5, 5);
    expect(m.profitFactor).toBeCloseTo(5 / 1.5, 5);
  });

  it("produces calibration buckets", () => {
    const c = calibrationCurve(obs, 5);
    expect(c).toHaveLength(5);
    expect(c.reduce((a, b) => a + b.count, 0)).toBe(4);
  });
});

describe("drift classification", () => {
  it("returns INSUFFICIENT_DATA when sample too small", () => {
    const r = classifyShadowDrift({
      baseline: { winRate: 0.55, profitFactor: 1.5, expectedConfidence: 0.6, capitalUtilization: 0.5, dataQualityScore: 1, correlation: 0.3 },
      current: { ...zeroMetrics(), dataQualityScore: 1 },
      sampleSize: 5,
    });
    expect(r.overall).toBe("INSUFFICIENT_DATA");
  });

  it("returns CRITICAL_DRIFT on large delta", () => {
    const r = classifyShadowDrift({
      baseline: { winRate: 0.55, profitFactor: 1.5, expectedConfidence: 0.6, capitalUtilization: 0.5, dataQualityScore: 1, correlation: 0.3 },
      current: { ...zeroMetrics(), winRate: 0.05, highConfidenceAccuracy: 0.05, capitalUtilization: 0.05, dataQualityScore: 0.05 },
      sampleSize: 100,
    });
    expect(["CRITICAL_DRIFT", "MATERIAL_DRIFT"]).toContain(r.overall);
  });
});

function zeroMetrics(): ReturnType<typeof computeShadowMetrics> {
  return computeShadowMetrics([]);
}

describe("history store", () => {
  it("deduplicates observations by id and respects cap", () => {
    const store = new ShadowHistoryStore({ maxObservations: 3 });
    for (let i = 0; i < 10; i++) store.addObservation(fakeObs("id-" + i, "BUY", 0.6, 1));
    store.addObservation(fakeObs("id-9", "BUY", 0.6, 1)); // duplicate id
    const snap = store.snapshot("t");
    expect(snap.observations.length).toBeLessThanOrEqual(3);
  });

  it("dedupes events and caps size", () => {
    const store = new ShadowHistoryStore({ maxEvents: 2 });
    const ev = { id: "e1", kind: "DATA_RECEIVED" as const, at: "t", evidence: fakeObs("a", "BUY", 0.5, 0).evidence };
    store.addEvents([ev, ev, { ...ev, id: "e2" }, { ...ev, id: "e3" }]);
    expect(store.snapshot("t").events.length).toBe(2);
  });

  it("clears all state", () => {
    const store = new ShadowHistoryStore();
    store.addObservation(fakeObs("a", "BUY", 0.5, 0));
    store.clear();
    expect(store.snapshot("t").observations).toEqual([]);
  });
});

describe("run-id determinism", () => {
  const policy = defaultPolicy();
  const inp = {
    instrument: "NIFTY50",
    timeframe: "5m",
    sessionDate: "2024-01-15",
    strategy: "ASTRO",
    formulaVersion: "F",
    recommendationRunId: "R",
    portfolioRunId: "P",
    dataHash: "h",
    providerId: "MOCK",
    policy,
  };
  it("same inputs → same session id", () => {
    expect(computeShadowSessionRunId(inp)).toBe(computeShadowSessionRunId(inp));
  });
  it("changed inputs → different id", () => {
    expect(computeShadowSessionRunId(inp)).not.toBe(
      computeShadowSessionRunId({ ...inp, dataHash: "x" }),
    );
  });
  it("observation/portfolio id determinism", () => {
    const s = computeShadowSessionRunId(inp);
    expect(computeShadowObservationRunId(s, "t", "BUY", 0.7)).toBe(
      computeShadowObservationRunId(s, "t", "BUY", 0.7),
    );
    expect(computeShadowPortfolioRunId(s, "P", "a", true, 0.3)).toBe(
      computeShadowPortfolioRunId(s, "P", "a", true, 0.3),
    );
  });
  it("run-id prefixes are stable", () => {
    expect(computeShadowSessionRunId(inp)).toMatch(/^SHADOW_SESSION_V1:/);
    expect(computeShadowObservationRunId("s", "t", "BUY", 0.5)).toMatch(/^SHADOW_OBSERVATION_V1:/);
    expect(computeShadowPortfolioRunId("s", null, "a", false, 0)).toMatch(/^SHADOW_PORTFOLIO_V1:/);
  });
});

describe("exports carry disclaimer + provenance", () => {
  const obs = [fakeObs("a", "BUY", 0.7, 1.5)];
  const store = new ShadowHistoryStore();
  store.addObservation(obs[0]);
  const snap = store.snapshot("t");
  const metrics = computeShadowMetrics(obs);

  it("observations csv contains disclaimer + run ids", () => {
    const csv = buildObservationsCsv(obs);
    expect(csv).toContain("SHADOW RESEARCH ONLY");
    expect(csv).toContain("REC:a");
  });
  it("events csv contains disclaimer", () => {
    const csv = buildEventsCsv([]);
    expect(csv).toContain(SHADOW_DISCLAIMER);
  });
  it("sessions/metrics/drift/portfolio csvs render", () => {
    expect(buildSessionsCsv([])).toContain("SHADOW RESEARCH ONLY");
    expect(buildMetricsCsv(metrics)).toContain("winRate");
    expect(
      buildDriftCsv({
        overall: "STABLE",
        readings: [{ dimension: "PERFORMANCE", status: "STABLE", deltaPct: 0, reason: "ok" }],
        driftScore: 0,
      }),
    ).toContain("PERFORMANCE");
    expect(
      buildPortfolioShadowCsv([
        { runId: "P", assetId: "a", included: true, allocationWeight: 0.3, sizingUnits: 1, riskBudgetPct: 0.01, correlationExposure: 0.2, capitalUtilizationPct: 0.5, confidence: 0.6, hardGatePassed: true, blockingReasons: [] },
      ]),
    ).toContain("portfolioRunId");
  });
  it("bundle json includes disclaimer and snapshot", () => {
    const json = buildShadowBundleJson({ version: "SHADOW_BUNDLE_V1", disclaimer: "override", snapshot: snap, metrics, drift: null });
    expect(json).toContain("SHADOW RESEARCH ONLY");
    expect(json).toContain("SHADOW_BUNDLE_V1");
  });
});

describe("safety audits", () => {
  it("shadow modules do not import broker code", async () => {
    // Static import graph audit: assert no shadow source references broker paths.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), "src/lib/shadow");
    const files = (await fs.readdir(dir)).filter((f) => !f.endsWith(".test.ts"));
    for (const f of files) {
      const src = await fs.readFile(path.join(dir, f), "utf8");
      expect(src).not.toMatch(/from\s+["'][^"']*\/broker\//);
      expect(src).not.toMatch(/placeOrder|submitOrder|liveOrder/);
    }
  });
});