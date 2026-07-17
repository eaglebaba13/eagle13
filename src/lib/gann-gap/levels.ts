// Phase 2I-B — Gann Square level generator.
//
// Formula (spec §2):
//   squareBase = n * n
//   if squareBase is odd  → level = squareBase
//   if squareBase is even → level = squareBase + 1
//
// Examples (verified in tests):
//   n=149 → 22201 (odd → 22201)
//   n=150 → 22500 → 22501 (even → +1)
//   n=151 → 22801 (odd → 22801)
//   n=152 → 23104 → 23105 (even → +1)

import type { GannSquareLevel } from "./types";

export function gannSquareLevel(n: number): GannSquareLevel {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`gannSquareLevel: n must be a positive integer (got ${n})`);
  }
  const squareBase = n * n;
  const level = squareBase % 2 === 0 ? squareBase + 1 : squareBase;
  return { n, squareBase, level, distance: 0 };
}

/** Smallest n such that gannSquareLevel(n).level >= reference. */
export function nearestGannN(reference: number): number {
  if (!Number.isFinite(reference) || reference <= 1) return 1;
  // Start from floor(sqrt(reference)) and walk up until level >= reference.
  let n = Math.max(1, Math.floor(Math.sqrt(reference)));
  while (gannSquareLevel(n).level < reference) n++;
  while (n > 1 && gannSquareLevel(n - 1).level >= reference) n--;
  return n;
}

export interface GenerateGannGapLevelsInput {
  readonly reference: number;
  readonly below: number;
  readonly above: number;
}

export function generateGannGapLevels(
  input: GenerateGannGapLevelsInput,
): readonly GannSquareLevel[] {
  const { reference, below, above } = input;
  if (!Number.isFinite(reference)) return [];
  const anchor = nearestGannN(reference);
  const out: GannSquareLevel[] = [];
  for (let i = -below; i <= above; i++) {
    const n = anchor + i;
    if (n < 1) continue;
    const l = gannSquareLevel(n);
    out.push({ ...l, distance: l.level - reference });
  }
  // Deterministic order: ascending by n.
  return out.sort((a, b) => a.n - b.n);
}