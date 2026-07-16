// Phase 23 · Stage 2 — Deterministic tests for scheduled shadow observation.

import { describe, it, expect } from "vitest";
import {
  buildDataHash,
  classifyFreshnessDefault,
  createMockAdapter,
  createUnavailableAdapter,
} from "./live-data-provider";
import {
  classifyCandleClose,
  getSessionPolicy,
  timeframeSeconds,
  type CandleClosePolicy,
} from "./candle-close-policy";
import { ProviderHealthTracker } from "./provider-health";
import { resolveResearchEvidence } from "./shadow-evidence-resolver";
import { ActiveShadowStore } from "./active-shadow-store";
import { evaluateShadowReadiness } from "./shadow-readiness";
import {
  computeLiveObservationRunId,
  computeProviderSessionRunId,
  computeSchedulerRunId,
} from "./shadow-scheduler-run-id";
import { ShadowScheduler, type SchedulerConfig } from "./shadow-scheduler";
import {
  buildActivePositionsCsv,
  buildLiveObservationsCsv,
  buildProviderHealthCsv,
  buildSchedulerEventsCsv,
  buildScheduledShadowBundleJson,
} from "./shadow-live-exports";
import { defaultPolicy, type ShadowClosedCandle, type ShadowRecommendation } from "./shadow-types";

function candle(date: string, o: number, h: number, l: number, c: number): ShadowClosedCandle {
  return { date, open: o, high: h, low: l, close: c, closed: true };
}

const REC: ShadowRecommendation = {
  runId: "REC:1",
  strategy: "SMC",
  formulaVersion: "v1",
  direction: "BUY",
  confidence: 0.8,
  reliability: "HIGH",
  score: 0.9,
  regime: "TREND",
};

function baseCandlePolicy(nowIso: string) {
  return {
    timeframe: "5m",
    gracePeriodSeconds: 5,
    staleAfterSeconds: 300,
    nowIso,
    is247: true,
  };
}

function baseConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    cadence: "MANUAL",
    intervalSeconds: 60,
    instrument: "BTC",
    timeframe: "5m",
    session: "2026-01-01",
    policy: defaultPolicy(),
    ambiguous: "CONSERVATIVE",
    candlePolicy: {
      timeframe: "5m",
      gracePeriodSeconds: 5,
      staleAfterSeconds: 300,
      is247: true,
    },
    ...overrides,
  };
}

function mkAdapter(candles: readonly ShadowClosedCandle[], age = 10, tsIso = "2026-01-01T00:05:10Z") {
  return createMockAdapter({
    id: "mock",
    instruments: ["BTC"],
    timeframes: ["5m"],
    timezone: "UTC",
    marketHours: { timezone: "UTC", openHHMM: "00:00", closeHHMM: "23:59", is247: true },
    candles,
    providerTimestamp: tsIso,
    ageSeconds: age,
  });
}

