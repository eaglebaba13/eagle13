// Phase 3B — Safe diagnostics for the AI Market Assistant.
// Never expose secrets, URLs, tokens, or raw provider payloads.

import type { AssistantResponse, CanonicalContext } from "./types";

export interface AssistantDiagnostics {
  readonly generatedAt: string;
  readonly durationMs: number;
  readonly bias: string;
  readonly confidence: string;
  readonly evidenceCount: number;
  readonly availableSourceCount: number;
  readonly staleSourceCount: number;
  readonly demoSourceCount: number;
  readonly conflictCount: number;
  readonly guardrailViolationsPrevented: number;
  readonly sourceStates: readonly {
    readonly module: string;
    readonly available: boolean;
    readonly bias: string;
    readonly freshness: string;
  }[];
  readonly errors: readonly string[];
}

export function buildDiagnostics(
  ctx: CanonicalContext,
  res: AssistantResponse,
  durationMs: number,
  errors: readonly string[] = [],
): AssistantDiagnostics {
  const available = ctx.evidence.filter((e) => e.available);
  const stale = ctx.evidence.filter((e) => e.available && e.freshness === "STALE");
  const demo = ctx.evidence.filter((e) => e.available && e.freshness === "RESEARCH_DEMO");
  return {
    generatedAt: res.generatedAt,
    durationMs,
    bias: res.marketBias,
    confidence: res.confidence,
    evidenceCount: ctx.evidence.length,
    availableSourceCount: available.length,
    staleSourceCount: stale.length,
    demoSourceCount: demo.length,
    conflictCount: res.conflictingEvidence.length,
    guardrailViolationsPrevented: res.guardrailViolationsPrevented,
    sourceStates: ctx.evidence.map((e) => ({
      module: e.module,
      available: e.available,
      bias: e.bias,
      freshness: e.freshness,
    })),
    errors: errors.filter(Boolean),
  };
}