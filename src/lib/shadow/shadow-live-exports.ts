// Phase 23 · Stage 2 — Additional exports for scheduled shadow observation.
// SHADOW OBSERVATION ONLY — NOT A LIVE TRADE RECORD.

import type { ActiveShadowPosition } from "./active-shadow-store";
import type { ProviderHealthSample } from "./provider-health";
import type {
  SchedulerCounters,
  SchedulerObservationResult,
  SchedulerTimelineEvent,
} from "./shadow-scheduler";
import { SHADOW_DISCLAIMER } from "./shadow-types";

const HEADER = "# SHADOW OBSERVATION ONLY — NOT A LIVE TRADE RECORD\n";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return HEADER + "empty\n";
  const cols = Object.keys(rows[0]);
  const body = [cols.join(",")].concat(
    rows.map((r) => cols.map((c) => csvEscape(r[c])).join(",")),
  );
  return HEADER + body.join("\n") + "\n";
}

export function buildLiveObservationsCsv(results: readonly SchedulerObservationResult[]): string {
  return rowsToCsv(
    results.map((r) => ({
      runId: r.runId,
      schedulerRunId: r.schedulerRunId,
      state: r.state,
      candleStatus: r.candleStatus,
      readiness: r.readiness.status,
      persisted: r.persisted,
      sessionId: r.reduce?.session.id ?? "",
      shadowStatus: r.reduce?.session.status ?? "",
      outcomeExit: r.outcome?.exit ?? "",
      netAfterCosts: r.outcome?.netAfterCosts ?? "",
    })),
  );
}

export function buildSchedulerEventsCsv(events: readonly SchedulerTimelineEvent[]): string {
  return rowsToCsv(
    events.map((e) => ({
      at: e.at,
      kind: e.kind,
      status: e.status,
      reason: e.reason ?? "",
    })),
  );
}

export function buildProviderHealthCsv(samples: readonly ProviderHealthSample[]): string {
  return rowsToCsv(
    samples.map((s) => ({
      at: s.at,
      ok: s.ok,
      latencyMs: s.latencyMs,
      freshnessSeconds: s.freshnessSeconds,
      reason: s.reason ?? "",
    })),
  );
}

export function buildActivePositionsCsv(positions: readonly ActiveShadowPosition[]): string {
  return rowsToCsv(
    positions.map((p) => ({
      instrument: p.key.instrument,
      timeframe: p.key.timeframe,
      strategy: p.key.strategy,
      formulaVersion: p.key.formulaVersion,
      sessionId: p.sessionId,
      observationId: p.observationId,
      side: p.position.side,
      entry: p.position.entry,
      stop: p.position.stop,
      target: p.position.target,
      entryDate: p.position.entryDate,
      maxHoldBars: p.maxHoldBars,
      barsElapsed: p.barsElapsed,
      mfe: p.mfe,
      mae: p.mae,
      status: p.status,
      recommendationRunId: p.evidenceIds.recommendationRunId ?? "",
      portfolioRunId: p.evidenceIds.portfolioRunId ?? "",
    })),
  );
}

export type ScheduledShadowBundle = {
  readonly disclaimer: string;
  readonly generatedAt: string;
  readonly counters: SchedulerCounters;
  readonly results: readonly SchedulerObservationResult[];
  readonly timeline: readonly SchedulerTimelineEvent[];
  readonly providerHealth: readonly ProviderHealthSample[];
  readonly activePositions: readonly ActiveShadowPosition[];
};

export function buildScheduledShadowBundleJson(bundle: ScheduledShadowBundle): string {
  return JSON.stringify({ ...bundle, disclaimer: SHADOW_DISCLAIMER }, null, 2);
}