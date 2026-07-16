// Phase 23 · Stage 3 — Shadow Live Controller.
// Owns a single ShadowScheduler instance and exposes lifecycle controls
// (start / pause / resume / stop / runOnce) plus a pub/sub state feed so
// React components never touch the scheduler or provider directly.
//
// SHADOW OBSERVATION ONLY. No broker, no live order, no order objects.

import { timeframeSeconds } from "./candle-close-policy";
import type { LiveDataProviderAdapter } from "./live-data-provider";
import {
  ShadowScheduler,
  type SchedulerConfig,
  type SchedulerCounters,
  type SchedulerObservationInput,
  type SchedulerObservationResult,
  type SchedulerState,
  type SchedulerTimelineEvent,
} from "./shadow-scheduler";
import type { ShadowReadinessResult } from "./shadow-readiness";

export type ControllerViewState =
  | "IDLE"
  | "CHECKING_PROVIDER"
  | "WAITING_FOR_CANDLE"
  | "PROCESSING_CLOSED_CANDLE"
  | "OBSERVING_POSITION"
  | "PAUSED"
  | "STOPPED"
  | "ERROR";

export type ControllerSnapshot = {
  readonly viewState: ControllerViewState;
  readonly schedulerState: SchedulerState;
  readonly counters: SchedulerCounters;
  readonly timeline: readonly SchedulerTimelineEvent[];
  readonly lastResult: SchedulerObservationResult | null;
  readonly lastError: string | null;
  readonly lastRunAt: string | null;
  readonly nextExpectedAt: string | null;
  readonly running: boolean;
  readonly schedulerRunId: string;
};

export type ControllerListener = (snap: ControllerSnapshot) => void;

export type ControllerOptions = {
  readonly evidenceProvider: () => SchedulerObservationInput["evidence"];
  readonly onOutcome?: SchedulerObservationInput["onOutcome"];
  /** minimum tick interval; hard-floored at 60s to respect scheduler policy */
  readonly tickMs?: number;
  readonly nowIso?: () => string;
};

const MIN_TICK_MS = 60_000;

function mapView(
  scheduler: SchedulerState,
  last: SchedulerObservationResult | null,
  running: boolean,
  err: string | null,
): ControllerViewState {
  if (err) return "ERROR";
  if (scheduler === "STOPPED") return "STOPPED";
  if (
    scheduler === "PAUSED" ||
    scheduler === "PAUSED_DATA" ||
    scheduler === "PAUSED_PROVIDER" ||
    scheduler === "PAUSED_RESEARCH" ||
    scheduler === "PAUSED_MARKET_CLOSED"
  ) {
    return "PAUSED";
  }
  if (!last) return running ? "CHECKING_PROVIDER" : "IDLE";
  if (last.candleStatus !== "CLOSED_VALID") return "WAITING_FOR_CANDLE";
  if (last.reduce?.observation?.hypothetical) return "OBSERVING_POSITION";
  return "PROCESSING_CLOSED_CANDLE";
}

export class ShadowLiveController {
  private scheduler: ShadowScheduler;
  private listeners = new Set<ControllerListener>();
  private lastResult: SchedulerObservationResult | null = null;
  private lastError: string | null = null;
  private lastRunAt: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private inFlight = false;

  constructor(
    private provider: LiveDataProviderAdapter,
    private config: SchedulerConfig,
    private readonly opts: ControllerOptions,
  ) {
    this.scheduler = new ShadowScheduler(provider, config);
  }

  getScheduler(): ShadowScheduler {
    return this.scheduler;
  }

  getProvider(): LiveDataProviderAdapter {
    return this.provider;
  }

  getConfig(): SchedulerConfig {
    return this.config;
  }

  subscribe(fn: ControllerListener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): ControllerSnapshot {
    const schedulerState = this.scheduler.getState();
    return {
      viewState: mapView(schedulerState, this.lastResult, this.running, this.lastError),
      schedulerState,
      counters: this.scheduler.getCounters(),
      timeline: this.scheduler.getTimeline(),
      lastResult: this.lastResult,
      lastError: this.lastError,
      lastRunAt: this.lastRunAt,
      nextExpectedAt: this.computeNextExpectedAt(),
      running: this.running,
      schedulerRunId: this.scheduler.getSchedulerRunId(),
    };
  }

  private notify(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  private computeNextExpectedAt(): string | null {
    if (!this.lastRunAt) return null;
    const base = Date.parse(this.lastRunAt);
    if (!Number.isFinite(base)) return null;
    const tfSec = timeframeSeconds(this.config.timeframe);
    const stepMs = Math.max(MIN_TICK_MS, tfSec * 1000);
    return new Date(base + stepMs).toISOString();
  }

  async runOnce(): Promise<SchedulerObservationResult | null> {
    if (this.inFlight) return null;
    this.inFlight = true;
    this.lastError = null;
    try {
      const nowIso = (this.opts.nowIso ?? (() => new Date().toISOString()))();
      const evidence = this.opts.evidenceProvider();
      const res = await this.scheduler.runOnce({
        nowIso,
        evidence,
        onOutcome: this.opts.onOutcome,
      });
      this.lastResult = res;
      this.lastRunAt = nowIso;
      this.notify();
      return res;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.notify();
      return null;
    } finally {
      this.inFlight = false;
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduler.start();
    const tf = timeframeSeconds(this.config.timeframe) * 1000;
    const period = Math.max(MIN_TICK_MS, this.opts.tickMs ?? tf);
    // fire immediately, then on interval
    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, period);
    this.notify();
  }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.scheduler.pause();
    this.notify();
  }

  resume(): void {
    if (this.running) return;
    if (this.scheduler.getState() === "STOPPED") return;
    this.scheduler.resume();
    this.start();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.scheduler.stop();
    this.notify();
  }

  clearHistory(): void {
    this.scheduler.getHistory().clear();
    this.notify();
  }

  /** Reconfigure. Preserves history; recreates scheduler. */
  reconfigure(provider: LiveDataProviderAdapter, config: SchedulerConfig): void {
    const wasRunning = this.running;
    this.stop();
    this.provider = provider;
    this.config = config;
    const history = this.scheduler.getHistory();
    this.scheduler = new ShadowScheduler(provider, config, history);
    this.lastResult = null;
    this.lastError = null;
    if (wasRunning) this.start();
    else this.notify();
  }
}