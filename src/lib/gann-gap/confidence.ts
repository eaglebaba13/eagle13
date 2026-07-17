// Phase 2I-B — Confidence band from confirmation vs conflict counts.
// Deterministic. No fabricated %.

import type { GannGapConfidenceBand, GannGapConfirmation } from "./types";

export function deriveConfidence(
  confirmations: readonly GannGapConfirmation[],
  bias: "SUPPORTS_UP" | "SUPPORTS_DOWN",
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
  if (aligned >= 3 && conflict === 0) return "EXPERIMENTAL_HIGH";
  if (aligned >= 2 && conflict <= 1) return "EXPERIMENTAL_MEDIUM";
  return "EXPERIMENTAL_LOW";
}