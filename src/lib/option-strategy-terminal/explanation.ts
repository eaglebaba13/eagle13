// Phase 3A — Pure explanation composer for the terminal.
// Consumes canonical biases and produces a "why" narrative. No formulas.

import type { CanonicalSignals, StrategyEngineOutput, VixRegime } from "./types";

function label(bias: string | undefined): string {
  if (!bias || bias === "UNAVAILABLE") return "Unavailable";
  if (bias === "CONFLICT") return "Conflict";
  return bias.charAt(0) + bias.slice(1).toLowerCase();
}

export function composeExplanation(
  signals: CanonicalSignals,
  out: StrategyEngineOutput,
): string {
  const parts: string[] = [];
  parts.push(`Decision ${label(signals.decision)}`);
  parts.push(`PCR ${label(signals.pcr)}`);
  parts.push(`GTI ${label(signals.gti)}`);
  parts.push(`Breadth ${label(signals.breadth)}`);
  parts.push(`Astro ${label(signals.astro)}`);
  parts.push(`Gann ${label(signals.gann)}`);
  parts.push(`Gap Outlook ${label(signals.gannGap)}`);
  parts.push(`VIX ${out.vix != null ? out.vix.toFixed(2) : "unavailable"} (${out.vixRegime})`);
  parts.push(`Preferred strike regime: ${out.strikeRegime}`);
  const top = out.recommended[0];
  if (top) {
    parts.push(`Therefore ${top.profile.label} is preferred (alignment ${top.alignmentPct}%, confidence ${out.direction.confidence}%).`);
  } else {
    parts.push(`No strategy is preferred: ${out.reasons.join("; ") || "insufficient alignment."}`);
  }
  return parts.join(" · ");
}

export function withExplanation(
  signals: CanonicalSignals,
  out: StrategyEngineOutput,
): StrategyEngineOutput {
  return { ...out, explanation: composeExplanation(signals, out) };
}

export function describeVixRegime(r: VixRegime): string {
  if (r === "LOW") return "Low volatility — ITM strikes preferred.";
  if (r === "MID") return "Moderate volatility — ATM strikes preferred.";
  if (r === "HIGH") return "High volatility — OTM strikes preferred.";
  return "Volatility unavailable — strike rule bypassed.";
}