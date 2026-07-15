// Phase 21.5 · Stage 1 — Deterministic Research Run ID.
// Uses the same FNV-1a family as computeUnifiedRunId. Does NOT reuse the
// unified run-id function so existing per-run IDs stay byte-stable.

import type { StrategyId } from "./strategy";
import type { UnifiedFormulaId } from "./result";
import type { SplitMode } from "./walk-forward";

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type ResearchRunIdInput = {
  strategies: readonly StrategyId[];
  formula: UnifiedFormulaId;
  splitMode: SplitMode;
  trainingPct: number;
  validationPct: number;
  provider: string;
  dataHash: string;
  from: string;
  to: string;
};

export function computeResearchRunId(input: ResearchRunIdInput): string {
  const key = [
    input.strategies.slice().sort().join(","),
    input.formula,
    input.splitMode,
    input.trainingPct,
    input.validationPct,
    input.provider,
    input.dataHash,
    input.from,
    input.to,
  ].join("|");
  return `RESEARCH_V1:${fnv1a(key)}`;
}