// Phase 26 · Stage 5 — ATM strike engine.
//
// Deterministic. Given a spot and a strike list, returns the nearest
// strike and expands ATM±N windows. Pure function — no I/O.

import type { OptionChainStrike } from "./types";

export interface AtmResult {
  readonly atm: number | null;
  readonly atmIndex: number;
  readonly selected: readonly number[];
  readonly firstStrike: number | null;
  readonly lastStrike: number | null;
  readonly count: number;
}

export type AtmMode = "ATM" | "ATM_5" | "ATM_10" | "ATM_20" | "CUSTOM";

function radiusFor(mode: AtmMode, custom?: number): number {
  switch (mode) {
    case "ATM": return 0;
    case "ATM_5": return 5;
    case "ATM_10": return 10;
    case "ATM_20": return 20;
    case "CUSTOM": return Math.max(0, Math.floor(custom ?? 0));
  }
}

function sortedStrikes(strikes: readonly OptionChainStrike[]): number[] {
  return strikes.map((s) => s.strike).slice().sort((a, b) => a - b);
}

export function findAtmIndex(strikes: readonly number[], spot: number | null): number {
  if (spot == null || !Number.isFinite(spot) || strikes.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(strikes[0] - spot);
  for (let i = 1; i < strikes.length; i += 1) {
    const d = Math.abs(strikes[i] - spot);
    if (d < bestDist) { best = i; bestDist = d; }
  }
  return best;
}

export function computeAtm(
  strikes: readonly OptionChainStrike[],
  spot: number | null,
  mode: AtmMode,
  custom?: number,
): AtmResult {
  const sorted = sortedStrikes(strikes);
  const idx = findAtmIndex(sorted, spot);
  if (idx < 0) {
    return { atm: null, atmIndex: -1, selected: [], firstStrike: null, lastStrike: null, count: 0 };
  }
  const r = radiusFor(mode, custom);
  const start = Math.max(0, idx - r);
  const end = Math.min(sorted.length - 1, idx + r);
  const selected = sorted.slice(start, end + 1);
  return {
    atm: sorted[idx],
    atmIndex: idx,
    selected,
    firstStrike: selected[0] ?? null,
    lastStrike: selected[selected.length - 1] ?? null,
    count: selected.length,
  };
}