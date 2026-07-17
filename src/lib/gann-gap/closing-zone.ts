// Phase 2I-B — Closing-zone classifier.
// Given a reference (usually the day's close) and generated Gann levels,
// pick nearest-below / nearest-above and flag indecision / reclaim /
// rejection based on config tolerances. Pure.

import type { GannGapClosingZone, GannSquareLevel } from "./types";
import type { GannGapConfig } from "./config";

export function computeClosingZone(
  reference: number,
  levels: readonly GannSquareLevel[],
  config: GannGapConfig,
): GannGapClosingZone | null {
  if (!Number.isFinite(reference) || levels.length === 0) return null;

  let below: GannSquareLevel | null = null;
  let above: GannSquareLevel | null = null;
  for (const l of levels) {
    if (l.level <= reference && (below === null || l.level > below.level)) below = l;
    if (l.level >= reference && (above === null || l.level < above.level)) above = l;
  }

  const tol = Math.max(
    config.touchToleranceAbs,
    reference * config.touchTolerancePct,
  );
  const band = config.indecisionBandPoints;

  const nearest = [below, above]
    .filter((x): x is GannSquareLevel => x !== null)
    .map((l) => Math.abs(reference - l.level))
    .reduce((a, b) => Math.min(a, b), Infinity);

  const insideIndecisionBand = nearest <= band;

  // Reclaimed above: close is meaningfully above the nearest-below level.
  const reclaimedAbove = below != null && reference - below.level > tol;
  // Rejected below: close is meaningfully below nearest-above level while
  // still very near it (i.e. tested and pushed back).
  const rejectedBelow =
    above != null &&
    above.level - reference > 0 &&
    above.level - reference <= band;

  return {
    reference,
    nearestBelow: below,
    nearestAbove: above,
    insideIndecisionBand,
    reclaimedAbove,
    rejectedBelow,
  };
}