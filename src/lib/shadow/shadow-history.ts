// Phase 23 · Stage 1 — In-memory shadow research history store.
// Local, research-only. No broker/audit-log/entitlement writes.

import type {
  ShadowObservation,
  ShadowPortfolioDecision,
  ShadowSession,
  ShadowValidationEvent,
} from "./shadow-types";

export type ShadowHistorySnapshot = {
  readonly observations: readonly ShadowObservation[];
  readonly events: readonly ShadowValidationEvent[];
  readonly sessions: readonly ShadowSession[];
  readonly portfolioDecisions: readonly ShadowPortfolioDecision[];
  readonly generatedAt: string;
};

export type ShadowHistoryLimits = {
  readonly maxObservations: number;
  readonly maxEvents: number;
  readonly maxSessions: number;
  readonly maxPortfolioDecisions: number;
};

const DEFAULT_LIMITS: ShadowHistoryLimits = {
  maxObservations: 500,
  maxEvents: 500,
  maxSessions: 100,
  maxPortfolioDecisions: 100,
};

export class ShadowHistoryStore {
  private observations = new Map<string, ShadowObservation>();
  private sessions = new Map<string, ShadowSession>();
  private events: ShadowValidationEvent[] = [];
  private portfolio = new Map<string, ShadowPortfolioDecision>();
  private readonly limits: ShadowHistoryLimits;

  constructor(limits: Partial<ShadowHistoryLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  addObservation(o: ShadowObservation): void {
    this.observations.set(o.id, o);
    this.trimMap(this.observations, this.limits.maxObservations);
  }

  addSession(s: ShadowSession): void {
    this.sessions.set(s.id, s);
    this.trimMap(this.sessions, this.limits.maxSessions);
  }

  addEvents(list: readonly ShadowValidationEvent[]): void {
    for (const e of list) {
      if (!this.events.some((existing) => existing.id === e.id)) {
        this.events.push(e);
      }
    }
    if (this.events.length > this.limits.maxEvents) {
      this.events.splice(0, this.events.length - this.limits.maxEvents);
    }
  }

  addPortfolioDecision(d: ShadowPortfolioDecision): void {
    this.portfolio.set(`${d.runId}:${d.assetId}`, d);
    this.trimMap(this.portfolio, this.limits.maxPortfolioDecisions);
  }

  snapshot(nowIso: string): ShadowHistorySnapshot {
    return {
      observations: Array.from(this.observations.values()),
      events: [...this.events],
      sessions: Array.from(this.sessions.values()),
      portfolioDecisions: Array.from(this.portfolio.values()),
      generatedAt: nowIso,
    };
  }

  clear(): void {
    this.observations.clear();
    this.sessions.clear();
    this.events = [];
    this.portfolio.clear();
  }

  private trimMap<V>(map: Map<string, V>, cap: number): void {
    if (map.size <= cap) return;
    const drop = map.size - cap;
    const it = map.keys();
    for (let i = 0; i < drop; i++) {
      const k = it.next().value;
      if (k === undefined) break;
      map.delete(k);
    }
  }
}