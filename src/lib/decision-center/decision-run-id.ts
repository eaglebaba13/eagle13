// Phase 24 — Deterministic Decision Center run ID (FNV-1a).
import type { DecisionEvidenceInput, DecisionResult } from "./decision-center";

export const DECISION_RUN_ID_PREFIX = "DECISION_CENTER_V1";

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeDecisionRunId(inp: DecisionEvidenceInput, res: DecisionResult): string {
  const key = [
    res.version,
    res.state,
    res.score.toFixed(6),
    res.confidence.toFixed(6),
    ...Object.entries(res.supportingRunIds).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`),
    `dh=${res.dataHash ?? ""}`,
    `gates=${res.hardGates.slice().sort().join(",")}`,
    `mt=${inp.minTrades ?? 50}`,
    `mc=${inp.minConfidence ?? 0.55}`,
  ].join("||");
  return `${DECISION_RUN_ID_PREFIX}:${fnv1a(key)}`;
}