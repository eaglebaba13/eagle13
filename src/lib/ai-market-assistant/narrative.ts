// Phase 3B — Deterministic template narrative. No LLM.

import type {
  AssistantBias,
  AssistantConfidence,
  CanonicalContext,
  EvidenceItem,
} from "./types";

export function buildHeadline(bias: AssistantBias, confidence: AssistantConfidence): string {
  if (bias === "UNAVAILABLE") return "Market view unavailable — insufficient canonical data.";
  if (bias === "CONFLICT") return "Signals are conflicting — directional conviction is limited.";
  const conf =
    confidence === "HIGH" ? "with broad alignment"
    : confidence === "MEDIUM" ? "with moderate alignment"
    : confidence === "LOW" ? "with weak alignment"
    : "";
  const dir =
    bias === "BULLISH" ? "Canonical signals lean bullish"
    : bias === "BEARISH" ? "Canonical signals lean bearish"
    : "Canonical signals are balanced";
  return `${dir} ${conf}.`.replace(/\s+\./, ".");
}

export function buildSummary(
  bias: AssistantBias,
  ctx: CanonicalContext,
  supporting: readonly EvidenceItem[],
  conflicting: readonly EvidenceItem[],
): string {
  if (bias === "UNAVAILABLE") {
    return "Insufficient canonical data is available to form a reliable market view.";
  }
  const sup = supporting.map((s) => s.module).join(", ") || "none";
  const con = conflicting.map((s) => s.module).join(", ") || "none";
  if (bias === "CONFLICT") {
    return `Directional signals disagree. Bullish inputs: ${sup || "n/a"}. Bearish inputs: ${con || "n/a"}. Directional conviction is limited.`;
  }
  const dirWord =
    bias === "BULLISH" ? "broadly bullish"
    : bias === "BEARISH" ? "broadly bearish"
    : "broadly neutral";
  const vixWord =
    ctx.vixRegime === "HIGH" ? "in a high-volatility regime"
    : ctx.vixRegime === "LOW" ? "in a low-volatility regime"
    : ctx.vixRegime === "MID" ? "in a mid-volatility regime"
    : "with volatility regime unknown";
  return `Current canonical signals are ${dirWord} ${vixWord}. Supporting: ${sup}. Conflicting: ${con}.`;
}

export function buildRiskFactors(
  ctx: CanonicalContext,
  bias: AssistantBias,
  conflicting: readonly EvidenceItem[],
  confidence: AssistantConfidence,
): string[] {
  const risks: string[] = [];
  if (confidence === "LOW" || confidence === "UNAVAILABLE") {
    risks.push("Confidence is low or unavailable — treat any view as research-only.");
  }
  if (conflicting.length > 0) {
    risks.push(`Conflicting modules present: ${conflicting.map((c) => c.module).join(", ")}.`);
  }
  if (ctx.runtime.degradedModules.length > 0) {
    risks.push(`Degraded runtime modules: ${ctx.runtime.degradedModules.join(", ")}.`);
  }
  if (ctx.vixRegime === "HIGH") {
    risks.push("Elevated VIX regime — wider swings possible.");
  }
  const demo = ctx.evidence.filter((e) => e.freshness === "RESEARCH_DEMO");
  if (demo.length > 0) {
    risks.push(`Research-demo inputs in the mix: ${demo.map((d) => d.module).join(", ")}.`);
  }
  const stale = ctx.evidence.filter((e) => e.freshness === "STALE");
  if (stale.length > 0) {
    risks.push(`Stale inputs: ${stale.map((s) => s.module).join(", ")}.`);
  }
  if (bias === "CONFLICT") {
    risks.push("Direction is contested — avoid directional conviction until alignment improves.");
  }
  return risks;
}

export function buildWhatWouldChangeTheView(
  bias: AssistantBias,
  conflicting: readonly EvidenceItem[],
  ctx: CanonicalContext,
): string[] {
  const items: string[] = [];
  if (bias === "BULLISH") {
    items.push("A bearish flip in Decision Engine or GTI would weaken the bullish read.");
    items.push("Sustained PCR drop with weak breadth would erode support.");
  } else if (bias === "BEARISH") {
    items.push("A bullish flip in Decision Engine or GTI would weaken the bearish read.");
    items.push("Breadth thrust with rising PCR would erode the bearish read.");
  } else if (bias === "CONFLICT") {
    items.push("Convergence of Decision, GTI and PCR onto a single side would resolve the conflict.");
  } else if (bias === "NEUTRAL") {
    items.push("Directional break in Decision Engine combined with GTI alignment would tilt the view.");
  } else {
    items.push("Restoration of canonical data feeds is required before any view can form.");
  }
  if (conflicting.length > 0) {
    items.push(`Reversal or neutralisation of: ${conflicting.map((c) => c.module).join(", ")}.`);
  }
  if (ctx.runtime.degradedModules.length > 0) {
    items.push("Recovery of degraded runtime modules would raise confidence.");
  }
  return items;
}