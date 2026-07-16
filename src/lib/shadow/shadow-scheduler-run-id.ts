// Phase 23 · Stage 2 — Scheduler / live-observation / provider-session Run IDs.

import type { ShadowPolicy } from "./shadow-types";

export const SHADOW_LIVE_OBSERVATION_PREFIX = "SHADOW_LIVE_OBSERVATION_V1";
export const SHADOW_SCHEDULER_PREFIX = "SHADOW_SCHEDULER_V1";
export const SHADOW_PROVIDER_SESSION_PREFIX = "SHADOW_PROVIDER_SESSION_V1";

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function serializePolicy(p: ShadowPolicy): string {
  return JSON.stringify({
    e: p.entry,
    s: p.stop,
    t: p.target,
    rr: p.rrMultiple ?? null,
    mh: p.maxHoldBars ?? null,
    ma: p.maxDataAgeSeconds,
    mc: p.minConfidence,
    ad: p.acceptDelayed,
    co: p.costsPct,
  });
}

export type AmbiguousCandlePolicy = "CONSERVATIVE" | "OPTIMISTIC" | "WORST_CASE";

export type LiveObservationRunIdInput = {
  providerId: string;
  instrument: string;
  timeframe: string;
  sessionDate: string;
  dataHash: string;
  strategy: string;
  formulaVersion: string;
  recommendationRunId: string | null;
  portfolioRunId: string | null;
  policy: ShadowPolicy;
  ambiguous: AmbiguousCandlePolicy;
};

export function computeLiveObservationRunId(inp: LiveObservationRunIdInput): string {
  const key = [
    inp.providerId,
    inp.instrument,
    inp.timeframe,
    inp.sessionDate,
    inp.dataHash,
    inp.strategy,
    inp.formulaVersion,
    inp.recommendationRunId ?? "",
    inp.portfolioRunId ?? "",
    serializePolicy(inp.policy),
    inp.ambiguous,
  ].join("||");
  return `${SHADOW_LIVE_OBSERVATION_PREFIX}:${fnv1a(key)}`;
}

export type SchedulerRunIdInput = {
  providerId: string;
  instrument: string;
  timeframe: string;
  cadence: string; // "MANUAL"|"CANDLE_CLOSE"|"SESSION_START"|"SESSION_END"|"INTERVAL"
  intervalSeconds: number;
  policy: ShadowPolicy;
  ambiguous: AmbiguousCandlePolicy;
};

export function computeSchedulerRunId(inp: SchedulerRunIdInput): string {
  const key = [
    inp.providerId,
    inp.instrument,
    inp.timeframe,
    inp.cadence,
    String(inp.intervalSeconds),
    serializePolicy(inp.policy),
    inp.ambiguous,
  ].join("||");
  return `${SHADOW_SCHEDULER_PREFIX}:${fnv1a(key)}`;
}

export type ProviderSessionRunIdInput = {
  providerId: string;
  instrument: string;
  timeframe: string;
  sessionDate: string;
  timezone: string;
};

export function computeProviderSessionRunId(inp: ProviderSessionRunIdInput): string {
  const key = [
    inp.providerId,
    inp.instrument,
    inp.timeframe,
    inp.sessionDate,
    inp.timezone,
  ].join("||");
  return `${SHADOW_PROVIDER_SESSION_PREFIX}:${fnv1a(key)}`;
}