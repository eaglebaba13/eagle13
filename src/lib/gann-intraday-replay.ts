// Phase 21.2 · Stage 4 — pure replay controller for the Absolute-Degree
// Intraday validation flow. Reveals the session candle-by-candle without any
// future access. Snapshot data is passed in from the caller and is never
// mutated here. Spec §§15–16.

import { GANN_ABSOLUTE_INTRADAY_REPLAY_VERSION } from "./engine-version";
import type { RankedLevel } from "./gann-level-ranking";
import type { TimedCandle5m } from "./gann-intraday-touch";
import type { CubeInputs } from "./gann-cube-engine";
import type { InstrumentSymbol } from "./gann-intraday-policy";
import {
  simulateSession,
  type AmbiguousPolicy,
  type SessionSimulation,
} from "./gann-intraday-simulator";

export type ReplayState = {
  version: typeof GANN_ABSOLUTE_INTRADAY_REPLAY_VERSION;
  instrument: InstrumentSymbol;
  ranked: RankedLevel[];
  candles: TimedCandle5m[];
  cubeInputs: Omit<CubeInputs, "level">;
  ambiguousPolicy: AmbiguousPolicy;
  cursor: number; // number of candles revealed (0..candles.length)
};

export function initReplay(args: {
  instrument: InstrumentSymbol;
  ranked: RankedLevel[];
  candles: TimedCandle5m[];
  cubeInputs: Omit<CubeInputs, "level">;
  ambiguousPolicy?: AmbiguousPolicy;
}): ReplayState {
  return {
    version: GANN_ABSOLUTE_INTRADAY_REPLAY_VERSION,
    instrument: args.instrument,
    ranked: args.ranked,
    candles: args.candles,
    cubeInputs: args.cubeInputs,
    ambiguousPolicy: args.ambiguousPolicy ?? "conservative",
    cursor: 0,
  };
}

function clamp(cursor: number, max: number): number {
  if (cursor < 0) return 0;
  if (cursor > max) return max;
  return cursor;
}

export function stepReplay(state: ReplayState, direction: 1 | -1): ReplayState {
  return { ...state, cursor: clamp(state.cursor + direction, state.candles.length) };
}

export function restartReplay(state: ReplayState): ReplayState {
  return { ...state, cursor: 0 };
}

export function jumpReplay(state: ReplayState, cursor: number): ReplayState {
  return { ...state, cursor: clamp(cursor, state.candles.length) };
}

/** Materialise the simulation using ONLY the revealed candles. */
export function computeReplayView(state: ReplayState): SessionSimulation {
  const visible = state.candles.slice(0, state.cursor);
  return simulateSession({
    instrument: state.instrument,
    ranked: state.ranked,
    candles: visible,
    cubeInputs: state.cubeInputs,
    ambiguousPolicy: state.ambiguousPolicy,
  });
}