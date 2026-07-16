// Phase 23 · Stage 1 — Deterministic FNV-1a Run IDs for shadow research.

import {
  SHADOW_OBSERVATION_PREFIX,
  SHADOW_PORTFOLIO_PREFIX,
  SHADOW_SESSION_PREFIX,
  type ShadowPolicy,
} from "./shadow-types";

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
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

export type ShadowRunIdInput = {
  instrument: string;
  timeframe: string;
  sessionDate: string;
  strategy: string;
  formulaVersion: string;
  recommendationRunId: string | null;
  portfolioRunId: string | null;
  dataHash: string;
  providerId: string;
  policy: ShadowPolicy;
};

export function computeShadowSessionRunId(inp: ShadowRunIdInput): string {
  const key = [
    inp.instrument,
    inp.timeframe,
    inp.sessionDate,
    inp.strategy,
    inp.formulaVersion,
    inp.recommendationRunId ?? "",
    inp.portfolioRunId ?? "",
    inp.dataHash,
    inp.providerId,
    serializePolicy(inp.policy),
  ].join("||");
  return `${SHADOW_SESSION_PREFIX}:${fnv1a(key)}`;
}

export function computeShadowObservationRunId(
  sessionRunId: string,
  candleDate: string,
  direction: string,
  confidence: number,
): string {
  const key = [sessionRunId, candleDate, direction, confidence.toFixed(6)].join("||");
  return `${SHADOW_OBSERVATION_PREFIX}:${fnv1a(key)}`;
}

export function computeShadowPortfolioRunId(
  sessionRunId: string,
  portfolioRunId: string | null,
  assetId: string,
  included: boolean,
  weight: number,
): string {
  const key = [
    sessionRunId,
    portfolioRunId ?? "",
    assetId,
    included ? "1" : "0",
    weight.toFixed(6),
  ].join("||");
  return `${SHADOW_PORTFOLIO_PREFIX}:${fnv1a(key)}`;
}