// Phase 2I-B — Pure Gann Gap outlook classifier.
//
// Given a reference price, generated levels and a closing zone, decide
// PENDING | GAP_UP_RESEARCH | GAP_DOWN_RESEARCH | INDECISION |
// NO_VALID_SETUP | DATA_UNAVAILABLE. Never emits BUY/SELL wording.

import type { GannGapClosingZone, GannGapOutlookLabel } from "./types";

export interface ClassifyInput {
  readonly hasReference: boolean;
  readonly beforeCutoff: boolean;
  readonly zone: GannGapClosingZone | null;
}

export interface ClassifyResult {
  readonly label: GannGapOutlookLabel;
  readonly reasons: readonly string[];
}

export function classifyGannGap(input: ClassifyInput): ClassifyResult {
  const reasons: string[] = [];

  if (!input.hasReference) {
    reasons.push("No reference price available");
    return { label: "DATA_UNAVAILABLE", reasons };
  }
  if (input.beforeCutoff) {
    reasons.push("Waiting for 15:26 IST signal cutoff");
    return { label: "PENDING", reasons };
  }
  const z = input.zone;
  if (!z || (z.nearestBelow == null && z.nearestAbove == null)) {
    reasons.push("No Gann levels straddle the reference price");
    return { label: "NO_VALID_SETUP", reasons };
  }
  if (z.insideIndecisionBand) {
    reasons.push("Close sits inside the indecision band around a Gann level");
    return { label: "INDECISION", reasons };
  }
  if (z.reclaimedAbove && !z.rejectedBelow) {
    reasons.push("Close reclaimed the nearest-below Gann level");
    return { label: "GAP_UP_RESEARCH", reasons };
  }
  if (z.rejectedBelow && !z.reclaimedAbove) {
    reasons.push("Close was rejected below the nearest-above Gann level");
    return { label: "GAP_DOWN_RESEARCH", reasons };
  }
  reasons.push("Reference price does not resolve to a directional bias");
  return { label: "NO_VALID_SETUP", reasons };
}