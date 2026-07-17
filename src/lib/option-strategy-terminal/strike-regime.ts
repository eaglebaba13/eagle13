// Phase 3A — Strike regime selector.
// Pure consumer of India VIX. Does NOT recompute VIX.

import type { StrikeRegime, VixRegime } from "./types";

export function classifyVixRegime(vix: number | null | undefined): VixRegime {
  if (vix == null || !Number.isFinite(vix)) return "UNKNOWN";
  if (vix < 15) return "LOW";
  if (vix < 20) return "MID";
  return "HIGH";
}

/** VIX < 15 → ITM, 15–20 → ATM, >20 → OTM. Never fabricates when VIX is null. */
export function recommendStrikeRegime(vix: number | null | undefined): StrikeRegime {
  const r = classifyVixRegime(vix);
  if (r === "LOW") return "ITM";
  if (r === "MID") return "ATM";
  if (r === "HIGH") return "OTM";
  return "UNKNOWN";
}