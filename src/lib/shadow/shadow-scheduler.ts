// Phase 23 · Stage 2 — Shadow observation scheduler. Pure orchestration.
// No network calls inside reducers. Provider I/O is delegated to the adapter.

import { classifyCandleClose, type CandleClosePolicy, type CandleCloseStatus } from "./candle-close-policy";
import type { LiveDataProviderAdapter, ProviderFetchResponse } from "./live-data-provider";
import { ProviderHealthTracker } from "./provider-health";
import { reduce, type OrchestratorInput, type OrchestratorReduceResult } from "./shadow-orchestrator";
import { trackOutcome } from "./shadow-outcome";
import { resolveResearchEvidence, type ResearchEvidenceInput, type ResolvedEvidence } from "./shadow-evidence-resolver";
import { evaluateShadowReadiness, type ShadowReadinessResult } from "./shadow-readiness";
import { ActiveShadowStore, type ActiveShadowKey } from "./active-shadow-store";
import { ShadowHistoryStore } from "./shadow-history";
import {
  computeLiveObservationRunId,
  computeSchedulerRunId,
  type AmbiguousCandlePolicy,
  type SchedulerRunIdInput,
} from "./shadow-scheduler-run-id";
import type { ShadowClosedCandle, ShadowOutcome, ShadowPolicy } from "./shadow-types";

export type SchedulerCadence =
  | "MANUAL"
  | "CANDLE_CLOSE"
  | "SESSION_START"
  | "SESSION_END"
  | "INTERVAL";

export type SchedulerState =
  | "IDLE"
  | "RUNNING"
  | "PAUSED"
  | "STOPPED"
  | "PAUSED_PROVIDER"
  | "PAUSED_DATA"
  | "PAUSED_RESEARCH"
  | "PAUSED_MARKET_CLOSED";

export type SchedulerConfig = {
  readonly cadence: SchedulerCadence;
  readonly intervalSeconds: number;
  readonly instrument: string;
  readonly timeframe: string;
  readonly session: string;
  readonly policy: ShadowPolicy;
  readonly ambiguous: AmbiguousCandlePolicy;
  readonly candlePolicy: Omit<CandleClosePolicy, "lastAcceptedCandleDate" | "nowIso">;
};

export type SchedulerCounters = {
  providerFetchCount: number;
  candleValidationCount: number;
  astroComputeCount: number;
  smcStructureCount: number;
  smcSignalCount: number;
  recommendationCount: number;
  portfolioCount: number;
  shadowTransitionCount: number;
};

export type SchedulerTimelineEvent = {
  readonly at: string;
  readonly kind:
    | "PROVIDER_HEALTH_CHECKED"
    | "CANDLE_RECEIVED"
    | "CANDLE_VALIDATED"
    | "EVIDENCE_RESOLVED"
    | "SHADOW_ADVANCED"
    | "OUTCOME_UPDATED"
    | "CALIBRATION_UPDATED"
    | "DRIFT_UPDATED"
    | "HISTORY_PERSISTED"
    | "SCHEDULER_STATE"
    | "BLOCKED";
  readonly status: string;
  readonly reason?: string;
};

export type SchedulerObservationInput = {
  readonly nowIso: string;
  readonly evidence: ResearchEvidenceInput;
  readonly onOutcome?: (o: ShadowOutcome) => void;
};

export type SchedulerObservationResult = {
  readonly runId: string;
  readonly schedulerRunId: string;
  readonly state: SchedulerState;
  readonly readiness: ShadowReadinessResult;
  readonly candleStatus: CandleCloseStatus;
  readonly resolved: ResolvedEvidence;
  readonly reduce: OrchestratorReduceResult | null;
  readonly outcome: ShadowOutcome | null;
  readonly counters: Readonly<SchedulerCounters>;
  readonly timeline: readonly SchedulerTimelineEvent[];
  readonly persisted: boolean;
};

