// Phase 26 · Stage 5 — Reusable strike filter.
//
// Input: snapshot + AtmMode → deterministic subset of strikes.

import { computeAtm, type AtmMode } from "./atm-engine";
import type { OptionChainSnapshot, OptionChainStrike } from "./types";

export interface StrikeFilterResult {
  readonly included: readonly OptionChainStrike[];
  readonly excluded: readonly OptionChainStrike[];
  readonly atm: number | null;
  readonly firstStrike: number | null;
  readonly lastStrike: number | null;
}

export function filterStrikes(
  snapshot: OptionChainSnapshot,
  mode: AtmMode,
  custom?: number,
): StrikeFilterResult {
  const atm = computeAtm(snapshot.strikes, snapshot.spotPrice, mode, custom);
  const set = new Set(atm.selected);
  const included: OptionChainStrike[] = [];
  const excluded: OptionChainStrike[] = [];
  // Preserve numerical order.
  const sorted = snapshot.strikes.slice().sort((a, b) => a.strike - b.strike);
  for (const s of sorted) {
    if (set.has(s.strike)) included.push(s);
    else excluded.push(s);
  }
  return {
    included,
    excluded,
    atm: atm.atm,
    firstStrike: atm.firstStrike,
    lastStrike: atm.lastStrike,
  };
}