// Phase 27 · Stage 2 — Shadow validation for Combined PCR.
//
// Research-only observation of CE_FOCUS / PE_FOCUS / NO_TRADE and
// weakening/reversal states. Tracks entry score/slope, confirmation
// delay, signal duration, forward move, MFE and MAE.
//
// NEVER emits BUY/SELL. NEVER touches the Decision Engine, alerts,
// broker or orders.

import type { CombinedPcrReading, PcrSignalState } from "./types";

export interface ShadowSample {
  readonly timestamp: string;
  readonly candidateState: PcrSignalState;
  readonly confirmedState: PcrSignalState;
  readonly pendingState: PcrSignalState;
  readonly combinedScore: number | null;
  readonly slope: number | null;
  readonly confirmationCount: number;
}

export interface ShadowObservation {
  readonly id: string;
  readonly state: PcrSignalState;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly entryScore: number | null;
  readonly entrySlope: number | null;
  readonly confirmationDelayCount: number;
  readonly durationMs: number;
  readonly forwardMove: number | null;   // score delta at close
  readonly mfe: number | null;           // max favorable excursion
  readonly mae: number | null;           // max adverse excursion
  readonly reversal: boolean;
  readonly weakening: boolean;
}

function directionOf(state: PcrSignalState): "CE" | "PE" | "NEUTRAL" {
  if (state === "STRONG_CE_FOCUS" || state === "CE_FOCUS") return "CE";
  if (state === "STRONG_PE_FOCUS" || state === "PE_FOCUS") return "PE";
  return "NEUTRAL";
}

function isWeakening(state: PcrSignalState): boolean {
  return state === "BULLISH_WEAKENING" || state === "BEARISH_WEAKENING";
}

function isTradeableState(state: PcrSignalState): boolean {
  return directionOf(state) !== "NEUTRAL";
}

/** Feed reading samples chronologically; segment output is deterministic. */
export function summarizeShadowObservations(
  samples: readonly ShadowSample[],
): readonly ShadowObservation[] {
  const observations: ShadowObservation[] = [];
  let current: {
    id: string;
    state: PcrSignalState;
    startedAt: string;
    entryScore: number | null;
    entrySlope: number | null;
    confirmationDelayCount: number;
    mfe: number;
    mae: number;
    lastScore: number | null;
    lastAt: string;
  } | null = null;

  const closeCurrent = (endedAt: string, endScore: number | null, reversalNext: PcrSignalState | null) => {
    if (!current) return;
    const dir = directionOf(current.state);
    const forwardMove = current.entryScore != null && endScore != null
      ? endScore - current.entryScore
      : null;
    observations.push({
      id: current.id,
      state: current.state,
      startedAt: current.startedAt,
      endedAt,
      entryScore: current.entryScore,
      entrySlope: current.entrySlope,
      confirmationDelayCount: current.confirmationDelayCount,
      durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(current.startedAt)),
      forwardMove,
      mfe: current.mfe === -Infinity ? null : current.mfe,
      mae: current.mae === Infinity ? null : current.mae,
      reversal: reversalNext ? directionOf(reversalNext) !== "NEUTRAL" && directionOf(reversalNext) !== dir : false,
      weakening: reversalNext ? isWeakening(reversalNext) : false,
    });
    current = null;
  };

  for (const s of samples) {
    if (isTradeableState(s.confirmedState)) {
      if (!current || current.state !== s.confirmedState) {
        if (current) closeCurrent(s.timestamp, s.combinedScore, s.confirmedState);
        current = {
          id: `obs-${observations.length + 1}`,
          state: s.confirmedState,
          startedAt: s.timestamp,
          entryScore: s.combinedScore,
          entrySlope: s.slope,
          confirmationDelayCount: s.confirmationCount,
          mfe: s.combinedScore ?? -Infinity,
          mae: s.combinedScore ?? Infinity,
          lastScore: s.combinedScore,
          lastAt: s.timestamp,
        };
      } else if (current) {
        const v = s.combinedScore;
        if (v != null) {
          current.mfe = Math.max(current.mfe, v);
          current.mae = Math.min(current.mae, v);
        }
        current.lastScore = v;
        current.lastAt = s.timestamp;
      }
    } else if (current) {
      closeCurrent(s.timestamp, s.combinedScore, s.confirmedState);
    }
  }

  if (current) closeCurrent(current.lastAt, current.lastScore, null);
  return observations;
}

export function readingToShadowSample(reading: CombinedPcrReading): ShadowSample {
  return {
    timestamp: reading.timestamp,
    candidateState: reading.signalState,
    confirmedState: reading.confirmedState,
    pendingState: reading.pendingState,
    combinedScore: reading.combinedScore,
    slope: reading.slope,
    confirmationCount: reading.confirmationCount,
  };
}