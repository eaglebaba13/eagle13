// Phase 27 · Stage 1 — Combined PCR signal engine.
//
// Research-only classification. Never emits BUY / SELL. A candidate
// state is confirmed only after 2 consecutive matching readings.

import type { PcrSignalState } from "./types";

export interface SignalInput {
  readonly score: number | null;
  readonly slope: number | null;
}

/**
 * Classify a single reading into one of 7 research states.
 * Bands (score): <=-60 STRONG_CE, -60..-20 CE, -20..-5 BULLISH_WEAKENING,
 * -5..5 NO_TRADE, 5..20 BEARISH_WEAKENING, 20..60 PE, >=60 STRONG_PE.
 * When |score| < 5 we lean on slope sign; when the slope contradicts
 * the score in the outer bands we downgrade one step (weakening).
 */
export function classifyState(input: SignalInput): PcrSignalState {
  const s = input.score;
  if (s == null) return "NO_TRADE";
  const slope = input.slope ?? 0;
  if (s <= -60) return "STRONG_CE_FOCUS";
  if (s >= 60) return "STRONG_PE_FOCUS";
  if (s <= -20) return slope > 2 ? "BULLISH_WEAKENING" : "CE_FOCUS";
  if (s >= 20) return slope < -2 ? "BEARISH_WEAKENING" : "PE_FOCUS";
  if (s < -5) return "BULLISH_WEAKENING";
  if (s > 5) return "BEARISH_WEAKENING";
  return "NO_TRADE";
}

export interface ConfirmationState {
  readonly confirmed: PcrSignalState;
  readonly pending: PcrSignalState;
  readonly count: number;
}

export const INITIAL_CONFIRMATION: ConfirmationState = {
  confirmed: "NO_TRADE",
  pending: "NO_TRADE",
  count: 1,
};

/** Feed a new candidate; requires 2 consecutive matches to confirm. */
export function advanceConfirmation(
  prev: ConfirmationState,
  candidate: PcrSignalState,
): ConfirmationState {
  if (candidate === prev.pending) {
    const count = prev.count + 1;
    if (count >= 2 && candidate !== prev.confirmed) {
      return { confirmed: candidate, pending: candidate, count };
    }
    return { confirmed: prev.confirmed, pending: candidate, count };
  }
  return { confirmed: prev.confirmed, pending: candidate, count: 1 };
}

export function signalReason(state: PcrSignalState, score: number | null, slope: number | null): string {
  const sc = score == null ? "n/a" : score.toFixed(2);
  const sl = slope == null ? "n/a" : slope.toFixed(3);
  return `${state} (score=${sc}, slope=${sl})`;
}