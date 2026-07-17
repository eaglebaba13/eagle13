// Phase 3B — Pure deterministic assistant engine. No I/O. No LLM.

import type {
  AssistantModule,
  AssistantResponse,
  CanonicalContext,
} from "./types";
import { RESEARCH_DISCLAIMER } from "./types";
import {
  deriveMarketBias,
  deriveConfidence,
  splitSupportConflict,
  summariseDataQuality,
} from "./evidence";
import {
  buildHeadline,
  buildSummary,
  buildRiskFactors,
  buildWhatWouldChangeTheView,
} from "./narrative";
import { sanitize, sanitizeAll } from "./guardrails";

export function runAssistant(ctx: CanonicalContext): AssistantResponse {
  const bias = deriveMarketBias(ctx.evidence);
  const runtimeDegraded = ctx.runtime.overall !== "READY";
  const confidence = deriveConfidence(ctx.evidence, bias, runtimeDegraded);
  const { supporting, conflicting } = splitSupportConflict(ctx.evidence, bias);
  const quality = summariseDataQuality(ctx.evidence);

  let guardrailViolations = 0;

  const headlineRes = sanitize(buildHeadline(bias, confidence));
  guardrailViolations += headlineRes.violations;

  const summaryRes = sanitize(buildSummary(bias, ctx, supporting, conflicting));
  guardrailViolations += summaryRes.violations;

  const risksRes = sanitizeAll(buildRiskFactors(ctx, bias, conflicting, confidence));
  guardrailViolations += risksRes.violations;

  const changeRes = sanitizeAll(buildWhatWouldChangeTheView(bias, conflicting, ctx));
  guardrailViolations += changeRes.violations;

  const strategyRationaleRes = sanitize(ctx.strategy.rationale);
  guardrailViolations += strategyRationaleRes.violations;

  const strategyContext = {
    ...ctx.strategy,
    rationale: strategyRationaleRes.text,
  };

  const used: AssistantModule[] = [];
  const unavailable: AssistantModule[] = [];
  const stale: AssistantModule[] = [];
  const researchOnly: AssistantModule[] = [];
  for (const e of ctx.evidence) {
    if (!e.available) unavailable.push(e.module);
    else {
      used.push(e.module);
      if (e.freshness === "STALE") stale.push(e.module);
      if (e.freshness === "RESEARCH_DEMO") researchOnly.push(e.module);
    }
  }
  if (ctx.strategy.available) used.push("OPTION_STRATEGY_TERMINAL");
  else unavailable.push("OPTION_STRATEGY_TERMINAL");

  return {
    headline: headlineRes.text,
    marketBias: bias,
    summary: summaryRes.text,
    supportingEvidence: supporting,
    conflictingEvidence: conflicting,
    riskFactors: risksRes.items,
    whatWouldChangeTheView: changeRes.items,
    strategyContext,
    dataQuality: quality,
    confidence,
    disclaimer: RESEARCH_DISCLAIMER,
    generatedAt: ctx.generatedAt,
    sources: { used, unavailable, stale, researchOnly },
    guardrailViolationsPrevented: guardrailViolations,
  };
}

export function answerPreset(res: AssistantResponse, id: string): string {
  switch (id) {
    case "MARKET_BIAS":
      return `Current bias: ${res.marketBias}. Confidence: ${res.confidence}.`;
    case "WHY_BULLISH":
      if (res.marketBias !== "BULLISH") return "The market view is not currently bullish.";
      return `Bullish because: ${res.supportingEvidence.map((s) => s.module).join(", ") || "no supporting modules"}.`;
    case "WHY_BEARISH":
      if (res.marketBias !== "BEARISH") return "The market view is not currently bearish.";
      return `Bearish because: ${res.supportingEvidence.map((s) => s.module).join(", ") || "no supporting modules"}.`;
    case "CONFLICTING_SIGNALS":
      if (res.conflictingEvidence.length === 0) return "No conflicting canonical signals right now.";
      return `Conflicting modules: ${res.conflictingEvidence.map((c) => c.module).join(", ")}.`;
    case "STRATEGY_CONTEXT":
      if (!res.strategyContext.available) return "Strategy context is not currently available.";
      return `${res.strategyContext.preferredCategory}: ${res.strategyContext.rationale}`;
    case "INVALIDATION":
      return res.whatWouldChangeTheView.join(" ") || "No specific invalidation criteria available.";
    case "UNAVAILABLE_MODULES":
      if (res.sources.unavailable.length === 0) return "All canonical modules are available.";
      return `Unavailable: ${res.sources.unavailable.join(", ")}.`;
    case "DATA_RELIABILITY":
      return `Data quality: ${res.dataQuality.label} (live ${res.dataQuality.live}, demo ${res.dataQuality.demo}, stale ${res.dataQuality.stale}, unavailable ${res.dataQuality.unavailable}).`;
    default:
      return "This question is not part of the supported preset.";
  }
}