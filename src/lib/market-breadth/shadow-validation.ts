// Phase 27 · Stage 3 — Shadow validation of GTI research state.
//
// RESEARCH ONLY. Never emits alerts, orders, or production signals.

import type { GtiResearchReading, GtiResearchState } from "./types";

export interface GtiShadowSample {
  readonly timestamp: string;
  readonly state: GtiResearchState;
  readonly confidence: number;
  readonly niftyForwardMove: number | null;
  readonly bankNiftyForwardMove: number | null;
  readonly conflictCount: number;
  readonly breadthWeighted: number | null;
  readonly vixRegime: string;
  readonly pcrScore: number | null;
}

export interface GtiShadowObservation {
  readonly id: string;
  readonly state: GtiResearchState;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationMs: number;
  readonly forwardMove: number | null;
  readonly mfe: number | null;
  readonly mae: number | null;
  readonly reversal: boolean;
  readonly weakening: boolean;
  readonly averageConfidence: number;
  readonly averageConflictCount: number;
}

function direction(state: GtiResearchState): "CE" | "PE" | "NEUTRAL" {
  if (state === "STRONG_CE_RESEARCH_FOCUS" || state === "CE_RESEARCH_FOCUS") return "CE";
  if (state === "STRONG_PE_RESEARCH_FOCUS" || state === "PE_RESEARCH_FOCUS") return "PE";
  return "NEUTRAL";
}

function weakening(state: GtiResearchState): boolean {
  return state === "BULLISH_BUT_CONFLICTED" || state === "BEARISH_BUT_CONFLICTED";
}

export function readingToShadowSample(
  r: GtiResearchReading,
  fwd: { nifty?: number | null; bankNifty?: number | null } = {},
): GtiShadowSample {
  return {
    timestamp: r.timestamp,
    state: r.state,
    confidence: r.confidence,
    niftyForwardMove: fwd.nifty ?? null,
    bankNiftyForwardMove: fwd.bankNifty ?? null,
    conflictCount: r.conflicts.length,
    breadthWeighted: r.breadth.topWeighted?.weightedBreadth ?? r.breadth.nifty50?.weightedBreadth ?? null,
    vixRegime: r.vix.regime,
    pcrScore: r.pcr.combinedScore,
  };
}

export function summarizeGtiShadow(samples: readonly GtiShadowSample[]): readonly GtiShadowObservation[] {
  const observations: GtiShadowObservation[] = [];
  let cur: {
    id: string; state: GtiResearchState; startedAt: string;
    lastAt: string; entryMove: number | null; mfe: number; mae: number;
    confSum: number; confN: number; conflictSum: number;
  } | null = null;

  const close = (endedAt: string, endMove: number | null, next: GtiResearchState | null) => {
    if (!cur) return;
    const dir = direction(cur.state);
    const forwardMove = cur.entryMove != null && endMove != null ? endMove - cur.entryMove : null;
    observations.push({
      id: cur.id, state: cur.state, startedAt: cur.startedAt, endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(cur.startedAt)),
      forwardMove,
      mfe: cur.mfe === -Infinity ? null : cur.mfe,
      mae: cur.mae === Infinity ? null : cur.mae,
      reversal: !!next && direction(next) !== "NEUTRAL" && direction(next) !== dir,
      weakening: !!next && weakening(next),
      averageConfidence: cur.confN > 0 ? cur.confSum / cur.confN : 0,
      averageConflictCount: cur.confN > 0 ? cur.conflictSum / cur.confN : 0,
    });
    cur = null;
  };

  for (const s of samples) {
    if (direction(s.state) !== "NEUTRAL") {
      if (!cur || cur.state !== s.state) {
        if (cur) close(s.timestamp, s.niftyForwardMove, s.state);
        cur = {
          id: `gti-obs-${observations.length + 1}`,
          state: s.state,
          startedAt: s.timestamp,
          lastAt: s.timestamp,
          entryMove: s.niftyForwardMove,
          mfe: s.niftyForwardMove ?? -Infinity,
          mae: s.niftyForwardMove ?? Infinity,
          confSum: s.confidence,
          confN: 1,
          conflictSum: s.conflictCount,
        };
      } else {
        const v = s.niftyForwardMove;
        if (v != null) {
          cur.mfe = Math.max(cur.mfe, v);
          cur.mae = Math.min(cur.mae, v);
        }
        cur.lastAt = s.timestamp;
        cur.confSum += s.confidence;
        cur.confN += 1;
        cur.conflictSum += s.conflictCount;
      }
    } else if (cur) {
      close(s.timestamp, s.niftyForwardMove, s.state);
    }
  }
  if (cur) close(cur.lastAt, null, null);
  return observations;
}