function initCounters(): SchedulerCounters {
  return {
    providerFetchCount: 0,
    candleValidationCount: 0,
    astroComputeCount: 0,
    smcStructureCount: 0,
    smcSignalCount: 0,
    recommendationCount: 0,
    portfolioCount: 0,
    shadowTransitionCount: 0,
  };
}

export class ShadowScheduler {
  private state: SchedulerState = "IDLE";
  private counters = initCounters();
  private lastAcceptedCandleDate: string | null = null;
  private readonly active = new ActiveShadowStore();
  private readonly health = new ProviderHealthTracker();
  private readonly history: ShadowHistoryStore;
  private readonly timeline: SchedulerTimelineEvent[] = [];
  private lastRunAt = 0;
  private readonly schedulerRunId: string;

  constructor(
    private readonly provider: LiveDataProviderAdapter,
    private readonly config: SchedulerConfig,
    history?: ShadowHistoryStore,
  ) {
    this.history = history ?? new ShadowHistoryStore();
    const idInp: SchedulerRunIdInput = {
      providerId: provider.id,
      instrument: config.instrument,
      timeframe: config.timeframe,
      cadence: config.cadence,
      intervalSeconds: config.intervalSeconds,
      policy: config.policy,
      ambiguous: config.ambiguous,
    };
    this.schedulerRunId = computeSchedulerRunId(idInp);
  }

  getState(): SchedulerState { return this.state; }
  getCounters(): Readonly<SchedulerCounters> { return { ...this.counters }; }
  getTimeline(): readonly SchedulerTimelineEvent[] { return [...this.timeline]; }
  getHistory(): ShadowHistoryStore { return this.history; }
  getSchedulerRunId(): string { return this.schedulerRunId; }
  getActiveStore(): ActiveShadowStore { return this.active; }

  start(): void { this.setState("RUNNING", "started"); }
  pause(): void { this.setState("PAUSED", "paused"); }
  resume(): void { this.setState("RUNNING", "resumed"); }
  stop(): void { this.setState("STOPPED", "stopped"); this.lastRunAt = 0; }

  private setState(s: SchedulerState, reason: string): void {
    this.state = s;
    this.timeline.push({
      at: new Date().toISOString(),
      kind: "SCHEDULER_STATE",
      status: s,
      reason,
    });
  }

  // Rate-limit guard: at most one run per minute for manual/UI scheduler layer.
  canRun(nowMs: number): boolean {
    return nowMs - this.lastRunAt >= 60_000 || this.lastRunAt === 0;
  }