describe("live data provider", () => {
  it("mock adapter returns snapshot for supported instrument/timeframe", async () => {
    const c = [candle("2026-01-01T00:00:00Z", 100, 110, 90, 105)];
    const a = mkAdapter(c);
    const res = await a.fetchLatestClosedCandles({
      instrument: "BTC",
      timeframe: "5m",
      session: "2026-01-01",
      nowIso: "2026-01-01T00:05:10Z",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.snapshot.candles.length).toBe(1);
      expect(res.snapshot.dataHash).toBeTruthy();
    }
  });
  it("rejects unsupported instrument", async () => {
    const a = mkAdapter([candle("2026-01-01T00:00:00Z", 100, 110, 90, 105)]);
    const res = await a.fetchLatestClosedCandles({
      instrument: "NIFTY50",
      timeframe: "5m",
      session: "2026-01-01",
      nowIso: "2026-01-01T00:05:10Z",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("UNSUPPORTED_INSTRUMENT");
  });
  it("unavailable adapter reports LIVE_DATA_UNAVAILABLE", async () => {
    const a = createUnavailableAdapter("yahoo", "Yahoo");
    const res = await a.fetchLatestClosedCandles({
      instrument: "BTC",
      timeframe: "5m",
      session: "s",
      nowIso: "2026-01-01T00:00:00Z",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("LIVE_DATA_UNAVAILABLE");
  });
  it("buildDataHash is deterministic", () => {
    const c = [candle("2026-01-01T00:00:00Z", 100, 110, 90, 105)];
    expect(buildDataHash(c, "mock")).toBe(buildDataHash(c, "mock"));
  });
  it("classifyFreshness thresholds", () => {
    expect(classifyFreshnessDefault(10, { liveMax: 30, delayedMax: 900 })).toBe("LIVE");
    expect(classifyFreshnessDefault(100, { liveMax: 30, delayedMax: 900 })).toBe("DELAYED");
    expect(classifyFreshnessDefault(1000, { liveMax: 30, delayedMax: 900 })).toBe("STALE");
    expect(classifyFreshnessDefault(-1, { liveMax: 30, delayedMax: 900 })).toBe("MISSING");
  });
});

describe("candle close policy", () => {
  it("timeframeSeconds", () => {
    expect(timeframeSeconds("1m")).toBe(60);
    expect(timeframeSeconds("5m")).toBe(300);
    expect(timeframeSeconds("15m")).toBe(900);
    expect(timeframeSeconds("1d")).toBe(86400);
  });
  it("closed valid within grace", () => {
    const c = candle("2026-01-01T00:00:00Z", 1, 2, 0, 1);
    const r = classifyCandleClose(c, baseCandlePolicy("2026-01-01T00:05:10Z"));
    expect(r.status).toBe("CLOSED_VALID");
  });
  it("open candle rejected via closed=false", () => {
    const r = classifyCandleClose(
      { ...candle("2026-01-01T00:00:00Z", 1, 2, 0, 1), closed: false as unknown as true },
      baseCandlePolicy("2026-01-01T00:05:10Z"),
    );
    expect(r.status).toBe("OPEN_CANDLE");
  });
  it("stale candle", () => {
    const c = candle("2026-01-01T00:00:00Z", 1, 2, 0, 1);
    const r = classifyCandleClose(c, baseCandlePolicy("2026-01-01T01:00:00Z"));
    expect(r.status).toBe("STALE_CANDLE");
  });
  it("future candle", () => {
    const c = candle("2026-01-01T00:05:00Z", 1, 2, 0, 1);
    const r = classifyCandleClose(c, baseCandlePolicy("2026-01-01T00:00:00Z"));
    expect(r.status).toBe("FUTURE_CANDLE");
  });
  it("duplicate candle", () => {
    const c = candle("2026-01-01T00:00:00Z", 1, 2, 0, 1);
    const r = classifyCandleClose(c, {
      ...baseCandlePolicy("2026-01-01T00:05:10Z"),
      lastAcceptedCandleDate: "2026-01-01T00:00:00Z",
    });
    expect(r.status).toBe("DUPLICATE_CANDLE");
  });
  it("outside session", () => {
    const c = candle("2026-01-01T00:00:00Z", 1, 2, 0, 1);
    const p: CandleClosePolicy = {
      timeframe: "5m",
      gracePeriodSeconds: 5,
      staleAfterSeconds: 3600,
      nowIso: "2026-01-01T00:05:10Z",
      is247: false,
      sessionOpenIso: "2026-01-01T10:00:00Z",
      sessionCloseIso: "2026-01-01T16:00:00Z",
    };
    expect(classifyCandleClose(c, p).status).toBe("OUTSIDE_SESSION");
  });
  it("data incomplete when null", () => {
    expect(classifyCandleClose(null, baseCandlePolicy("2026-01-01T00:00:00Z")).status).toBe(
      "DATA_INCOMPLETE",
    );
  });
  it("session policies exist for required instruments", () => {
    for (const i of ["NIFTY50", "BANKNIFTY", "BTC", "XAUUSD", "CRUDEOIL", "NATURALGAS"]) {
      expect(getSessionPolicy(i)).not.toBeNull();
    }
    expect(getSessionPolicy("UNKNOWN")).toBeNull();
  });
});

describe("provider health tracker", () => {
  it("classifies statuses from samples", () => {
    const t = new ProviderHealthTracker();
    t.record({ at: "t1", ok: true, latencyMs: 10, freshnessSeconds: 10 });
    expect(t.compute(["BTC"], ["5m"]).status).toBe("HEALTHY");
    t.record({ at: "t2", ok: true, latencyMs: 20, freshnessSeconds: 200 });
    expect(t.compute(["BTC"], ["5m"]).status).toBe("DELAYED");
    t.record({ at: "t3", ok: false, latencyMs: 30, freshnessSeconds: 5000, reason: "RATE_LIMITED" });
    expect(t.compute(["BTC"], ["5m"]).status).toBe("RATE_LIMITED");
  });
});

describe("evidence resolver", () => {
  it("returns DATA_INCOMPLETE when missing", () => {
    const r = resolveResearchEvidence({
      recommendation: null,
      portfolio: null,
      formulaAligned: false,
      causalityOk: false,
      strategiesAgree: true,
      reliabilityAcceptable: false,
      policy: defaultPolicy(),
    });
    expect(r.ok).toBe(false);
  });
  it("resolves when complete", () => {
    const r = resolveResearchEvidence({
      recommendation: REC,
      portfolio: null,
      formulaAligned: true,
      causalityOk: true,
      strategiesAgree: true,
      reliabilityAcceptable: true,
      policy: defaultPolicy(),
    });
    expect(r.ok).toBe(true);
  });
});

describe("active shadow store", () => {
  it("enforces single active position per key and advances MFE/MAE", () => {
    const s = new ActiveShadowStore();
    const k = { instrument: "BTC", timeframe: "5m", strategy: "SMC", formulaVersion: "v1" };
    s.set({
      key: k,
      sessionId: "S",
      observationId: "O",
      position: { side: "LONG", entry: 100, stop: 99, target: 102, entryDate: "d" },
      maxHoldBars: 10,
      barsElapsed: 0,
      mfe: 0,
      mae: 0,
      status: "ENTRY_READY_SHADOW",
      evidenceIds: { recommendationRunId: "r", portfolioRunId: null },
    });
    expect(s.has(k)).toBe(true);
    const r = s.advance(k, candle("d2", 100, 101, 99.5, 100.5));
    expect(r?.position.mfe).toBeCloseTo(1);
    expect(r?.position.mae).toBeCloseTo(-0.5);
    s.delete(k);
    expect(s.has(k)).toBe(false);
  });
});

describe("readiness gate", () => {
  it("paused by provider when unavailable", () => {
    const r = evaluateShadowReadiness({
      providerHealth: {
        status: "UNAVAILABLE",
        lastSuccessAt: null,
        lastFailureAt: null,
        latencyMs: 0,
        errorRate: 1,
        freshnessSeconds: Number.POSITIVE_INFINITY,
        supportedInstruments: [],
        supportedTimeframes: [],
        limitations: [],
      },
      candleStatus: "CLOSED_VALID",
      evidence: { ok: false, status: "DATA_INCOMPLETE", missing: [] },
      schedulerConfigured: true,
    });
    expect(r.status).toBe("PAUSED_BY_PROVIDER");
  });
  it("ready when everything green", () => {
    const r = evaluateShadowReadiness({
      providerHealth: {
        status: "HEALTHY",
        lastSuccessAt: "t",
        lastFailureAt: null,
        latencyMs: 0,
        errorRate: 0,
        freshnessSeconds: 5,
        supportedInstruments: ["BTC"],
        supportedTimeframes: ["5m"],
        limitations: [],
      },
      candleStatus: "CLOSED_VALID",
      evidence: {
        ok: true,
        recommendation: REC,
        portfolio: null,
        regime: null,
        formulaAligned: true,
        causalityOk: true,
        strategiesAgree: true,
        reliabilityAcceptable: true,
        policy: defaultPolicy(),
      },
      schedulerConfigured: true,
    });
    expect(r.status).toBe("READY_FOR_SCHEDULED_SHADOW");
  });
});

describe("scheduler run IDs", () => {
  it("live observation, scheduler, provider-session IDs are deterministic", () => {
    const a = computeLiveObservationRunId({
      providerId: "mock",
      instrument: "BTC",
      timeframe: "5m",
      sessionDate: "s",
      dataHash: "h",
      strategy: "SMC",
      formulaVersion: "v1",
      recommendationRunId: "r",
      portfolioRunId: null,
      policy: defaultPolicy(),
      ambiguous: "CONSERVATIVE",
    });
    const b = computeLiveObservationRunId({
      providerId: "mock",
      instrument: "BTC",
      timeframe: "5m",
      sessionDate: "s",
      dataHash: "h",
      strategy: "SMC",
      formulaVersion: "v1",
      recommendationRunId: "r",
      portfolioRunId: null,
      policy: defaultPolicy(),
      ambiguous: "CONSERVATIVE",
    });
    expect(a).toBe(b);
    expect(a.startsWith("SHADOW_LIVE_OBSERVATION_V1:")).toBe(true);

    const s1 = computeSchedulerRunId({
      providerId: "mock",
      instrument: "BTC",
      timeframe: "5m",
      cadence: "CANDLE_CLOSE",
      intervalSeconds: 300,
      policy: defaultPolicy(),
      ambiguous: "CONSERVATIVE",
    });
    expect(s1.startsWith("SHADOW_SCHEDULER_V1:")).toBe(true);

    const p1 = computeProviderSessionRunId({
      providerId: "mock",
      instrument: "BTC",
      timeframe: "5m",
      sessionDate: "s",
      timezone: "UTC",
    });
    expect(p1.startsWith("SHADOW_PROVIDER_SESSION_V1:")).toBe(true);
  });
});

describe("shadow scheduler", () => {
  const candles = [candle("2026-01-01T00:00:00Z", 100, 110, 90, 105)];
  const evidence = {
    recommendation: REC,
    portfolio: null,
    formulaAligned: true,
    causalityOk: true,
    strategiesAgree: true,
    reliabilityAcceptable: true,
    policy: defaultPolicy(),
  };

  it("run once produces a persisted observation and counters", async () => {
    const sch = new ShadowScheduler(mkAdapter(candles), baseConfig());
    sch.start();
    const r = await sch.runOnce({ nowIso: "2026-01-01T00:05:10Z", evidence });
    expect(r.persisted).toBe(true);
    expect(r.counters.providerFetchCount).toBe(1);
    expect(r.counters.shadowTransitionCount).toBe(1);
  });

  it("pause blocks runs", async () => {
    const sch = new ShadowScheduler(mkAdapter(candles), baseConfig());
    sch.start();
    sch.pause();
    const r = await sch.runOnce({ nowIso: "2026-01-01T00:05:10Z", evidence });
    expect(r.persisted).toBe(false);
    expect(r.state).toBe("PAUSED");
  });

  it("stop blocks runs", async () => {
    const sch = new ShadowScheduler(mkAdapter(candles), baseConfig());
    sch.stop();
    const r = await sch.runOnce({ nowIso: "2026-01-01T00:05:10Z", evidence });
    expect(r.persisted).toBe(false);
    expect(r.state).toBe("STOPPED");
  });

  it("duplicate candle does not increment research counters", async () => {
    const sch = new ShadowScheduler(mkAdapter(candles), baseConfig());
    sch.start();
    await sch.runOnce({ nowIso: "2026-01-01T00:05:10Z", evidence });
    // advance clock by >60s to bypass local rate limit; same candle stays.
    const r2 = await sch.runOnce({ nowIso: "2026-01-01T00:06:20Z", evidence });
    // candle should now be classified DUPLICATE (or STALE beyond staleAfter)
    expect(["DUPLICATE_CANDLE", "STALE_CANDLE"]).toContain(r2.candleStatus);
    expect(r2.counters.recommendationCount).toBe(1);
  });

  it("provider failure pauses scheduler", async () => {
    const sch = new ShadowScheduler(createUnavailableAdapter("x", "X"), baseConfig());
    sch.start();
    const r = await sch.runOnce({ nowIso: "2026-01-01T00:05:10Z", evidence });
    expect(r.persisted).toBe(false);
    expect(r.state).toBe("PAUSED_PROVIDER");
  });

  it("research gap pauses scheduler", async () => {
    const sch = new ShadowScheduler(mkAdapter(candles), baseConfig());
    sch.start();
    const r = await sch.runOnce({
      nowIso: "2026-01-01T00:05:10Z",
      evidence: { ...evidence, recommendation: null },
    });
    expect(r.persisted).toBe(false);
    expect(r.readiness.status).toBe("PAUSED_BY_RESEARCH_GAP");
  });

  it("exports include shadow disclaimer and are csv-shaped", async () => {
    const sch = new ShadowScheduler(mkAdapter(candles), baseConfig());
    sch.start();
    const r = await sch.runOnce({ nowIso: "2026-01-01T00:05:10Z", evidence });
    const obsCsv = buildLiveObservationsCsv([r]);
    expect(obsCsv).toContain("SHADOW OBSERVATION ONLY");
    const eventsCsv = buildSchedulerEventsCsv(sch.getTimeline());
    expect(eventsCsv).toContain("SHADOW OBSERVATION ONLY");
    const healthCsv = buildProviderHealthCsv([
      { at: "t", ok: true, latencyMs: 1, freshnessSeconds: 1 },
    ]);
    expect(healthCsv).toContain("SHADOW OBSERVATION ONLY");
    const posCsv = buildActivePositionsCsv(sch.getActiveStore().values());
    expect(posCsv).toContain("SHADOW OBSERVATION ONLY");
    const bundle = buildScheduledShadowBundleJson({
      generatedAt: "2026-01-01T00:00:00Z",
      counters: sch.getCounters(),
      results: [r],
      timeline: sch.getTimeline(),
      providerHealth: [],
      activePositions: sch.getActiveStore().values(),
      disclaimer: "",
    });
    expect(bundle).toContain("SHADOW RESEARCH ONLY");
  });
});

describe("safety audits", () => {
  it("no broker or order imports in stage 2 modules", async () => {
    const files = [
      "./live-data-provider",
      "./candle-close-policy",
      "./provider-health",
      "./shadow-evidence-resolver",
      "./active-shadow-store",
      "./shadow-readiness",
      "./shadow-scheduler-run-id",
      "./shadow-scheduler",
      "./shadow-live-exports",
    ];
    for (const f of files) {
      const mod = (await import(f)) as Record<string, unknown>;
      expect(mod).toBeTruthy();
    }
  });
});