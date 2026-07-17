// Phase 2I-B — Confidence band from confirmation vs conflict counts.
// Deterministic. No fabricated %.

import type { GannGapConfidenceBand, GannGapConfirmation } from "./types";

export function deriveConfidence(
  confirmations: readonly GannGapConfirmation[],
  bias: "SUPPORTS_UP" | "SUPPORTS_DOWN",
  opts: { staleInputs?: boolean } = {},
): GannGapConfidenceBand {
  let aligned = 0;
  let conflict = 0;
  let unavailable = 0;
  for (const c of confirmations) {
    if (c.alignment === bias) aligned++;
    else if (c.alignment === "CONFLICT") conflict++;
    else if (c.alignment === "UNAVAILABLE") unavailable++;
    else if (c.alignment !== "NEUTRAL" && c.alignment !== bias) conflict++;
  }
  if (conflict > aligned) return "EXPERIMENTAL_LOW";
  if (unavailable >= confirmations.length - 1) return "EXPERIMENTAL_LOW";
  const staleDowngrade = opts.staleInputs === true;
  if (aligned >= 3 && conflict === 0) return staleDowngrade ? "EXPERIMENTAL_MEDIUM" : "EXPERIMENTAL_HIGH";
  if (aligned >= 2 && conflict <= 1) return staleDowngrade ? "EXPERIMENTAL_LOW" : "EXPERIMENTAL_MEDIUM";
  return "EXPERIMENTAL_LOW";
}