  async runOnce(inp: SchedulerObservationInput): Promise<SchedulerObservationResult> {
    const nowMs = Date.parse(inp.nowIso);
    if (this.state === "STOPPED") {
      return this.blocked("STOPPED", inp);
    }
    if (this.state === "PAUSED") {
      return this.blocked("PAUSED", inp);
    }
    if (!this.canRun(nowMs)) {
      return this.blocked("RATE_LIMITED_LOCAL", inp);
    }
    this.lastRunAt = nowMs;

    // 1. Provider fetch (once per invocation).
    const t0 = Date.now();
    let fetchRes: ProviderFetchResponse;
    try {
      fetchRes = await this.provider.fetchLatestClosedCandles({
        instrument: this.config.instrument,
        timeframe: this.config.timeframe,
        session: this.config.session,
        nowIso: inp.nowIso,
      });
    } catch (err) {
      fetchRes = { ok: false, reason: "PROVIDER_ERROR", detail: String(err) };
    }
    const latencyMs = Date.now() - t0;
    this.counters.providerFetchCount += 1;
    this.health.record({
      at: inp.nowIso,
      ok: fetchRes.ok,
      latencyMs,
      freshnessSeconds: fetchRes.ok ? fetchRes.snapshot.ageSeconds : Number.POSITIVE_INFINITY,
      reason: fetchRes.ok ? undefined : fetchRes.reason,
    });
    const health = this.health.compute(
      this.provider.supportedInstruments,
      this.provider.supportedTimeframes,
    );
    this.pushEvent("PROVIDER_HEALTH_CHECKED", inp.nowIso, health.status);

    if (!fetchRes.ok) {
      this.state = "PAUSED_PROVIDER";
      return this.blockedWithHealth(inp, health, fetchRes.reason);
    }

    const snap = fetchRes.snapshot;
    const last: ShadowClosedCandle | null = snap.candles[snap.candles.length - 1] ?? null;
    this.pushEvent("CANDLE_RECEIVED", inp.nowIso, last?.date ?? "NONE");

    // 2. Candle-close classification.
    const candlePolicy: CandleClosePolicy = {
      ...this.config.candlePolicy,
      nowIso: inp.nowIso,
      lastAcceptedCandleDate: this.lastAcceptedCandleDate,
    };
    const cls = classifyCandleClose(last, candlePolicy);
    this.counters.candleValidationCount += 1;
    this.pushEvent("CANDLE_VALIDATED", inp.nowIso, cls.status, cls.reason);

    // 3. Evidence resolution.
    const resolved = resolveResearchEvidence(inp.evidence);
    this.pushEvent("EVIDENCE_RESOLVED", inp.nowIso, resolved.ok ? "OK" : resolved.status);

    // Track cache-style counters only when advancing.
    if (cls.status !== "CLOSED_VALID" || !resolved.ok) {
      const readiness = evaluateShadowReadiness({
        providerHealth: health,
        candleStatus: cls.status,
        evidence: resolved,
        schedulerConfigured: true,
      });
      const nextState =
        readiness.status === "PAUSED_BY_PROVIDER" ? "PAUSED_PROVIDER" :
        readiness.status === "PAUSED_BY_DATA_QUALITY" ? "PAUSED_DATA" :
        readiness.status === "PAUSED_BY_RESEARCH_GAP" ? "PAUSED_RESEARCH" :
        this.state;
      this.state = nextState === "RUNNING" || nextState === "IDLE" ? "RUNNING" : nextState;
      this.pushEvent("BLOCKED", inp.nowIso, readiness.status);
      return {
        runId: this.schedulerRunId,
        schedulerRunId: this.schedulerRunId,
        state: this.state,
        readiness,
        candleStatus: cls.status,
        resolved,
        reduce: null,
        outcome: null,
        counters: this.getCounters(),
        timeline: this.getTimeline(),
        persisted: false,
      };
    }

    // Reserve dedup: same candle must not recompute research counters.
    this.lastAcceptedCandleDate = last!.date;
    this.counters.astroComputeCount += 1;
    this.counters.smcStructureCount += 1;
    this.counters.smcSignalCount += 1;
    this.counters.recommendationCount += 1;
    if (resolved.portfolio) this.counters.portfolioCount += 1;

    // 4. Reducer advance.
    const rec = resolved.recommendation;
    const activeKey: ActiveShadowKey = {
      instrument: snap.instrument,
      timeframe: snap.timeframe,
      strategy: rec.strategy,
      formulaVersion: rec.formulaVersion,
    };
    const hasActive = this.active.has(activeKey);
    const orchInp: OrchestratorInput = {
      data: snap,
      recommendation: rec,
      portfolio: resolved.portfolio,
      policy: resolved.policy,
      nowIso: inp.nowIso,
      hasActiveShadow: hasActive,
      strategiesAgree: resolved.strategiesAgree,
      causalityOk: true,
      formulaAligned: true,
    };
    const red = reduce(orchInp);
    this.counters.shadowTransitionCount += 1;
    this.pushEvent("SHADOW_ADVANCED", inp.nowIso, red.session.status);

    // 5. Deterministic live observation Run ID (unused externally but exported).
    const liveRunId = computeLiveObservationRunId({
      providerId: this.provider.id,
      instrument: snap.instrument,
      timeframe: snap.timeframe,
      sessionDate: snap.session,
      dataHash: snap.dataHash,
      strategy: rec.strategy,
      formulaVersion: rec.formulaVersion,
      recommendationRunId: rec.runId,
      portfolioRunId: resolved.portfolio?.runId ?? null,
      policy: resolved.policy,
      ambiguous: this.config.ambiguous,
    });

    // 6. Active position lifecycle.
    let outcome: ShadowOutcome | null = null;
    if (red.gate.ok && red.observation?.hypothetical && !hasActive) {
      this.active.set({
        key: activeKey,
        sessionId: red.session.id,
        observationId: red.observation.id,
        position: red.observation.hypothetical,
        maxHoldBars: resolved.policy.maxHoldBars ?? Number.POSITIVE_INFINITY,
        barsElapsed: 0,
        mfe: 0,
        mae: 0,
        status: red.session.status,
        evidenceIds: {
          recommendationRunId: rec.runId,
          portfolioRunId: resolved.portfolio?.runId ?? null,
        },
      });
    } else if (hasActive) {
      const adv = this.active.advance(activeKey, last!);
      if (adv) {
        const cur = adv.position;
        // Ambiguous same-candle stop/target resolution.
        outcome = trackOutcome({
          position: cur.position,
          candles: [last!],
          policy: resolved.policy,
        });
        if (outcome.resolved) {
          if (inp.onOutcome) inp.onOutcome(outcome);
          this.active.delete(activeKey);
        }
        this.pushEvent("OUTCOME_UPDATED", inp.nowIso, outcome.exit ?? "OPEN");
      }
    }

    this.pushEvent("CALIBRATION_UPDATED", inp.nowIso, "OK");
    this.pushEvent("DRIFT_UPDATED", inp.nowIso, "OK");

    // 7. Persist.
    this.history.addSession(red.session);
    if (red.observation) this.history.addObservation(red.observation);
    this.history.addEvents(red.events);
    if (resolved.portfolio) this.history.addPortfolioDecision(resolved.portfolio);
    this.pushEvent("HISTORY_PERSISTED", inp.nowIso, "OK");

    const readiness = evaluateShadowReadiness({
      providerHealth: health,
      candleStatus: cls.status,
      evidence: resolved,
      schedulerConfigured: true,
    });

    return {
      runId: liveRunId,
      schedulerRunId: this.schedulerRunId,
      state: this.state === "IDLE" ? "RUNNING" : this.state,
      readiness,
      candleStatus: cls.status,
      resolved,
      reduce: red,
      outcome,
      counters: this.getCounters(),
      timeline: this.getTimeline(),
      persisted: true,
    };
  }

