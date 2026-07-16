// Phase 24 — Decision Center exports (CSV / JSON / Bundle).
// Provenance-preserving. Zero recomputation.
import type { DecisionEvidenceInput, DecisionResult } from "./decision-center";
import { computeDecisionRunId } from "./decision-run-id";

export function buildDecisionCsv(res: DecisionResult, runId: string): string {
  const rows: string[] = [];
  rows.push("field,value");
  rows.push(`decision_run_id,${runId}`);
  rows.push(`state,${res.state}`);
  rows.push(`score,${res.score.toFixed(6)}`);
  rows.push(`confidence,${res.confidence.toFixed(6)}`);
  rows.push(`weakest,${res.weakestModule ?? ""}`);
  rows.push(`strongest,${res.strongestModule ?? ""}`);
  rows.push(`hard_gates,"${res.hardGates.join("|")}"`);
  rows.push(`missing,"${res.missingEvidence.join("|")}"`);
  rows.push(`data_hash,${res.dataHash ?? ""}`);
  for (const [k, v] of Object.entries(res.supportingRunIds)) rows.push(`run_id.${k},${v}`);
  for (const c of res.components) {
    rows.push(`component.${c.key},${c.present ? c.score.toFixed(6) : "MISSING"}`);
  }
  for (const item of res.checklist) {
    rows.push(`checklist.${item.key},${item.status}`);
  }
  return rows.join("\n");
}

export function buildDecisionJson(res: DecisionResult, runId: string): string {
  return JSON.stringify({ runId, ...res }, null, 2);
}

export function buildDecisionBundle(inp: DecisionEvidenceInput, res: DecisionResult): string {
  const runId = computeDecisionRunId(inp, res);
  return JSON.stringify(
    {
      bundle: "DECISION_CENTER_BUNDLE_V1",
      runId,
      decision: res,
      evidenceRunIds: res.supportingRunIds,
      dataHash: res.dataHash,
      thresholds: {
        minTrades: inp.minTrades ?? 50,
        minConfidence: inp.minConfidence ?? 0.55,
      },
    },
    null,
    2,
  );
}