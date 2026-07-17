// Phase 3A — Direction merger.
// Deterministic, no formulas: tallies canonical biases and reports the
// consensus. Missing modules are honoured as UNAVAILABLE — never guessed.

import type { CanonicalBias, CanonicalSignals, DirectionResult } from "./types";

type BiasKey = "decision" | "pcr" | "gti" | "breadth" | "astro" | "gann" | "gannGap";
const MODULES: readonly BiasKey[] = [
  "decision", "pcr", "gti", "breadth", "astro", "gann", "gannGap",
];

export function normaliseBias(b: CanonicalBias | undefined): CanonicalBias {
  if (!b) return "UNAVAILABLE";
  return b;
}

export function mergeDirection(signals: CanonicalSignals): DirectionResult {
  let bull = 0, bear = 0, neu = 0, conflict = 0, unavail = 0;
  const reasons: string[] = [];
  for (const k of MODULES) {
    const bias = normaliseBias(signals[k]);
    if (bias === "BULLISH") { bull++; reasons.push(`${k}: bullish`); }
    else if (bias === "BEARISH") { bear++; reasons.push(`${k}: bearish`); }
    else if (bias === "NEUTRAL") { neu++; reasons.push(`${k}: neutral`); }
    else if (bias === "CONFLICT") { conflict++; reasons.push(`${k}: conflict`); }
    else { unavail++; reasons.push(`${k}: unavailable`); }
  }

  const present = bull + bear + neu + conflict;
  const dominant = Math.max(bull, bear, neu);
  let bias: CanonicalBias = "UNAVAILABLE";
  if (present === 0) bias = "UNAVAILABLE";
  else if (conflict > 0 && dominant <= conflict) bias = "CONFLICT";
  else if (bull >= 2 && bull > bear) bias = "BULLISH";
  else if (bear >= 2 && bear > bull) bias = "BEARISH";
  else if (bull > 0 && bear > 0) bias = "CONFLICT";
  else if (neu >= bull && neu >= bear && neu > 0) bias = "NEUTRAL";
  else if (bull > bear) bias = "BULLISH";
  else if (bear > bull) bias = "BEARISH";
  else bias = "NEUTRAL";

  // Alignment-driven confidence:  |bull-bear| / (present) * 100, capped by decisionConfidence.
  const rawAlign = present === 0 ? 0 : Math.abs(bull - bear) / present;
  const decisionConf = typeof signals.decisionConfidence === "number"
    ? Math.max(0, Math.min(100, signals.decisionConfidence))
    : null;
  let confidence = Math.round(rawAlign * 100);
  if (decisionConf != null) confidence = Math.min(confidence, decisionConf);
  if (bias === "CONFLICT" || bias === "UNAVAILABLE" || bias === "NEUTRAL") {
    confidence = Math.min(confidence, bias === "NEUTRAL" ? 40 : 25);
  }

  return {
    bias,
    bullCount: bull,
    bearCount: bear,
    neutralCount: neu,
    conflictCount: conflict,
    unavailableCount: unavail,
    confidence,
    reasons,
  };
}