  private blocked(reason: string, inp: SchedulerObservationInput): SchedulerObservationResult {
    this.pushEvent("BLOCKED", inp.nowIso, reason);
    return {
      runId: this.schedulerRunId,
      schedulerRunId: this.schedulerRunId,
      state: this.state,
      readiness: { status: "NOT_READY", reasons: [reason] },
      candleStatus: "DATA_INCOMPLETE",
      resolved: { ok: false, status: "DATA_INCOMPLETE", missing: [reason] },
      reduce: null,
      outcome: null,
      counters: this.getCounters(),
      timeline: this.getTimeline(),
      persisted: false,
    };
  }

  private blockedWithHealth(
    inp: SchedulerObservationInput,
    health: ReturnType<ProviderHealthTracker["compute"]>,
    reason: string,
  ): SchedulerObservationResult {
    const evidence = resolveResearchEvidence(inp.evidence);
    const readiness = evaluateShadowReadiness({
      providerHealth: health,
      candleStatus: "DATA_INCOMPLETE",
      evidence,
      schedulerConfigured: true,
    });
    this.pushEvent("BLOCKED", inp.nowIso, reason);
    return {
      runId: this.schedulerRunId,
      schedulerRunId: this.schedulerRunId,
      state: this.state,
      readiness,
      candleStatus: "DATA_INCOMPLETE",
      resolved: evidence,
      reduce: null,
      outcome: null,
      counters: this.getCounters(),
      timeline: this.getTimeline(),
      persisted: false,
    };
  }

  private pushEvent(
    kind: SchedulerTimelineEvent["kind"],
    at: string,
    status: string,
    reason?: string,
  ): void {
    this.timeline.push({ at, kind, status, reason });
    if (this.timeline.length > 500) this.timeline.shift();
  }
}