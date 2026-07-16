// Phase 23 · Stage 3 — Shadow Live Controller tests.

import { describe, it, expect } from "vitest";
import { ShadowLiveController } from "./shadow-live-controller";
import { createMockAdapter, createUnavailableAdapter } from "./live-data-provider";
import type { SchedulerConfig } from "./shadow-scheduler";
import { defaultPolicy, type ShadowClosedCandle, type ShadowRecommendation } from "./shadow-types";
import type { ResearchEvidenceInput } from "./shadow-evidence-resolver";

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

function mkAdapter(candles: readonly ShadowClosedCandle[], age = 10) {
  return createMockAdapter({
    id: "mock",
    instruments: ["BTC"],
    timeframes: ["5m"],
    timezone: "UTC",
    marketHours: { timezone: "UTC", openHHMM: "00:00", closeHHMM: "23:59", is247: true },
    candles,
    providerTimestamp: "2026-01-01T00:05:10Z",
    ageSeconds: age,
  });
}

function evidence(): ResearchEvidenceInput {
  return {
    recommendation: REC,
    portfolio: null,
    regime: "TREND",
    formulaAligned: true,
    causalityOk: true,
    strategiesAgree: true,
    reliabilityAcceptable: true,
    policy: defaultPolicy(),
  };
}

describe("shadow live controller", () => {
  const cs = [candle("2026-01-01T00:00:00Z", 100, 110, 90, 105)];
  let now = 0;
  const nowIso = () => new Date(Date.parse("2026-01-01T00:05:10Z") + now++ * 120_000).toISOString();

  it("subscribes and emits an initial snapshot", () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso: () => "2026-01-01T00:05:10Z",
    });
    let seen = 0;
    const off = ctl.subscribe(() => { seen++; });
    expect(seen).toBe(1);
    off();
  });

  it("runOnce advances scheduler and reports view state", async () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso: () => "2026-01-01T00:05:10Z",
    });
    const res = await ctl.runOnce();
    expect(res).not.toBeNull();
    const snap = ctl.snapshot();
    expect(snap.counters.providerFetchCount).toBe(1);
    expect(snap.viewState).not.toBe("IDLE");
  });

  it("prevents overlapping runOnce", async () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso,
    });
    const [a, b] = await Promise.all([ctl.runOnce(), ctl.runOnce()]);
    // Second call returns null because first is in-flight.
    expect([a, b].filter((x) => x !== null).length).toBe(1);
  });

  it("pause blocks further advances; resume re-enables", async () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso,
    });
    ctl.start();
    // Let the auto-run kicked off by start() complete before pausing.
    await new Promise((r) => setTimeout(r, 5));
    ctl.pause();
    expect(ctl.snapshot().viewState).toBe("PAUSED");
    const res = await ctl.runOnce();
    expect(res?.state).toBe("PAUSED");
    ctl.resume();
    expect(ctl.snapshot().running).toBe(true);
    ctl.stop();
  });

  it("stop halts scheduling and reports STOPPED", () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso: () => "2026-01-01T00:05:10Z",
    });
    ctl.start();
    ctl.stop();
    expect(ctl.snapshot().viewState).toBe("STOPPED");
    expect(ctl.snapshot().running).toBe(false);
  });

  it("unavailable provider yields PAUSED view state", async () => {
    const ctl = new ShadowLiveController(
      createUnavailableAdapter("yahoo", "Yahoo"),
      baseConfig(),
      { evidenceProvider: evidence, nowIso: () => "2026-01-01T00:05:10Z" },
    );
    await ctl.runOnce();
    expect(ctl.snapshot().viewState).toBe("PAUSED");
  });

  it("clearHistory empties history but preserves controller identity", async () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso: () => "2026-01-01T00:05:10Z",
    });
    await ctl.runOnce();
    const id = ctl.snapshot().schedulerRunId;
    ctl.clearHistory();
    expect(ctl.snapshot().schedulerRunId).toBe(id);
  });

  it("reconfigure preserves history across scheduler swap", async () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso: () => "2026-01-01T00:05:10Z",
    });
    await ctl.runOnce();
    const historyRef = ctl.getScheduler().getHistory();
    ctl.reconfigure(mkAdapter(cs), baseConfig({ session: "2026-01-02" }));
    expect(ctl.getScheduler().getHistory()).toBe(historyRef);
  });

  it("nextExpectedAt is null before first run", () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso: () => "2026-01-01T00:05:10Z",
    });
    expect(ctl.snapshot().nextExpectedAt).toBeNull();
  });

  it("nextExpectedAt is set after a run", async () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso: () => "2026-01-01T00:05:10Z",
    });
    await ctl.runOnce();
    expect(ctl.snapshot().nextExpectedAt).toBeTruthy();
  });

  it("no broker or order tokens in serialized snapshot", async () => {
    const ctl = new ShadowLiveController(mkAdapter(cs), baseConfig(), {
      evidenceProvider: evidence,
      nowIso: () => "2026-01-01T00:05:10Z",
    });
    await ctl.runOnce();
    const s = JSON.stringify(ctl.snapshot());
    expect(s.toLowerCase()).not.toContain("place_order");
    expect(s.toLowerCase()).not.toContain("broker");
  });
});